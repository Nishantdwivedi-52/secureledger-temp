"""
ml/propagation.py
Stage C — Fund Flow Propagation (core innovation)

Risk spreads through transaction edges:
  propagated_risk[v] += decay * max(fraud_prob[u] for u → v)

This captures indirect complicity invisible to node-only detectors:
if account A sends funds to suspicious account B, A's
propagated_risk rises — even if A's own local features appear benign.

Hyperparameters:
  decay      = 0.5   (risk halves with each hop)
  iterations = 3     (3-hop neighbourhood captured)
"""

import os

from dotenv import load_dotenv

from ingest import load_graph, save_graph

load_dotenv()

GRAPH_PATH  = os.getenv("GRAPH_PATH", "ml/graph.gpickle")
DECAY       = float(os.getenv("PROPAGATION_DECAY", 0.5))
ITERATIONS  = int(os.getenv("PROPAGATION_ITERS", 3))


def propagate(graph_path: str, decay: float = 0.5, iterations: int = 3) -> None:
    print(f"Loading graph from {graph_path} …")
    G = load_graph(graph_path)

    # Seed propagated_risk from anomaly_score
    for node in G.nodes():
        G.nodes[node]["propagated_risk"] = G.nodes[node].get("anomaly_score", 0.0)

    print(f"Running fund flow propagation (decay={decay}, iters={iterations}) …")
    for it in range(1, iterations + 1):
        updates = {}
        for node in G.nodes():
            # Risk flows IN from predecessors (accounts that sent money here)
            preds = list(G.predecessors(node))
            if not preds:
                continue
            max_incoming = max(
                G.nodes[p].get("propagated_risk", 0.0) for p in preds
            )
            current = G.nodes[node].get("propagated_risk", 0.0)
            updates[node] = min(1.0, current + decay * max_incoming)

        for node, val in updates.items():
            G.nodes[node]["propagated_risk"] = val

        changed = sum(1 for v in updates.values() if v > 0)
        print(f"  Iteration {it}/{iterations}  — {changed:,} nodes updated")

    save_graph(G, graph_path)
    print("  Propagation complete.")


if __name__ == "__main__":
    propagate(GRAPH_PATH, DECAY, ITERATIONS)
