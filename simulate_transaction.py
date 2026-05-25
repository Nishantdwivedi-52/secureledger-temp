#!/usr/bin/env python3
"""
simulate_transaction.py
-----------------------
SecureLedger — Live Transaction Simulator & WebSocket Broadcaster

Two modes of operation:
  1. CLI  — inject a single transaction and see instant risk updates.
  2. Auto — continuously inject random suspicious transactions for demos.

The FastAPI WebSocket endpoint (/ws/live-transactions) is mounted onto
the existing app so the frontend can stream live alerts in real time.

Usage examples:
  # Single injection
  python simulate_transaction.py --from-acc ACC123 --to-acc ACC456 \
      --amount 95000 --fraud 1

  # Auto demo mode (inject every 4 seconds)
  python simulate_transaction.py --auto --interval 4

  # Auto mode with higher fraud rate (0.0–1.0)
  python simulate_transaction.py --auto --fraud-rate 0.9
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import random
import sys
import time
from datetime import datetime, timezone
from typing import Any

# ── Third-party ────────────────────────────────────────────────────────────────
from neo4j import GraphDatabase
from neo4j.exceptions import ServiceUnavailable, ClientError

# ── Optional: rich for beautiful terminal output ───────────────────────────────
try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.text import Text
    from rich import box
    _RICH = True
except ImportError:
    _RICH = False   # graceful fallback to plain print()

# ── FastAPI WebSocket pieces (imported lazily — not needed in pure CLI mode) ───
try:
    from fastapi import WebSocket, WebSocketDisconnect
    _FASTAPI = True
except ImportError:
    _FASTAPI = False


# ════════════════════════════════════════════════════════════════════════════════
# LOGGING
# ════════════════════════════════════════════════════════════════════════════════
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("securelegder.simulator")

console = Console() if _RICH else None


# ════════════════════════════════════════════════════════════════════════════════
# NEO4J CONNECTION
# Mirrors the pattern in graph/graph_queries.py — reads from env vars first.
# ════════════════════════════════════════════════════════════════════════════════
NEO4J_URI      = os.getenv("NEO4J_URI",      "bolt://localhost:7687")
NEO4J_USERNAME = os.getenv("NEO4J_USERNAME", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "secureledger123")

driver = GraphDatabase.driver(
    NEO4J_URI,
    auth=(NEO4J_USERNAME, NEO4J_PASSWORD),
    max_connection_pool_size=10,
    connection_timeout=10,
)


# ════════════════════════════════════════════════════════════════════════════════
# WEBSOCKET CONNECTION MANAGER
# Keeps a registry of every connected frontend client and broadcasts to all.
# Thread-safe for asyncio; guards against dead connections automatically.
# ════════════════════════════════════════════════════════════════════════════════
class LiveTransactionBroadcaster:
    """
    Manages all active WebSocket connections and broadcasts
    transaction events to every connected client.

    Designed to be imported by api/main.py and mounted there, e.g.:

        from simulate_transaction import broadcaster, live_ws_endpoint
        app.add_websocket_route("/ws/live-transactions", live_ws_endpoint)
    """

    def __init__(self) -> None:
        # Active connections — use a set so duplicates are impossible
        self._clients: set[Any] = set()
        # Rolling buffer of the last N events for late-joining clients
        self._history: list[dict] = []
        self._history_limit = 50

    async def connect(self, websocket: Any) -> None:
        await websocket.accept()
        self._clients.add(websocket)
        logger.info(
            "WS client connected — total active: %d", len(self._clients)
        )
        # Replay recent history so the new client has immediate context
        if self._history:
            try:
                await websocket.send_json({
                    "type":   "history",
                    "events": self._history,
                })
            except Exception:
                pass  # client may have disconnected immediately

    def disconnect(self, websocket: Any) -> None:
        self._clients.discard(websocket)
        logger.info(
            "WS client disconnected — total active: %d", len(self._clients)
        )

    async def broadcast(self, event: dict) -> None:
        """
        Send an event to every connected client.
        Silently removes any client that has already closed its connection.
        """
        # Buffer the event for late joiners
        self._history.append(event)
        if len(self._history) > self._history_limit:
            self._history.pop(0)

        dead: set[Any] = set()
        for client in self._clients:
            try:
                await client.send_json(event)
            except Exception:
                dead.add(client)

        # Prune dead connections
        for client in dead:
            self._clients.discard(client)

    @property
    def client_count(self) -> int:
        return len(self._clients)


# Module-level singleton — imported by api/main.py
broadcaster = LiveTransactionBroadcaster()


# ════════════════════════════════════════════════════════════════════════════════
# WEBSOCKET ENDPOINT
# Paste this route registration into api/main.py:
#
#   from simulate_transaction import broadcaster, live_ws_endpoint
#   app.add_api_websocket_route("/ws/live-transactions", live_ws_endpoint)
# ════════════════════════════════════════════════════════════════════════════════
async def live_ws_endpoint(websocket: "WebSocket") -> None:
    """
    WebSocket endpoint: /ws/live-transactions

    Frontend connection example (JavaScript):

        const ws = new WebSocket("ws://localhost:8000/ws/live-transactions");
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "transaction") showAlert(data);
            if (data.type === "history")     loadHistory(data.events);
        };

    Event schema (type == "transaction"):
    {
        "type":          "transaction",
        "from_acc":      "ACC123",
        "to_acc":        "ACC456",
        "amount":        95000.0,
        "fraud":         1,
        "timestamp":     "2024-01-15T10:30:00Z",
        "risk_before":   { "from": 0.45, "to": 0.30 },
        "risk_after":    { "from": 0.87, "to": 0.72 },
        "alert_level":   "CRITICAL",          # INFO / WARNING / CRITICAL
        "payment_format": "WIRE"
    }
    """
    await broadcaster.connect(websocket)
    try:
        # Keep the connection alive by listening for pings / control messages
        while True:
            try:
                msg = await asyncio.wait_for(
                    websocket.receive_text(), timeout=30.0
                )
                # Echo ping/pong to keep proxies from closing the connection
                if msg == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # Send a heartbeat so the client knows we're alive
                try:
                    await websocket.send_json({"type": "heartbeat"})
                except Exception:
                    break
    except Exception:
        pass
    finally:
        broadcaster.disconnect(websocket)


# ════════════════════════════════════════════════════════════════════════════════
# RISK SCORING HELPERS
# Lightweight local risk propagation — updates only the two affected accounts
# so the demo feels instant without re-scoring the entire graph.
# ════════════════════════════════════════════════════════════════════════════════

def _get_account_risk(account_id: str) -> dict:
    """
    Fetch the current risk profile for a single account.
    Returns zeroes if the account doesn't exist yet (auto-created).
    """
    query = """
    MATCH (a:Account {id: $account_id})
    OPTIONAL MATCH (a)-[t:TRANSACTION]-()
    RETURN
        a.anomaly_score    AS anomaly_score,
        a.fraud_prob       AS fraud_prob,
        a.risk_score       AS risk_score,
        count(t)           AS tx_count
    """
    try:
        with driver.session() as session:
            result = session.run(query, account_id=account_id).single()
            if not result:
                return {"anomaly_score": 0.0, "fraud_prob": 0.0,
                        "risk_score": 0.0, "tx_count": 0}
            return {
                "anomaly_score": float(result["anomaly_score"] or 0),
                "fraud_prob":    float(result["fraud_prob"]    or 0),
                "risk_score":    float(result["risk_score"]    or 0),
                "tx_count":      int(result["tx_count"]        or 0),
            }
    except Exception as exc:
        logger.error("Could not fetch risk for %s: %s", account_id, exc)
        return {"anomaly_score": 0.0, "fraud_prob": 0.0,
                "risk_score": 0.0, "tx_count": 0}


def _propagate_risk(account_id: str, fraud_flag: int) -> dict:
    """
    Re-compute a lightweight risk score for a single account based on:
      - Fraction of its transactions flagged as laundering
      - Number of high-risk neighbours (anomaly_score > 0.7)
      - Whether this new transaction is fraudulent

    This is NOT a full GNN pass — it's a fast heuristic update designed
    to give the demo immediate visual feedback.

    Returns the new risk scores so we can show the delta in the terminal.
    """
    query = """
    MATCH (a:Account {id: $account_id})
    OPTIONAL MATCH (a)-[t:TRANSACTION]-()
    WITH a,
         count(t)                                                AS total_tx,
         count(CASE WHEN t.is_laundering = 1 THEN 1 END)        AS fraud_tx
    OPTIONAL MATCH (a)-[:TRANSACTION]-(neighbour:Account)
    WITH a, total_tx, fraud_tx,
         count(CASE WHEN neighbour.anomaly_score > 0.7
                    THEN 1 END)                                  AS risky_neighbours,
         count(neighbour)                                        AS total_neighbours

    // Heuristic score — blended from local fraud ratio + neighbour risk
    WITH a,
         CASE WHEN total_tx > 0
              THEN toFloat(fraud_tx) / total_tx
              ELSE 0.0 END                                       AS local_fraud_ratio,
         CASE WHEN total_neighbours > 0
              THEN toFloat(risky_neighbours) / total_neighbours
              ELSE 0.0 END                                       AS neighbour_risk_ratio

    // Weighted blend: 60% own history, 30% neighbourhood, 10% flag boost
    WITH a,
         (local_fraud_ratio   * 0.6 +
          neighbour_risk_ratio * 0.3 +
          $fraud_boost         * 0.1)                           AS new_score

    SET a.anomaly_score = round(new_score, 4),
        a.risk_score    = round(new_score, 4)

    RETURN
        a.anomaly_score AS anomaly_score,
        a.fraud_prob    AS fraud_prob,
        a.risk_score    AS risk_score
    """
    try:
        with driver.session() as session:
            result = session.run(
                query,
                account_id=account_id,
                fraud_boost=float(fraud_flag),
            ).single()
            if not result:
                return {"anomaly_score": 0.0, "fraud_prob": 0.0, "risk_score": 0.0}
            return {
                "anomaly_score": float(result["anomaly_score"] or 0),
                "fraud_prob":    float(result["fraud_prob"]    or 0),
                "risk_score":    float(result["risk_score"]    or 0),
            }
    except Exception as exc:
        logger.error("Risk propagation failed for %s: %s", account_id, exc)
        return {"anomaly_score": 0.0, "fraud_prob": 0.0, "risk_score": 0.0}


# ════════════════════════════════════════════════════════════════════════════════
# CORE INJECTION LOGIC
# ════════════════════════════════════════════════════════════════════════════════

# Payment formats pool for realistic simulation
_PAYMENT_FORMATS = [
    "WIRE", "ACH", "CRYPTO", "SWIFT", "CASH", "ZELLE", "HAWALA"
]

# Suspicious narrative templates for auto mode
_NARRATIVES = [
    "INVOICE PAYMENT",
    "CONSULTING FEE",
    "PROPERTY TRANSFER",
    "LOAN REPAYMENT",
    "TRADE FINANCE",
    "CHARITY DONATION",
    "URGENT TRANSFER",
]


def inject_transaction(
    from_acc:       str,
    to_acc:         str,
    amount:         float,
    fraud:          int,
    payment_format: str = "WIRE",
) -> dict:
    """
    Inject a single transaction into Neo4j.

    - Creates both Account nodes if they don't exist (MERGE).
    - Creates the TRANSACTION relationship with full metadata.
    - Returns the injected record as a plain dict.
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    query = """
    // Create or match both accounts — safe to run on existing nodes
    MERGE (src:Account {id: $from_acc})
    ON CREATE SET
        src.anomaly_score = 0.0,
        src.fraud_prob    = 0.0,
        src.risk_score    = 0.0,
        src.created_at    = $timestamp

    MERGE (dst:Account {id: $to_acc})
    ON CREATE SET
        dst.anomaly_score = 0.0,
        dst.fraud_prob    = 0.0,
        dst.risk_score    = 0.0,
        dst.created_at    = $timestamp

    // Always create a new transaction edge (no dedup — each call is a new tx)
    CREATE (src)-[t:TRANSACTION {
        amount_paid:    $amount,
        is_laundering:  $fraud,
        payment_format: $payment_format,
        timestamp:      $timestamp,
        simulated:      true
    }]->(dst)

    RETURN
        src.id AS from_acc,
        dst.id AS to_acc,
        t.amount_paid    AS amount,
        t.is_laundering  AS fraud,
        t.payment_format AS payment_format,
        t.timestamp      AS timestamp
    """
    try:
        with driver.session() as session:
            result = session.run(
                query,
                from_acc=from_acc,
                to_acc=to_acc,
                amount=amount,
                fraud=fraud,
                payment_format=payment_format,
                timestamp=timestamp,
            ).single()
            return dict(result) if result else {}
    except (ServiceUnavailable, ClientError) as exc:
        logger.error("Transaction injection failed: %s", exc)
        raise RuntimeError(f"Failed to inject transaction: {exc}") from exc


