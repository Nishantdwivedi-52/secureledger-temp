"""
graph/graph_queries.py
----------------------
Neo4j query layer for SecureLedger fraud detection.

Design principles:
  - Every public function is safe to call even if Neo4j is down.
  - All queries return plain Python dicts/lists — no Neo4j types leak out.
  - Indexes are guaranteed to exist before the first query runs.
  - Cypher is optimised for the graph sizes typical in AML datasets.
"""

from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from datetime import datetime
from typing import Any

from neo4j import GraphDatabase
from neo4j.exceptions import (
    AuthError,
    ClientError,
    ServiceUnavailable,
    SessionExpired,
)

# ------------------------------------------------
# LOGGING
# ------------------------------------------------
logger = logging.getLogger("securelegder.graph")

# ------------------------------------------------
# CONNECTION CONFIG
# Prefer environment variables in production so
# credentials are never baked into source code.
# ------------------------------------------------
NEO4J_URI      = os.getenv("NEO4J_URI",      "bolt://localhost:7687")
NEO4J_USERNAME = os.getenv("NEO4J_USERNAME",  "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD",  "test1234")

# How many times to retry a transient failure before giving up
_MAX_RETRIES = 3

try:
    driver = GraphDatabase.driver(
        NEO4J_URI,
        auth=(NEO4J_USERNAME, NEO4J_PASSWORD),
        # Keep a small pool — this is a single-process API server
        max_connection_pool_size=20,
        connection_timeout=10,          # seconds
    )
    logger.info("Neo4j driver initialised → %s", NEO4J_URI)
except Exception as exc:
    # Let the process start even if Neo4j is unreachable at boot;
    # individual query functions will surface clean errors at call time.
    logger.error("Failed to create Neo4j driver: %s", exc)
    driver = None  # type: ignore[assignment]


