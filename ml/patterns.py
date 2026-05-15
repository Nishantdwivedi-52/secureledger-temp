"""
ml/patterns.py
Fraud Ring Detection — Louvain + 4 AML Typologies + Mastermind Ranking

Typologies detected:
  1. Circular Fund Flow    — DFS cycle (3–4 hops) with laundering edges
  2. Mule Account Network  — fan-in > 5 unique senders
  3. Currency Layering     — pay_currency ≠ recv_currency in high-risk cluster
  4. Dormant Activation    — >10 transactions condensed in 2-day window

Ring identification:
  - Louvain community detection on fraud_prob > 0.5 subgraph
  - Ring = community with ≥ 3 nodes and ≥ 1 laundering edge
  - Mastermind = 0.5 × PageRank + 0.5 × Betweenness Centrality

Saves ml/rings.json and writes community_id / mastermind_score back to graph.
"""

import json
import os
from collections import defaultdict
from datetime import timedelta

import community as community_louvain
import networkx as nx
import pandas as pd
from dotenv import load_dotenv

from ingest import load_graph, save_graph

load_dotenv()

GRAPH_PATH  = os.getenv("GRAPH_PATH", "ml/graph.gpickle")
RINGS_PATH  = os.getenv("RINGS_PATH", "ml/rings.json")
FRAUD_THRESH  = float(os.getenv("LOUVAIN_FRAUD_PROB_THRESHOLD", 0.5))
RING_MIN_NODES = int(os.getenv("RING_MIN_NODES", 3))


# ── Pattern detectors ─────────────────────────────────────────────────────────

def detect_circular_flows(G: nx.DiGraph, ring_nodes: set) -> bool:
    """DFS cycle detection within ring subgraph, path length 3–4, laundering edges."""
    sub = G.subgraph(ring_nodes)
    try:
        cycles = list(nx.simple_cycles(sub))
        for cycle in cycles:
            if 3 <= len(cycle) <= 4:
                # Check at least one laundering edge in cycle
                for i in range(len(cycle)):
                    u, v = cycle[i], cycle[(i + 1) % len(cycle)]
                    edge_data = G.get_edge_data(u, v) or {}
                    if isinstance(edge_data, dict):
                        edge_data = [edge_data]
                    for ed in (edge_data.values() if hasattr(edge_data, "values") else [edge_data]):
                        if ed.get("is_laundering", 0) == 1:
                            return True
    except Exception:
        pass
    return False


def detect_mule_network(G: nx.DiGraph, ring_nodes: set) -> bool:
    """Fan-in > 5 unique senders into any node in the ring."""
    for node in ring_nodes:
        unique_senders = set(G.predecessors(node))
        if len(unique_senders) > 5:
            return True
    return False


def detect_currency_layering(G: nx.DiGraph, ring_nodes: set) -> bool:
    """Any edge within the ring where pay_currency ≠ recv_currency."""
    for u, v, data in G.edges(data=True):
        if u in ring_nodes and v in ring_nodes:
            if data.get("pay_currency") != data.get("recv_currency"):
                return True
    return False


def detect_dormant_activation(G: nx.DiGraph, ring_nodes: set) -> bool:
    """Any ring node with > 10 transactions in a 2-day window."""
    for node in ring_nodes:
        timestamps = []
        for _, _, d in G.out_edges(node, data=True):
            try:
                timestamps.append(pd.Timestamp(d["timestamp"]))
            except Exception:
                pass
        for _, _, d in G.in_edges(node, data=True):
            try:
                timestamps.append(pd.Timestamp(d["timestamp"]))
            except Exception:
                pass

        if len(timestamps) < 10:
            continue
        timestamps.sort()
        for i in range(len(timestamps)):
            window = [t for t in timestamps[i:] if t - timestamps[i] <= timedelta(days=2)]
            if len(window) > 10:
                return True
    return False


PATTERN_DETECTORS = {
    "Circular Fund Flow":      detect_circular_flows,
    "Mule Account Network":    detect_mule_network,
    "Currency Layering":       detect_currency_layering,
    "Dormant Activation":      detect_dormant_activation,
}