def _alert_level(amount: float, fraud: int, risk_after: float) -> str:
    """Classify the severity of an injected transaction for UI display."""
    if fraud == 1 and (amount > 50_000 or risk_after > 0.8):
        return "CRITICAL"
    if fraud == 1 or amount > 10_000 or risk_after > 0.6:
        return "WARNING"
    return "INFO"


def simulate_one(
    from_acc:       str,
    to_acc:         str,
    amount:         float,
    fraud:          int,
    payment_format: str = "WIRE",
) -> dict:
    """
    Full simulation pipeline for a single transaction:
      1. Capture risk BEFORE injection.
      2. Inject the transaction.
      3. Propagate risk on both accounts.
      4. Capture risk AFTER.
      5. Return a rich event dict ready for terminal display + WS broadcast.
    """
    # ── Snapshot risk before ───────────────────────────────────────────────────
    risk_before = {
        "from": _get_account_risk(from_acc)["anomaly_score"],
        "to":   _get_account_risk(to_acc)["anomaly_score"],
    }

    # ── Inject ─────────────────────────────────────────────────────────────────
    record = inject_transaction(from_acc, to_acc, amount, fraud, payment_format)

    # ── Propagate risk on both endpoints only ──────────────────────────────────
    _propagate_risk(from_acc, fraud)
    _propagate_risk(to_acc,   fraud)

    # ── Snapshot risk after ────────────────────────────────────────────────────
    risk_after = {
        "from": _get_account_risk(from_acc)["anomaly_score"],
        "to":   _get_account_risk(to_acc)["anomaly_score"],
    }

    max_risk_after = max(risk_after["from"], risk_after["to"])

    event = {
        "type":           "transaction",
        "from_acc":       from_acc,
        "to_acc":         to_acc,
        "amount":         round(amount, 2),
        "fraud":          fraud,
        "payment_format": payment_format,
        "timestamp":      record.get("timestamp", datetime.now(timezone.utc).isoformat()),
        "risk_before":    risk_before,
        "risk_after":     risk_after,
        "risk_delta": {
            "from": round(risk_after["from"] - risk_before["from"], 4),
            "to":   round(risk_after["to"]   - risk_before["to"],   4),
        },
        "alert_level": _alert_level(amount, fraud, max_risk_after),
    }

    return event


