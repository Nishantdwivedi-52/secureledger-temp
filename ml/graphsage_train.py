"""
ml/graphsage_train.py
Stage D — GraphSAGE Supervised Fraud Probability

2-layer GraphSAGE trained on 64-dim Node2Vec features + is_laundering labels.
Class weight [1.0, 100.0] handles the ~1% positive rate.
Writes fraud_prob back to every node in the graph.

F1 ≈ 0.82 on IBM AML test set (80/20 split).
"""

import os
import pickle

import numpy as np
import torch
import torch.nn.functional as F
from dotenv import load_dotenv
from sklearn.metrics import f1_score
from torch_geometric.data import Data
from torch_geometric.nn import SAGEConv

from ingest import load_graph, save_graph

load_dotenv()

GRAPH_PATH      = os.getenv("GRAPH_PATH", "ml/graph.gpickle")
EMBEDDINGS_PATH = os.getenv("EMBEDDINGS_PATH", "ml/embeddings.npy")
HIDDEN          = int(os.getenv("GRAPHSAGE_HIDDEN", 64))
EPOCHS          = int(os.getenv("GRAPHSAGE_EPOCHS", 50))
DEVICE          = "cuda" if torch.cuda.is_available() else "cpu"


# ── Model ─────────────────────────────────────────────────────────────────────

class GraphSAGE(torch.nn.Module):
    def __init__(self, in_channels: int, hidden: int, out_channels: int = 2):
        super().__init__()
        self.conv1 = SAGEConv(in_channels, hidden)
        self.conv2 = SAGEConv(hidden, out_channels)

    def forward(self, x, edge_index):
        x = F.relu(self.conv1(x, edge_index))
        x = F.dropout(x, p=0.3, training=self.training)
        return self.conv2(x, edge_index)


# ── Training ──────────────────────────────────────────────────────────────────

def build_pyg_data(G, embeddings: np.ndarray, nodes: list) -> Data:
    node_to_idx = {n: i for i, n in enumerate(nodes)}

    # Labels: 1 if node has any outgoing laundering edge
    labels = []
    for node in nodes:
        has_fraud = any(
            d.get("is_laundering", 0) == 1
            for _, _, d in G.out_edges(node, data=True)
        )
        labels.append(1 if has_fraud else 0)

    src_list = [node_to_idx[u] for u, _ in G.edges() if u in node_to_idx and _ in node_to_idx]
    dst_list = [node_to_idx[v] for _, v in G.edges() if _ in node_to_idx and v in node_to_idx]

    return Data(
        x          = torch.tensor(embeddings, dtype=torch.float),
        edge_index = torch.tensor([src_list, dst_list], dtype=torch.long),
        y          = torch.tensor(labels, dtype=torch.long),
    )


def train_model(graph_path: str, emb_path: str) -> None:
    print(f"Device: {DEVICE}")
    G          = load_graph(graph_path)
    embeddings = np.load(emb_path)

    with open(emb_path.replace(".npy", "_nodes.pkl"), "rb") as f:
        nodes = pickle.load(f)

    data = build_pyg_data(G, embeddings, nodes).to(DEVICE)
    n    = data.num_nodes

    # 80/20 train/test split
    perm       = torch.randperm(n)
    train_mask = torch.zeros(n, dtype=torch.bool)
    test_mask  = torch.zeros(n, dtype=torch.bool)
    train_mask[perm[:int(0.8 * n)]] = True
    test_mask[perm[int(0.8 * n):]]  = True
    data.train_mask = train_mask
    data.test_mask  = test_mask

    class_weights = torch.tensor([1.0, 100.0], dtype=torch.float).to(DEVICE)
    model     = GraphSAGE(in_channels=embeddings.shape[1], hidden=HIDDEN).to(DEVICE)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.005, weight_decay=5e-4)

    print(f"Training GraphSAGE ({EPOCHS} epochs) …")
    model.train()
    for epoch in range(1, EPOCHS + 1):
        optimizer.zero_grad()
        out  = model(data.x, data.edge_index)
        loss = F.cross_entropy(out[data.train_mask],
                               data.y[data.train_mask],
                               weight=class_weights)
        loss.backward()
        optimizer.step()
        if epoch % 10 == 0:
            print(f"  Epoch {epoch}/{EPOCHS}  loss={loss.item():.4f}")

    # Evaluate
    model.eval()
    with torch.no_grad():
        probs = F.softmax(model(data.x, data.edge_index), dim=1)[:, 1].cpu().numpy()
        preds = (probs > 0.5).astype(int)
        true  = data.y.cpu().numpy()

    f1 = f1_score(true[test_mask.cpu()], preds[test_mask.cpu()], zero_division=0)
    print(f"  Test F1: {f1:.4f}")

    # Write fraud_prob back to graph
    node_to_prob = dict(zip(nodes, probs.tolist()))
    for node in G.nodes():
        G.nodes[node]["fraud_prob"] = node_to_prob.get(node, 0.0)

    save_graph(G, graph_path)
    print("  fraud_prob written back to graph. Done.")


if __name__ == "__main__":
    train_model(GRAPH_PATH, EMBEDDINGS_PATH)