# ── Ring identification ────────────────────────────────────────────────────────

def identify_rings(G: nx.DiGraph) -> list[dict]:
    print(f"Building fraud subgraph (fraud_prob > {FRAUD_THRESH}) …")
    fraud_nodes = [n for n, d in G.nodes(data=True) if d.get("fraud_prob", 0) > FRAUD_THRESH]
    sub = G.subgraph(fraud_nodes).to_undirected()
    print(f"  Subgraph: {sub.number_of_nodes():,} nodes, {sub.number_of_edges():,} edges")

    if sub.number_of_nodes() == 0:
        print("  No nodes above fraud threshold — returning empty ring list.")
        return []

    print("Running Louvain community detection …")
    partition = community_louvain.best_partition(sub, random_state=42)

    # Group nodes by community
    communities: dict[int, list] = defaultdict(list)
    for node, comm_id in partition.items():
        communities[comm_id].append(node)

    rings = []
    ring_idx = 0

    for comm_id, members in communities.items():
        if len(members) < RING_MIN_NODES:
            continue

        member_set = set(members)

        # Must have at least 1 confirmed laundering edge
        has_laundering = any(
            G.get_edge_data(u, v, default={}).get("is_laundering", 0) == 1
            for u in member_set
            for v in G.successors(u)
            if v in member_set
        )
        if not has_laundering:
            continue

        # Centrality within ring subgraph
        ring_sub   = G.subgraph(members)
        undirected = ring_sub.to_undirected()
        pagerank   = nx.pagerank(ring_sub, alpha=0.85)
        try:
            betweenness = nx.betweenness_centrality(undirected, normalized=True)
        except Exception:
            betweenness = {n: 0.0 for n in members}

        mastermind_scores = {
            n: 0.5 * pagerank.get(n, 0) + 0.5 * betweenness.get(n, 0)
            for n in members
        }
        mastermind = max(mastermind_scores, key=mastermind_scores.__getitem__)

        # Write centrality back to main graph
        for n in members:
            G.nodes[n]["community_id"]    = comm_id
            G.nodes[n]["pagerank_score"]  = float(pagerank.get(n, 0))
            G.nodes[n]["betweenness"]     = float(betweenness.get(n, 0))
            G.nodes[n]["mastermind_score"] = float(mastermind_scores[n])

        # Detect active typologies
        active_patterns = [
            name for name, fn in PATTERN_DETECTORS.items()
            if fn(G, member_set)
        ]

        # Collect edge stats
        edge_amounts = [
            d.get("amount_paid", 0)
            for u in member_set
            for v, d in G[u].items()
            if v in member_set
        ]
        total_amount = sum(edge_amounts)

        timestamps = [
            d.get("timestamp", "")
            for u in member_set
            for v, d in G[u].items()
            if v in member_set and d.get("timestamp")
        ]
        time_window = f"{min(timestamps)} → {max(timestamps)}" if timestamps else "unknown"

        rings.append({
            "ring_id":        f"RING-{ring_idx:04d}",
            "community_id":   comm_id,
            "node_count":     len(members),
            "members":        members,
            "mastermind":     mastermind,
            "mastermind_score": float(mastermind_scores[mastermind]),
            "total_amount":   float(total_amount),
            "time_window":    time_window,
            "patterns":       active_patterns,
        })
        ring_idx += 1

    rings.sort(key=lambda r: -r["node_count"])
    print(f"  Detected {len(rings)} suspicious rings.")
    return rings


def save_rings(rings: list[dict], path: str) -> None:
    with open(path, "w") as f:
        json.dump(rings, f, indent=2)
    print(f"  Rings saved → {path}")


if __name__ == "__main__":
    G     = load_graph(GRAPH_PATH)
    rings = identify_rings(G)
    save_rings(rings, RINGS_PATH)
    save_graph(G, GRAPH_PATH)
    print(f"\nSummary: {len(rings)} fraud rings detected.")
    for r in rings[:5]:
        print(f"  {r['ring_id']}  nodes={r['node_count']}  "
              f"patterns={r['patterns']}  mastermind={r['mastermind']}")