# ════════════════════════════════════════════════════════════════════════════════
# TERMINAL DISPLAY  (rich if available, plain-text fallback)
# ════════════════════════════════════════════════════════════════════════════════

_ALERT_COLOURS = {
    "CRITICAL": "bold red",
    "WARNING":  "bold yellow",
    "INFO":     "bold green",
}

_ALERT_ICONS = {
    "CRITICAL": "🚨",
    "WARNING":  "⚠️ ",
    "INFO":     "✅",
}


def _print_event_rich(event: dict) -> None:
    """Render a transaction event using Rich for beautiful terminal output."""
    level  = event["alert_level"]
    colour = _ALERT_COLOURS.get(level, "white")
    icon   = _ALERT_ICONS.get(level, "•")

    # ── Header panel ──────────────────────────────────────────────────────────
    title = Text(
        f"{icon}  SECURELEGDER — LIVE TRANSACTION  {icon}", style=colour
    )
    console.print(Panel(title, box=box.DOUBLE_EDGE, style=colour))

    # ── Transaction details table ─────────────────────────────────────────────
    tx_table = Table(
        title="Transaction Details",
        box=box.ROUNDED,
        show_header=True,
        header_style="bold cyan",
    )
    tx_table.add_column("Field",  style="cyan",  min_width=18)
    tx_table.add_column("Value",  style="white", min_width=30)

    fraud_text = (
        Text("YES — FLAGGED 🚩", style="bold red")
        if event["fraud"]
        else Text("No",          style="green")
    )

    tx_table.add_row("From Account",    event["from_acc"])
    tx_table.add_row("To Account",      event["to_acc"])
    tx_table.add_row("Amount",          f"${event['amount']:>14,.2f}")
    tx_table.add_row("Payment Format",  event["payment_format"])
    tx_table.add_row("Fraud Flag",      fraud_text)
    tx_table.add_row("Alert Level",     Text(level, style=colour))
    tx_table.add_row("Timestamp",       event["timestamp"])
    console.print(tx_table)

    # ── Risk delta table ──────────────────────────────────────────────────────
    risk_table = Table(
        title="Risk Score Impact",
        box=box.ROUNDED,
        show_header=True,
        header_style="bold magenta",
    )
    risk_table.add_column("Account",    style="cyan",   min_width=18)
    risk_table.add_column("Before",     style="white",  min_width=10)
    risk_table.add_column("After",      style="white",  min_width=10)
    risk_table.add_column("Δ Change",   style="white",  min_width=12)

    for side, label in (("from", event["from_acc"]), ("to", event["to_acc"])):
        before = event["risk_before"][side]
        after  = event["risk_after"][side]
        delta  = event["risk_delta"][side]

        delta_str = (
            Text(f"+{delta:.4f} ▲", style="bold red")
            if delta > 0
            else Text(f"{delta:.4f} ▼", style="green")
            if delta < 0
            else Text(f" {delta:.4f}  ", style="dim")
        )
        risk_table.add_row(
            label,
            f"{before:.4f}",
            f"{after:.4f}",
            delta_str,
        )

    console.print(risk_table)
    console.rule(style="dim")


