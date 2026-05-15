"""
ml/isolation_forest.py
Stage B — Unsupervised Anomaly Scoring

- Loads Node2Vec embeddings (no labels used)
- Fits Isolation Forest (200 estimators, contamination=0.01)
- Normalises scores to [0, 1] via MinMaxScaler
- Writes anomaly_score back to every node in the graph
- Saves updated graph.gpickle
"""

import os
import pickle

import numpy as np
from dotenv import load_dotenv
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import MinMaxScaler

from ingest import load_graph, save_graph

load_dotenv()

GRAPH_PATH      = os.getenv("GRAPH_PATH", "ml/graph.gpickle")
EMBEDDINGS_PATH = os.getenv("EMBEDDINGS_PATH", "ml/embeddings.npy")
IF_ESTIMATORS   = int(os.getenv("IF_ESTIMATORS", 200))
IF_CONTAMINATION = float(os.getenv("IF_CONTAMINATION", 0.01))


def run(graph_path: str, emb_path: str) -> None:
    print("Loading graph & embeddings …")
    G          = load_graph(graph_path)
    embeddings = np.load(emb_path)

    nodes_path = emb_path.replace(".npy", "_nodes.pkl")
    with open(nodes_path, "rb") as f:
        nodes = pickle.load(f)

    print(f"  Fitting Isolation Forest (n_estimators={IF_ESTIMATORS}, contamination={IF_CONTAMINATION}) …")
    clf = IsolationForest(n_estimators=IF_ESTIMATORS,
                          contamination=IF_CONTAMINATION,
                          random_state=42,
                          n_jobs=-1)
    raw_scores = clf.fit_predict(embeddings)          # -1 = anomaly, 1 = normal
    # decision_function gives continuous score; lower = more anomalous
    decision   = clf.decision_function(embeddings)

    # Invert & normalise to [0, 1]: high score = high anomaly
    scaler      = MinMaxScaler()
    normalised  = scaler.fit_transform((-decision).reshape(-1, 1)).flatten()

    print("  Writing anomaly_score back to graph nodes …")
    for node, score in zip(nodes, normalised):
        if G.has_node(node):
            G.nodes[node]["anomaly_score"] = float(score)

    save_graph(G, graph_path)
    print(f"  Done. Top-5 anomalous accounts:")
    top5 = sorted(zip(nodes, normalised), key=lambda x: -x[1])[:5]
    for acct, sc in top5:
        print(f"    {acct}  anomaly_score={sc:.4f}")


if __name__ == "__main__":
    run(GRAPH_PATH, EMBEDDINGS_PATH)
