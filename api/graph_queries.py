"""
api/graph_queries.py
NetworkX query helpers — replaces Neo4j Cypher calls.
All functions operate on the in-memory DiGraph loaded at API startup.
"""

from __future__ import annotations

import networkx as nx


# ── Account ───────────────────────────────────────────────────────────────────

def get_account(G: nx.DiGraph, account_id: str) -> dict | None:
    if not G.has_node(account_id):
        return None
    d = G.nodes[account_id]
    return {
        "id":              account_id,
        "bank":            d.get("bank", "unknown"),
        "anomaly_score":   round(d.get("anomaly_score", 0.0), 4),
        "fraud_prob":      round(d.get("fraud_prob", 0.0), 4),
        "propagated_risk": round(d.get("propagated_risk", 0.0), 4),
        "pagerank_score":  round(d.get("pagerank_score", 0.0), 6),
        "betweenness":     round(d.get("betweenness", 0.0), 6),
        "mastermind_score":round(d.get("mastermind_score", 0.0), 6),
        "community_id":    d.get("community_id", -1),
    }


def get_subgraph(G: nx.DiGraph, account_id: str, hops: int = 2) -> dict:
    """Return ego-network JSON for the graph visualiser."""
    if not G.has_node(account_id):
        return {"nodes": [], "edges": []}

    ego_nodes = {account_id}
    frontier  = {account_id}
    for _ in range(hops):
        next_frontier = set()
        for n in frontier:
            next_frontier.update(G.successors(n))
            next_frontier.update(G.predecessors(n))
        ego_nodes.update(next_frontier)
        frontier = next_frontier

    nodes = []
    for n in ego_nodes:
        d = G.nodes[n]
        nodes.append({
            "id":         n,
            "fraud_prob": round(d.get("fraud_prob", 0.0), 4),
            "anomaly":    round(d.get("anomaly_score", 0.0), 4),
        })

    edges = []
    for u, v, data in G.edges(data=True):
        if u in ego_nodes and v in ego_nodes:
            edges.append({
                "source": u,
                "target": v,
                "amount": data.get("amount_paid", 0),
                "is_laundering": data.get("is_laundering", 0),
            })

    return {"nodes": nodes, "edges": edges}


# ── Risk table ────────────────────────────────────────────────────────────────

def get_top_risk(G: nx.DiGraph, limit: int = 50) -> list[dict]:
    ranked = sorted(
        G.nodes(data=True),
        key=lambda x: x[1].get("anomaly_score", 0.0),
        reverse=True,
    )[:limit]
    return [
        {
            "id":            n,
            "bank":          d.get("bank", "unknown"),
            "anomaly_score": round(d.get("anomaly_score", 0.0), 4),
            "fraud_prob":    round(d.get("fraud_prob", 0.0), 4),
            "propagated_risk": round(d.get("propagated_risk", 0.0), 4),
        }
        for n, d in ranked
    ]


# ── Stats ─────────────────────────────────────────────────────────────────────

def get_stats(G: nx.DiGraph, rings: list[dict]) -> dict:
    fraud_nodes = sum(
        1 for _, d in G.nodes(data=True) if d.get("fraud_prob", 0) > 0.5
    )
    return {
        "total_accounts":   G.number_of_nodes(),
        "total_transactions": G.number_of_edges(),
        "high_fraud_accounts": fraud_nodes,
        "fraud_rings_detected": len(rings),
    }