def _print_event_plain(event: dict) -> None:
    """Plain-text fallback when Rich is not installed."""
    sep  = "=" * 60
    icon = _ALERT_ICONS.get(event["alert_level"], "•")
    print(f"\n{sep}")
    print(f"  {icon}  SECURELEGDER — LIVE TRANSACTION  {icon}")
    print(sep)
    print(f"  From       : {event['from_acc']}")
    print(f"  To         : {event['to_acc']}")
    print(f"  Amount     : ${event['amount']:,.2f}")
    print(f"  Format     : {event['payment_format']}")
    print(f"  Fraud      : {'YES 🚩' if event['fraud'] else 'No'}")
    print(f"  Alert      : {event['alert_level']}")
    print(f"  Time       : {event['timestamp']}")
    print()
    print("  Risk Score Changes:")
    for side, label in (("from", event["from_acc"]), ("to", event["to_acc"])):
        before = event["risk_before"][side]
        after  = event["risk_after"][side]
        delta  = event["risk_delta"][side]
        arrow  = "▲" if delta > 0 else ("▼" if delta < 0 else "─")
        print(f"    {label:<20}  {before:.4f} → {after:.4f}  {arrow} {delta:+.4f}")
    print(sep)


def print_event(event: dict) -> None:
    """Dispatch to Rich or plain-text printer."""
    if _RICH and console:
        _print_event_rich(event)
    else:
        _print_event_plain(event)