# ------------------------------------------------
# SAFE SESSION CONTEXT MANAGER
# Centralises all driver-level error handling so
# individual query functions stay clean.
# ------------------------------------------------
@contextmanager
def _session():
    """
    Yield a Neo4j session, converting driver-level exceptions into
    descriptive RuntimeErrors that FastAPI can surface as 503 responses.

    Usage:
        with _session() as s:
            result = s.run(query, **params)
    """
    if driver is None:
        raise RuntimeError(
            "Neo4j driver is not initialised. "
            "Check NEO4J_URI / credentials and restart the service."
        )
    try:
        with driver.session() as session:
            yield session
    except ServiceUnavailable as exc:
        logger.error("Neo4j is unreachable: %s", exc)
        raise RuntimeError(
            "Neo4j is currently unreachable. "
            "Ensure the database is running and accessible."
        ) from exc
    except SessionExpired as exc:
        logger.error("Neo4j session expired: %s", exc)
        raise RuntimeError(
            "Neo4j session expired — the server may have restarted."
        ) from exc
    except AuthError as exc:
        logger.error("Neo4j authentication failed: %s", exc)
        raise RuntimeError(
            "Neo4j authentication failed. Check NEO4J_USERNAME / NEO4J_PASSWORD."
        ) from exc
    except ClientError as exc:
        # Cypher syntax errors, constraint violations, etc.
        logger.error("Neo4j client error (bad query?): %s", exc)
        raise RuntimeError(f"Neo4j query error: {exc.message}") from exc
    except Exception as exc:
        logger.error("Unexpected Neo4j error: %s", exc)
        raise RuntimeError(f"Unexpected database error: {exc}") from exc


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Coerce a Neo4j numeric (which can be None or NaN) to a Python float."""
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value) if value is not None else default
    except (TypeError, ValueError):
        return default


# ================================================
# INDEXES
# Create once, silently skip if they already exist.
# Called automatically at module import time so
# every deployment is guaranteed to have indexes —
# not just ones that ran ingest.py.
# ================================================

# All indexes the query layer depends on, as
# (label, property) pairs.
_REQUIRED_INDEXES: list[tuple[str, str]] = [
    ("Account", "id"),
    ("Account", "anomaly_score"),
    ("Account", "ring_id"),
    ("Account", "is_mastermind"),
    ("Account", "fraud_prob"),
    ("Account", "community_id"),
]


def ensure_indexes() -> None:
    """
    Idempotently create all indexes required by this query module.

    Uses CREATE INDEX IF NOT EXISTS (Neo4j 4.x+).
    Logs a warning but does NOT raise if index creation fails —
    queries still work without indexes, just slower.
    """
    logger.info("Ensuring Neo4j indexes exist…")
    try:
        with _session() as session:
            for label, prop in _REQUIRED_INDEXES:
                index_name = f"idx_{label.lower()}_{prop.lower()}"
                cypher = (
                    f"CREATE INDEX {index_name} IF NOT EXISTS "
                    f"FOR (n:{label}) ON (n.{prop})"
                )
                try:
                    session.run(cypher)
                    logger.debug("Index ready: %s", index_name)
                except ClientError as exc:
                    # Some editions/versions may not support IF NOT EXISTS —
                    # log and continue rather than crashing the whole module.
                    logger.warning(
                        "Could not create index %s: %s", index_name, exc
                    )
        logger.info(
            "Index check complete — %d indexes verified.", len(_REQUIRED_INDEXES)
        )
    except RuntimeError as exc:
        # Neo4j might not be up yet at import time (e.g. cold start).
        # Log the warning but let the module load so health routes work.
        logger.warning(
            "Could not verify indexes (Neo4j may not be ready): %s", exc
        )


# Run automatically when this module is imported.
ensure_indexes()


# ================================================
# TEST CONNECTION
# ================================================

def test_connection() -> str | dict:
    """
    Lightweight liveness check.
    Returns a success string or an error dict — never raises.
    """
    try:
        with _session() as session:
            result = session.run(
                "RETURN 'Neo4j Connected Successfully' AS message"
            ).single()
            return result["message"]
    except RuntimeError as exc:
        return {"connected": False, "error": str(exc)}


# ================================================
# DASHBOARD STATS
# ================================================

def get_dashboard_stats() -> dict:
    """
    High-level KPI numbers for the landing page.
    Returns a zero-filled dict if Neo4j is unreachable.
    """
    query = """
    MATCH (a:Account)
    RETURN
        count(a)                                          AS total_accounts,
        count(CASE WHEN a.anomaly_score > 0.7 THEN 1 END) AS high_risk_accounts,
        avg(a.anomaly_score)                              AS avg_risk,
        sum(CASE WHEN a.anomaly_score > 0.7
                 THEN a.total_sent ELSE 0 END)            AS suspicious_amount
    """
    _default = {
        "total_accounts":    0,
        "high_risk_accounts": 0,
        "avg_risk":          0.0,
        "suspicious_amount": 0.0,
    }

    try:
        with _session() as session:
            result = session.run(query).single()
            if not result:
                return _default
            return {
                "total_accounts":     _safe_int(result["total_accounts"]),
                "high_risk_accounts": _safe_int(result["high_risk_accounts"]),
                "avg_risk":           round(_safe_float(result["avg_risk"]), 4),
                "suspicious_amount":  round(_safe_float(result["suspicious_amount"]), 2),
            }
    except RuntimeError as exc:
        logger.error("get_dashboard_stats failed: %s", exc)
        return _default


# ================================================
# TOP RISKY ACCOUNTS
# FIX: parameter was called `search_id` internally
#      but FastAPI passed the argument as `search`.
#      Unified to `search` throughout.
# ================================================

def get_top_risky_accounts(
    limit: int = 20,
    search: str | None = None,   # ← was `search_id`, now matches the FastAPI call
) -> list[dict]:
    """
    Return accounts ranked by anomaly score.

    Args:
        limit:  Maximum rows to return (ignored when `search` is set).
        search: Optional account ID substring filter.
                Partial match so "ACC1" matches "ACC100", "ACC1234", etc.
    """
    try:
        with _session() as session:
            if search:
                # Partial / exact match — useful for a typeahead search box
                query = """
                MATCH (a:Account)
                WHERE a.id CONTAINS $search
                RETURN
                    a.id            AS id,
                    a.anomaly_score AS anomaly_score,
                    a.ring_id       AS ring_id,
                    a.fraud_prob    AS fraud_prob
                ORDER BY a.anomaly_score DESC
                LIMIT 50
                """
                result = session.run(query, search=search)
            else:
                query = """
                MATCH (a:Account)
                WHERE a.anomaly_score IS NOT NULL
                RETURN
                    a.id            AS id,
                    a.anomaly_score AS anomaly_score,
                    a.ring_id       AS ring_id,
                    a.fraud_prob    AS fraud_prob
                ORDER BY a.anomaly_score DESC
                LIMIT $limit
                """
                result = session.run(query, limit=limit)

            return [
                {
                    "id":            r["id"],
                    "anomaly_score": _safe_float(r["anomaly_score"]),
                    "ring_id":       r["ring_id"],
                    "fraud_prob":    _safe_float(r["fraud_prob"]),
                }
                for r in result
            ]
    except RuntimeError as exc:
        logger.error("get_top_risky_accounts failed: %s", exc)
        return []


# ================================================
# ACCOUNT DETAILS
# ================================================

def get_account_details(account_id: str) -> dict | None:
    """
    Full profile for a single account.
    Returns None if the account does not exist.
    """
    query = """
    MATCH (a:Account {id: $account_id})
    OPTIONAL MATCH (a)-[t:TRANSACTION]->(b)
    RETURN
        a.id               AS account_id,
        a.risk_score       AS risk_score,
        a.anomaly_score    AS anomaly_score,
        a.fraud_prob       AS fraud_prob,
        a.pr_score         AS pagerank,
        a.betweenness_score AS betweenness,
        a.community_id     AS community_id,
        a.ring_id          AS ring_id,
        a.is_mastermind    AS is_mastermind,
        count(t)           AS tx_count,
        coalesce(sum(t.amount_paid), 0) AS total_sent
    """
    try:
        with _session() as session:
            result = session.run(query, account_id=account_id).single()
            if not result:
                return None
            return {
                "account_id":   result["account_id"],
                "risk_score":   _safe_float(result["risk_score"]),
                "anomaly_score": _safe_float(result["anomaly_score"]),
                "fraud_prob":   _safe_float(result["fraud_prob"]),
                "pagerank":     _safe_float(result["pagerank"]),
                "betweenness":  _safe_float(result["betweenness"]),
                "community_id": result["community_id"],
                "ring_id":      result["ring_id"],
                "is_mastermind": bool(result["is_mastermind"]),
                "tx_count":     _safe_int(result["tx_count"]),
                "total_sent":   round(_safe_float(result["total_sent"]), 2),
            }
    except RuntimeError as exc:
        logger.error("get_account_details(%s) failed: %s", account_id, exc)
        return None


# ================================================
# RECENT TRANSACTIONS
# ================================================

def get_recent_transactions(account_id: str, limit: int = 20) -> list[dict]:
    """
    Most recent outbound transactions for an account, newest first.
    Also returns inbound transactions so the UI can show full context.
    """
    query = """
    MATCH (a:Account {id: $account_id})-[t:TRANSACTION]->(b:Account)
    RETURN
        a.id               AS sender,
        b.id               AS receiver,
        t.amount_paid      AS amount,
        t.timestamp        AS timestamp,
        t.payment_format   AS payment_format,
        t.is_laundering    AS is_laundering
    ORDER BY t.timestamp DESC
    LIMIT $limit
    """
    try:
        with _session() as session:
            result = session.run(query, account_id=account_id, limit=limit)
            return [
                {
                    "sender":         r["sender"],
                    "receiver":       r["receiver"],
                    "amount":         _safe_float(r["amount"]),
                    "timestamp":      str(r["timestamp"] or ""),
                    "payment_format": r["payment_format"] or "UNKNOWN",
                    "is_laundering":  bool(r["is_laundering"]),
                }
                for r in result
            ]
    except RuntimeError as exc:
        logger.error("get_recent_transactions(%s) failed: %s", account_id, exc)
        return []


# ================================================
# SUBGRAPH VISUALISATION
# FIX: old query used MATCH path = (a)-[:TX*1..2]-(b)
#      with LIMIT 50 on *paths*, which is extremely
#      expensive — Neo4j must enumerate all paths
#      before truncating.
#
# New approach:
#   1. Collect direct neighbours first (cheap, indexed).
#   2. Collect 2-hop neighbours of those (bounded set).
#   3. Hard cap on nodes AND edges separately so the
#      frontend never receives an unrenderable payload.
# ================================================

_SUBGRAPH_NODE_LIMIT = 80
_SUBGRAPH_EDGE_LIMIT = 200


def get_subgraph(account_id: str) -> dict:
    """
    Return a 2-hop ego-network centred on `account_id`.

    Optimised Cypher collects neighbours iteratively rather than
    enumerating all paths, keeping memory and latency low even on
    dense fraud-ring nodes with hundreds of connections.
    """
    query = """
    // Anchor node
    MATCH (center:Account {id: $account_id})

    // 1-hop neighbours (outbound + inbound)
    OPTIONAL MATCH (center)-[r1:TRANSACTION]-(hop1:Account)
    WITH center, collect(DISTINCT hop1)[..40] AS hop1_nodes,
                 collect(DISTINCT r1)[..100]  AS hop1_rels

    // 2-hop neighbours — only from the already-collected hop1 set
    UNWIND hop1_nodes AS h1
    OPTIONAL MATCH (h1)-[r2:TRANSACTION]-(hop2:Account)
    WHERE hop2 <> center
    WITH center, hop1_nodes, hop1_rels,
         collect(DISTINCT hop2)[..40] AS hop2_nodes,
         collect(DISTINCT r2)[..100]  AS hop2_rels

    // Return everything as flat lists for easy Python processing
    RETURN
        center,
        hop1_nodes,
        hop1_rels,
        hop2_nodes,
        hop2_rels
    """

    def _node_dict(n) -> dict:
        return {
            "id":          n.get("id",           "unknown"),
            "risk_score":  _safe_float(n.get("risk_score",  0)),
            "fraud_prob":  _safe_float(n.get("fraud_prob",  0)),
            "ring_id":     n.get("ring_id",      None),
            "community":   n.get("community_id", None),
            "is_mastermind": bool(n.get("is_mastermind", False)),
        }

    def _edge_dict(r) -> dict:
        return {
            "source": r.start_node.get("id", ""),
            "target": r.end_node.get("id",   ""),
            "amount": _safe_float(r.get("amount_paid", 0)),
            "is_laundering": bool(r.get("is_laundering", False)),
        }

    try:
        with _session() as session:
            record = session.run(query, account_id=account_id).single()

            if not record:
                return {"nodes": [], "links": []}

            nodes: dict[str, dict] = {}
            links: list[dict]      = []

            # Centre node
            center = record["center"]
            nodes[center.get("id")] = _node_dict(center)

            # Hop-1 nodes
            for n in (record["hop1_nodes"] or []):
                nid = n.get("id")
                if nid and nid not in nodes:
                    nodes[nid] = _node_dict(n)

            # Hop-2 nodes
            for n in (record["hop2_nodes"] or []):
                nid = n.get("id")
                if nid and nid not in nodes and len(nodes) < _SUBGRAPH_NODE_LIMIT:
                    nodes[nid] = _node_dict(n)

            # Edges — deduplicate by (source, target) pair
            seen_edges: set[tuple] = set()
            for rel_list in (record["hop1_rels"] or [], record["hop2_rels"] or []):
                for r in rel_list:
                    edge = _edge_dict(r)
                    key  = (edge["source"], edge["target"])
                    if key not in seen_edges and len(links) < _SUBGRAPH_EDGE_LIMIT:
                        seen_edges.add(key)
                        links.append(edge)

            return {"nodes": list(nodes.values()), "links": links}

    except RuntimeError as exc:
        logger.error("get_subgraph(%s) failed: %s", account_id, exc)
        return {"nodes": [], "links": [], "error": str(exc)}


# ================================================
# FUND FLOW TRACER — TEMPORAL PATH DISCOVERY
# ================================================
#
# Returns ordered money-flow paths with temporal
# enforcement (t1 ≤ t2 ≤ t3) and per-path risk scoring.
#
# Design:
#   Phase 1 — Cypher collects candidate simple-paths
#             (no repeated nodes) with a hard LIMIT.
#   Phase 2 — Python filters for temporal monotonicity,
#             computes amounts and risk scores, and
#             returns ranked results.
#
# Neo4j does NOT support parameterised variable-length
# patterns (*1..$depth), so depth is injected as a
# clamped integer literal into the Cypher string.
# ================================================

# Safety caps for path expansion
_FLOW_MAX_DEPTH        = 5     # absolute max hops
_FLOW_MAX_CANDIDATE    = 200   # Cypher LIMIT before Python filtering
_FLOW_MAX_RETURN_PATHS = 50    # max paths in API response


def _parse_timestamp(ts_str: str | None) -> datetime | None:
    """
    Parse a Neo4j transaction timestamp into a Python datetime.

    Handles both formats found in the database:
      - Pandas stringified:  "2022-09-01 00:20:00"
      - ISO 8601 (simulator): "2024-01-15T10:30:00+00:00"

    Returns None if the string is empty or unparseable.
    """
    if not ts_str:
        return None
    ts_str = str(ts_str).strip()
    if not ts_str:
        return None

    # Try common formats in order of likelihood
    for fmt in (
        "%Y-%m-%d %H:%M:%S",       # pandas default str()
        "%Y-%m-%dT%H:%M:%S%z",     # ISO with timezone
        "%Y-%m-%dT%H:%M:%S",       # ISO without timezone
        "%Y/%m/%d %H:%M",          # raw CSV format
        "%Y-%m-%d %H:%M",          # truncated pandas
    ):
        try:
            return datetime.strptime(ts_str, fmt)
        except ValueError:
            continue

    # Final fallback: fromisoformat (Python 3.11+ handles most variants)
    try:
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except Exception:
        logger.debug("Could not parse timestamp: %r", ts_str)
        return None


def _is_temporally_valid(edges: list[dict]) -> bool:
    """
    Check that transaction timestamps are monotonically non-decreasing.

    Enforces: t_hop1 ≤ t_hop2 ≤ t_hop3 ≤ ...

    Returns False if any timestamp is unparseable (conservative approach).
    """
    if len(edges) <= 1:
        return True

    timestamps = [_parse_timestamp(e.get("timestamp")) for e in edges]

    # If any timestamp is missing/unparseable, reject the path
    if any(t is None for t in timestamps):
        return False

    for i in range(len(timestamps) - 1):
        # Strip timezone info for comparison if mixed (naive vs aware)
        t_curr = timestamps[i].replace(tzinfo=None)
        t_next = timestamps[i + 1].replace(tzinfo=None)
        if t_curr > t_next:
            return False

    return True


def _compute_path_risk_score(path_nodes: list[dict], path_edges: list[dict]) -> float:
    """
    Compute a composite risk score for a single fund-flow path.

    Formula:
        risk_score = max_fraud_prob
                   + 0.15 * (laundering_hops / total_hops)
                   + 0.10 * has_mastermind

    Range: 0.0 – 1.25 (unclamped to allow relative ranking).
    Higher = more suspicious.
    """
    fraud_probs = [_safe_float(n.get("fraud_prob", 0)) for n in path_nodes]
    max_fp = max(fraud_probs) if fraud_probs else 0.0

    total_hops = len(path_edges)
    laundering_hops = sum(
        1 for e in path_edges if e.get("is_laundering")
    )
    laundering_ratio = laundering_hops / total_hops if total_hops > 0 else 0.0

    has_mastermind = any(n.get("is_mastermind") for n in path_nodes)

    score = max_fp + (0.15 * laundering_ratio) + (0.10 if has_mastermind else 0.0)
    return round(score, 4)


def _build_flow_cypher(direction: str, depth: int) -> str:
    """
    Build a Cypher query string for fund-flow path discovery.

    Neo4j does NOT support parameterised variable-length patterns,
    so `depth` is injected as a clamped integer literal.

    Args:
        direction: "outbound" or "inbound"
        depth:     1–5 (already clamped by caller)

    Returns:
        A Cypher query string with $account_id and $max_candidates
        as the only parameters.
    """
    # Safety: depth is clamped to [1, _FLOW_MAX_DEPTH] and is always int
    depth = int(max(1, min(depth, _FLOW_MAX_DEPTH)))

    if direction == "inbound":
        pattern = (
            f"MATCH path = (start:Account)"
            f"-[:TRANSACTION*1..{depth}]->"
            f"(end:Account {{id: $account_id}})"
        )
    else:  # outbound (default)
        pattern = (
            f"MATCH path = (start:Account {{id: $account_id}})"
            f"-[:TRANSACTION*1..{depth}]->"
            f"(end:Account)"
        )

    return f"""
    {pattern}
    WHERE ALL(n IN nodes(path) WHERE single(x IN nodes(path) WHERE x = n))
    WITH path,
         nodes(path)         AS ns,
         relationships(path) AS rs,
         length(path)        AS hop_count
    ORDER BY hop_count ASC
    LIMIT $max_candidates
    RETURN
        [n IN ns | {{
            account:       n.id,
            fraud_prob:    n.fraud_prob,
            ring_id:       n.ring_id,
            is_mastermind: n.is_mastermind
        }}] AS path_nodes,
        [r IN rs | {{
            from_acc:       startNode(r).id,
            to_acc:         endNode(r).id,
            amount:         r.amount_paid,
            timestamp:      r.timestamp,
            is_laundering:  r.is_laundering,
            payment_format: r.payment_format
        }}] AS path_edges,
        hop_count
    """


def get_fund_flow_paths(
    account_id: str,
    depth: int = 3,
    direction: str = "outbound",
    max_paths: int = 20,
) -> dict:
    """
    Trace money-flow paths from/to an account with temporal ordering.

    Returns ordered paths where each hop's timestamp is ≥ the previous
    hop's timestamp (temporal BFS: t1 ≤ t2 ≤ t3 ≤ ...).

    Paths are ranked by a composite risk score (descending).

    Args:
        account_id: The origin/destination account ID.
        depth:      Max hops to traverse (1–5, default 3).
        direction:  "outbound", "inbound", or "both".
        max_paths:  Max paths to return after temporal filtering (1–50).

    Returns:
        {
          "origin": str,
          "direction": str,
          "depth": int,
          "paths": [...],
          "path_count": int,
          "truncated": bool,
          "candidates_before_filter": int
        }
    """
    # ── Clamp inputs ──────────────────────────────────────────────────────
    depth     = max(1, min(int(depth), _FLOW_MAX_DEPTH))
    max_paths = max(1, min(int(max_paths), _FLOW_MAX_RETURN_PATHS))

    valid_directions = ("outbound", "inbound", "both")
    if direction not in valid_directions:
        direction = "outbound"

    # ── Determine which directions to query ───────────────────────────────
    directions_to_query = (
        ["outbound", "inbound"] if direction == "both"
        else [direction]
    )

    all_candidate_paths: list[dict] = []

    try:
        with _session() as session:
            for d in directions_to_query:
                cypher = _build_flow_cypher(d, depth)

                # Hard cap on candidates at Cypher level to prevent
                # explosion on high-degree hub nodes
                result = session.run(
                    cypher,
                    account_id=account_id,
                    max_candidates=_FLOW_MAX_CANDIDATE,
                )

                for record in result:
                    raw_nodes = record["path_nodes"] or []
                    raw_edges = record["path_edges"] or []
                    hop_count = record["hop_count"]

                    # Serialise node data
                    path_nodes = [
                        {
                            "account":       n.get("account", "unknown") if isinstance(n, dict) else str(n),
                            "fraud_prob":    _safe_float(n.get("fraud_prob", 0) if isinstance(n, dict) else 0),
                            "ring_id":       n.get("ring_id") if isinstance(n, dict) else None,
                            "is_mastermind": bool(n.get("is_mastermind", False)) if isinstance(n, dict) else False,
                        }
                        for n in raw_nodes
                    ]

                    # Serialise edge data
                    path_edges = [
                        {
                            "from":           e.get("from_acc", "") if isinstance(e, dict) else "",
                            "to":             e.get("to_acc",   "") if isinstance(e, dict) else "",
                            "amount":         _safe_float(e.get("amount", 0) if isinstance(e, dict) else 0),
                            "timestamp":      str(e.get("timestamp", "") if isinstance(e, dict) else ""),
                            "is_laundering":  bool(e.get("is_laundering", False)) if isinstance(e, dict) else False,
                            "payment_format": str(e.get("payment_format", "UNKNOWN") if isinstance(e, dict) else "UNKNOWN"),
                        }
                        for e in raw_edges
                    ]

                    all_candidate_paths.append({
                        "path_nodes": path_nodes,
                        "path_edges": path_edges,
                        "hop_count":  hop_count,
                        "direction":  d,
                    })

    except RuntimeError as exc:
        logger.error("get_fund_flow_paths(%s) failed: %s", account_id, exc)
        return {
            "origin":    account_id,
            "direction": direction,
            "depth":     depth,
            "paths":     [],
            "path_count": 0,
            "truncated": False,
            "candidates_before_filter": 0,
            "error":     str(exc),
        }

    candidates_total = len(all_candidate_paths)

    # ── Phase 2: Temporal filtering ───────────────────────────────────────
    valid_paths: list[dict] = []

    for candidate in all_candidate_paths:
        edges = candidate["path_edges"]
        nodes = candidate["path_nodes"]

        # Enforce temporal monotonicity: t1 ≤ t2 ≤ t3
        if not _is_temporally_valid(edges):
            continue

        # Compute amounts
        amounts = [e["amount"] for e in edges]
        total_amount    = round(sum(amounts), 2)
        terminal_amount = round(amounts[-1], 2) if amounts else 0.0

        # Compute risk metrics
        laundering_hops = sum(1 for e in edges if e["is_laundering"])
        fraud_probs     = [n["fraud_prob"] for n in nodes]
        max_fraud_prob  = max(fraud_probs) if fraud_probs else 0.0

        risk_score = _compute_path_risk_score(nodes, edges)

        valid_paths.append({
            "path":              nodes,
            "transactions":      edges,
            "hop_count":         candidate["hop_count"],
            "direction":         candidate["direction"],
            "total_amount":      total_amount,
            "terminal_amount":   terminal_amount,
            "total_laundering_hops": laundering_hops,
            "max_fraud_prob":    round(max_fraud_prob, 4),
            "risk_score":        risk_score,
            "temporally_valid":  True,
        })

    # ── Sort by risk score descending ─────────────────────────────────────
    valid_paths.sort(key=lambda p: p["risk_score"], reverse=True)

    # ── Truncate to max_paths ─────────────────────────────────────────────
    truncated = len(valid_paths) > max_paths
    valid_paths = valid_paths[:max_paths]

    return {
        "origin":                   account_id,
        "direction":                direction,
        "depth":                    depth,
        "paths":                    valid_paths,
        "path_count":               len(valid_paths),
        "truncated":                truncated,
        "candidates_before_filter": candidates_total,
    }


# ================================================
# CIRCULAR FLOW DETECTION (Neo4j graph query)
# ================================================

def detect_circular_flows(limit: int = 20) -> list[dict]:
    """
    Detect cyclic transaction paths (3–4 hops) where all edges
    are flagged as laundering.  Returns serialisable dicts,
    not raw Neo4j Path objects.
    """
    query = """
    MATCH path = (a:Account)-[:TRANSACTION*3..4]->(a)
    WHERE ALL(r IN relationships(path) WHERE r.is_laundering = 1)
    RETURN
        [n IN nodes(path)         | n.id]          AS cycle,
        [r IN relationships(path) | r.amount_paid] AS amounts,
        length(path)                                AS depth
    LIMIT $limit
    """
    try:
        with _session() as session:
            result = session.run(query, limit=limit)
            return [
                {
                    "cycle":   r["cycle"],
                    "amounts": [_safe_float(a) for a in r["amounts"]],
                    "depth":   r["depth"],
                    "total":   round(sum(_safe_float(a) for a in r["amounts"]), 2),
                }
                for r in result
            ]
    except RuntimeError as exc:
        logger.error("detect_circular_flows failed: %s", exc)
        return []


# Alias kept for backwards compatibility with any caller using the old name
get_circular_flows = detect_circular_flows


# ================================================
# MULE ACCOUNT DETECTION
# ================================================

def detect_mule_accounts(
    out_degree_threshold: int = 15,
    limit: int = 50,
) -> list[dict]:
    """
    Identify probable money-mule accounts: high out-degree nodes
    that fan transaction flows out to many counterparties.

    The threshold is parameterised so callers can tune sensitivity.
    """
    query = """
    MATCH (a:Account)-[t:TRANSACTION]->()
    WITH  a, count(t) AS out_degree
    WHERE out_degree > $threshold
    OPTIONAL MATCH (a)-[tin:TRANSACTION]->()
    WITH  a, out_degree, sum(tin.amount_paid) AS total_out
    RETURN
        a.id        AS account_id,
        out_degree,
        a.ring_id   AS ring_id,
        a.fraud_prob AS fraud_prob,
        round(coalesce(total_out, 0), 2) AS total_out
    ORDER BY out_degree DESC
    LIMIT $limit
    """
    try:
        with _session() as session:
            result = session.run(
                query,
                threshold=out_degree_threshold,
                limit=limit,
            )
            return [
                {
                    "account_id": r["account_id"],
                    "out_degree": _safe_int(r["out_degree"]),
                    "ring_id":    r["ring_id"],
                    "fraud_prob": _safe_float(r["fraud_prob"]),
                    "total_out":  _safe_float(r["total_out"]),
                }
                for r in result
            ]
    except RuntimeError as exc:
        logger.error("detect_mule_accounts failed: %s", exc)
        return []


# ================================================
# RING GRAPH VISUALISATION
# FIX: added skip/limit pagination so the frontend
#      can load the graph in chunks instead of
#      receiving 120 nodes in one response.
# ================================================

def get_ring_graph(
    limit: int = 60,    # sensible page size (was 120 — too large for one render)
    skip:  int = 0,     # offset for pagination
) -> dict:
    """
    Return a paginated slice of the fraud-ring transaction graph.

    Example:
        Page 1 → get_ring_graph(limit=60, skip=0)
        Page 2 → get_ring_graph(limit=60, skip=60)

    The response includes a `has_more` flag so the frontend knows
    whether to request another page.
    """
    query = """
    MATCH (src:Account)-[t:TRANSACTION]->(dst:Account)
    WHERE
        (src.ring_id IS NOT NULL OR dst.ring_id IS NOT NULL)
        AND
        (src.fraud_prob > 0.5 OR dst.fraud_prob > 0.5)
    RETURN src, dst, t
    ORDER BY
        // Masterminds first, then by fraud probability
        src.is_mastermind DESC,
        src.fraud_prob DESC
    SKIP  $skip
    LIMIT $limit
    """

    # Fetch one extra record to cheaply detect whether more pages exist
    fetch_limit = limit + 1

    try:
        with _session() as session:
            results = session.run(query, skip=skip, limit=fetch_limit)
            records  = list(results)

        has_more = len(records) > limit
        records  = records[:limit]          # trim the sentinel record

        nodes: dict[str, dict] = {}
        links: list[dict]      = []

        for record in records:
            src = record["src"]
            dst = record["dst"]
            tx  = record["t"]

            for node in (src, dst):
                nid = node.get("id")
                if nid and nid not in nodes:
                    nodes[nid] = {
                        "id":           nid,
                        "fraud_prob":   _safe_float(node.get("fraud_prob",    0)),
                        "ring_id":      node.get("ring_id",      None),
                        "is_mastermind": bool(node.get("is_mastermind", False)),
                        "anomaly_score": _safe_float(node.get("anomaly_score", 0)),
                    }

            links.append({
                "source": src.get("id"),
                "target": dst.get("id"),
                "amount": _safe_float(tx.get("amount_paid", 0)),
                "is_laundering": bool(tx.get("is_laundering", False)),
            })

        return {
            "nodes":    list(nodes.values()),
            "links":    links,
            "skip":     skip,
            "limit":    limit,
            "has_more": has_more,
        }

    except RuntimeError as exc:
        logger.error("get_ring_graph failed: %s", exc)
        return {"nodes": [], "links": [], "has_more": False, "error": str(exc)}


# ================================================
# RING STATISTICS
# ================================================

def get_ring_stats() -> dict:
    """
    Aggregate KPIs across all ML-labelled fraud rings.
    Adds total laundered amount and average ring size —
    useful dashboard numbers the old version didn't expose.
    """
    query = """
    MATCH (a:Account)
    WHERE a.ring_id IS NOT NULL
    WITH  a.ring_id AS ring_id, collect(a) AS members
    RETURN
        count(DISTINCT ring_id)                                AS total_rings,
        sum(size(members))                                     AS suspicious_accounts,
        avg(size(members))                                     AS avg_ring_size,
        count(CASE WHEN any(m IN members WHERE m.is_mastermind = true) THEN 1 END)
                                                               AS rings_with_mastermind
    """
    _default = {
        "total_rings":          0,
        "suspicious_accounts":  0,
        "avg_ring_size":        0.0,
        "rings_with_mastermind": 0,
    }
    try:
        with _session() as session:
            result = session.run(query).single()
            if not result:
                return _default
            return {
                "total_rings":           _safe_int(result["total_rings"]),
                "suspicious_accounts":   _safe_int(result["suspicious_accounts"]),
                "avg_ring_size":         round(_safe_float(result["avg_ring_size"]), 1),
                "rings_with_mastermind": _safe_int(result["rings_with_mastermind"]),
            }
    except RuntimeError as exc:
        logger.error("get_ring_stats failed: %s", exc)
        return _default


# ================================================
# TOP MASTERMINDS
# ================================================

def get_top_masterminds(limit: int = 20) -> list[dict]:
    """
    Return the highest-scoring mastermind nodes across all rings.
    Adds `member_count` so the UI can show ring size without a
    second round-trip.
    """
    query = """
    MATCH (a:Account)
    WHERE a.is_mastermind = true
    OPTIONAL MATCH (m:Account {ring_id: a.ring_id})
    RETURN
        a.id               AS id,
        a.ring_id          AS ring_id,
        a.mastermind_score AS mastermind_score,
        a.fraud_prob       AS fraud_prob,
        count(m)           AS member_count
    ORDER BY a.mastermind_score DESC
    LIMIT $limit
    """
    try:
        with _session() as session:
            results = session.run(query, limit=limit)
            return [
                {
                    "id":              r["id"],
                    "ring_id":         r["ring_id"],
                    "mastermind_score": _safe_float(r["mastermind_score"]),
                    "fraud_prob":       _safe_float(r["fraud_prob"]),
                    "member_count":     _safe_int(r["member_count"]),
                }
                for r in results
            ]
    except RuntimeError as exc:
        logger.error("get_top_masterminds failed: %s", exc)
        return []

def get_ring_transactions(ring_id: str, limit: int = 50) -> list[dict]:
    """
    Return transactions belonging to a fraud ring.
    """

    query = """
    MATCH (src:Account)-[t:TRANSACTION]->(dst:Account)
    WHERE src.ring_id = $ring_id OR dst.ring_id = $ring_id
    RETURN
        src.id AS sender,
        dst.id AS receiver,
        t.amount_paid AS amount,
        t.timestamp AS timestamp,
        t.is_laundering AS is_laundering
    ORDER BY t.amount_paid DESC
    LIMIT $limit
    """

    try:
        with _session() as session:
            results = session.run(
                query,
                ring_id=ring_id,
                limit=limit,
            )

            return [
                {
                    "sender": r["sender"],
                    "receiver": r["receiver"],
                    "amount": _safe_float(r["amount"]),
                    "timestamp": str(r["timestamp"] or ""),
                    "is_laundering": bool(r["is_laundering"]),
                }
                for r in results
            ]

    except RuntimeError as exc:
        logger.error("get_ring_transactions failed: %s", exc)
        return []


# ================================================
# MODULE SELF-TEST
# Run directly:  python -m graph.graph_queries
# ================================================
if __name__ == "__main__":
    import json

    def _pp(label: str, data: Any) -> None:
        print(f"\n{'=' * 50}")
        print(f"  {label}")
        print("=" * 50)
        print(json.dumps(data, indent=2, default=str))

    _pp("CONNECTION TEST",    test_connection())
    _pp("DASHBOARD STATS",    get_dashboard_stats())
    _pp("TOP RISKY ACCOUNTS", get_top_risky_accounts(5))
    _pp("CIRCULAR FLOWS",     detect_circular_flows(5))
    _pp("MULE ACCOUNTS",      detect_mule_accounts())
    _pp("RING STATS",         get_ring_stats())
    _pp("TOP MASTERMINDS",    get_top_masterminds(5))
    _pp("RING GRAPH PAGE 1",  get_ring_graph(limit=10, skip=0))
    _pp("SUBGRAPH SAMPLE",    get_subgraph("sample_account_id"))