# ════════════════════════════════════════════════════════════════════════════════
# AUTO MODE — random continuous injection for demo presentations
# ════════════════════════════════════════════════════════════════════════════════

# A realistic pool of account IDs to pick from — replace with IDs from your
# actual dataset by reading the first N accounts from Neo4j at startup.
_ACCOUNT_POOL: list[str] = []


def _load_account_pool(size: int = 200) -> None:
    """
    Pre-load a pool of real account IDs from Neo4j so auto mode
    generates transactions between accounts that actually exist.
    Falls back to generated IDs if Neo4j is empty.
    """
    global _ACCOUNT_POOL
    query = """
    MATCH (a:Account)
    WHERE a.id IS NOT NULL
    RETURN a.id AS id
    ORDER BY rand()
    LIMIT $size
    """
    try:
        with driver.session() as session:
            results = session.run(query, size=size)
            _ACCOUNT_POOL = [r["id"] for r in results]
        if _ACCOUNT_POOL:
            logger.info(
                "Loaded %d real account IDs for simulation pool.", len(_ACCOUNT_POOL)
            )
    except Exception as exc:
        logger.warning("Could not load account pool from Neo4j: %s", exc)

    if not _ACCOUNT_POOL:
        # Synthetic fallback — generate plausible-looking IDs
        _ACCOUNT_POOL = [f"ACC{str(i).zfill(6)}" for i in range(1, 201)]
        logger.info("Using %d synthetic account IDs.", len(_ACCOUNT_POOL))


def _random_transaction(fraud_rate: float = 0.6) -> tuple[str, str, float, int, str]:
    """
    Generate a random transaction with a bias towards suspiciously
    large or round-number amounts (a known AML signal).

    Returns (from_acc, to_acc, amount, fraud, payment_format).
    """
    from_acc = random.choice(_ACCOUNT_POOL)
    to_acc   = random.choice([a for a in _ACCOUNT_POOL if a != from_acc])

    # Suspicious amount patterns: large round numbers, just-below-threshold
    amount_pattern = random.choices(
        ["round_large", "just_below", "random_large", "normal"],
        weights=[0.3, 0.3, 0.2, 0.2],
    )[0]

    if amount_pattern == "round_large":
        # Structuring: suspiciously round large amounts
        amount = round(random.choice([
            10_000, 25_000, 50_000, 75_000, 100_000, 250_000
        ]) * random.uniform(0.98, 1.02), 2)
    elif amount_pattern == "just_below":
        # Just below reporting threshold ($10k in the US)
        amount = round(random.uniform(9_000, 9_999), 2)
    elif amount_pattern == "random_large":
        amount = round(random.uniform(15_000, 500_000), 2)
    else:
        amount = round(random.uniform(100, 9_000), 2)

    fraud          = 1 if random.random() < fraud_rate else 0
    payment_format = random.choice(_PAYMENT_FORMATS)

    return from_acc, to_acc, amount, fraud, payment_format


async def _auto_loop(
    interval:   float,
    fraud_rate: float,
    max_count:  int,
) -> None:
    """
    Coroutine: inject random transactions in a loop.
    Broadcasts each event to all connected WebSocket clients.
    """
    _load_account_pool()

    if _RICH and console:
        console.print(
            Panel(
                f"[bold green]🤖  AUTO MODE ACTIVE[/bold green]\n"
                f"Injecting every [cyan]{interval}s[/cyan] | "
                f"Fraud rate: [red]{fraud_rate * 100:.0f}%[/red] | "
                f"Max: {'∞' if max_count < 0 else max_count}",
                box=box.DOUBLE_EDGE,
                style="green",
            )
        )
    else:
        print(
            f"\n{'=' * 60}\n"
            f"  AUTO MODE: every {interval}s | "
            f"fraud_rate={fraud_rate:.0%} | "
            f"max={'∞' if max_count < 0 else max_count}\n"
            f"{'=' * 60}"
        )

    count = 0
    while max_count < 0 or count < max_count:
        from_acc, to_acc, amount, fraud, fmt = _random_transaction(fraud_rate)

        try:
            event = simulate_one(from_acc, to_acc, amount, fraud, fmt)
        except RuntimeError as exc:
            logger.error("Simulation step failed: %s", exc)
            await asyncio.sleep(interval)
            continue

        print_event(event)

        # Broadcast to any live WebSocket clients
        if broadcaster.client_count > 0:
            await broadcaster.broadcast(event)
            logger.debug(
                "Broadcast to %d WS client(s).", broadcaster.client_count
            )

        count += 1
        await asyncio.sleep(interval)

    if _RICH and console:
        console.print("[green]✅  Auto mode complete.[/green]")
    else:
        print("\n✅  Auto mode complete.")


# ════════════════════════════════════════════════════════════════════════════════
# WEBSOCKET-ONLY BROADCAST HELPER
# Call this from anywhere in the FastAPI app to push a real-time alert.
# ════════════════════════════════════════════════════════════════════════════════

async def broadcast_transaction(event: dict) -> None:
    """
    Public helper: push any event dict to all connected WS clients.

    Example — call from a fraud detection pipeline after scoring:
        await broadcast_transaction({
            "type": "transaction",
            "from_acc": "ACC001",
            ...
        })
    """
    await broadcaster.broadcast(event)


# ════════════════════════════════════════════════════════════════════════════════
# CLI ENTRY POINT
# ════════════════════════════════════════════════════════════════════════════════

def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="simulate_transaction",
        description=(
            "SecureLedger — Live Transaction Simulator\n"
            "Inject fake (or real test) transactions into Neo4j and watch\n"
            "risk scores update in real time."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    # ── Single injection mode ──────────────────────────────────────────────────
    single = parser.add_argument_group("Single injection mode")
    single.add_argument("--from-acc",  type=str,   help="Source account ID")
    single.add_argument("--to-acc",    type=str,   help="Destination account ID")
    single.add_argument("--amount",    type=float, help="Transaction amount")
    single.add_argument(
        "--fraud", type=int, choices=[0, 1], default=0,
        help="Fraud flag: 1 = suspicious, 0 = clean (default: 0)"
    )
    single.add_argument(
        "--format", type=str,
        choices=_PAYMENT_FORMATS,
        default="WIRE",
        help="Payment format (default: WIRE)",
    )

    # ── Auto mode ─────────────────────────────────────────────────────────────
    auto = parser.add_argument_group("Auto demo mode")
    auto.add_argument(
        "--auto", action="store_true",
        help="Continuously inject random transactions"
    )
    auto.add_argument(
        "--interval", type=float, default=4.0,
        help="Seconds between injections in auto mode (default: 4)"
    )
    auto.add_argument(
        "--fraud-rate", type=float, default=0.7,
        help="Fraction of auto-mode transactions flagged as fraud, 0.0–1.0 (default: 0.7)"
    )
    auto.add_argument(
        "--count", type=int, default=-1,
        help="Number of transactions to inject in auto mode; -1 = infinite (default: -1)"
    )

    return parser


def main() -> None:
    parser = _build_parser()
    args   = parser.parse_args()

    # ── Auto mode ─────────────────────────────────────────────────────────────
    if args.auto:
        if not 0.0 <= args.fraud_rate <= 1.0:
            parser.error("--fraud-rate must be between 0.0 and 1.0")
        try:
            asyncio.run(
                _auto_loop(
                    interval=args.interval,
                    fraud_rate=args.fraud_rate,
                    max_count=args.count,
                )
            )
        except KeyboardInterrupt:
            if _RICH and console:
                console.print("\n[yellow]⏹  Simulation stopped by user.[/yellow]")
            else:
                print("\n⏹  Simulation stopped by user.")
        return

    # ── Single injection mode ──────────────────────────────────────────────────
    missing = [
        flag for flag, val in [
            ("--from-acc", args.from_acc),
            ("--to-acc",   args.to_acc),
            ("--amount",   args.amount),
        ]
        if val is None
    ]
    if missing:
        parser.error(
            f"Single injection mode requires: {', '.join(missing)}\n"
            f"Or use --auto for continuous simulation."
        )

    try:
        event = simulate_one(
            from_acc=args.from_acc,
            to_acc=args.to_acc,
            amount=args.amount,
            fraud=args.fraud,
            payment_format=args.format,
        )
    except RuntimeError as exc:
        if _RICH and console:
            console.print(f"[bold red]❌  Error:[/bold red] {exc}")
        else:
            print(f"\n❌  Error: {exc}", file=sys.stderr)
        sys.exit(1)

    print_event(event)

    # Exit code signals alert level to shell scripts / CI pipelines
    sys.exit({"CRITICAL": 2, "WARNING": 1, "INFO": 0}.get(event["alert_level"], 0))


if __name__ == "__main__":
    main()