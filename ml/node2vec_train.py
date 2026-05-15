"""
ml/node2vec_train.py
Stage A — Node2Vec Embeddings

Trains 64-dim Node2Vec embeddings on the transaction graph.
Accounts with similar network neighbourhood → similar vectors.
Saves embeddings as ml/embeddings.npy and a node-index mapping.

GPU: if a CUDA device is available (e.g. Kaggle T4), training
     completes in < 2 min. CPU training takes ~15–20 min on the
     full 1.5M-edge graph.
"""

import os
import pickle

import numpy as np
import torch
from dotenv import load_dotenv
from torch_geometric.nn import Node2Vec
from torch_geometric.utils import from_networkx

from ingest import load_graph

load_dotenv()

GRAPH_PATH       = os.getenv("GRAPH_PATH", "ml/graph.gpickle")
EMBEDDINGS_PATH  = os.getenv("EMBEDDINGS_PATH", "ml/embeddings.npy")
DIMS             = int(os.getenv("NODE2VEC_DIMS", 64))
WALK_LENGTH      = int(os.getenv("NODE2VEC_WALK_LENGTH", 20))
WALKS_PER_NODE   = int(os.getenv("NODE2VEC_WALKS_PER_NODE", 10))
EPOCHS           = int(os.getenv("NODE2VEC_EPOCHS", 5))
DEVICE           = "cuda" if torch.cuda.is_available() else "cpu"


def train(graph_path: str, emb_path: str) -> None:
    print(f"Loading graph from {graph_path} …")
    G = load_graph(graph_path)

    nodes = list(G.nodes())
    node_to_idx = {n: i for i, n in enumerate(nodes)}

    # Build edge_index tensor
    src_list, dst_list = zip(*G.edges()) if G.number_of_edges() > 0 else ([], [])
    edge_index = torch.tensor(
        [[node_to_idx[s] for s in src_list],
         [node_to_idx[d] for d in dst_list]],
        dtype=torch.long
    )

    model = Node2Vec(
        edge_index,
        embedding_dim=DIMS,
        walk_length=WALK_LENGTH,
        context_size=10,
        walks_per_node=WALKS_PER_NODE,
        num_negative_samples=1,
        p=1.0,
        q=1.0,
        sparse=True,
        num_nodes=len(nodes),
    ).to(DEVICE)

    loader     = model.loader(batch_size=128, shuffle=True, num_workers=0)
    optimizer  = torch.optim.SparseAdam(list(model.parameters()), lr=0.01)

    model.train()
    for epoch in range(1, EPOCHS + 1):
        total_loss = 0.0
        for pos_rw, neg_rw in loader:
            optimizer.zero_grad()
            loss = model.loss(pos_rw.to(DEVICE), neg_rw.to(DEVICE))
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
        print(f"  Epoch {epoch}/{EPOCHS}  loss={total_loss / len(loader):.4f}")

    model.eval()
    with torch.no_grad():
        embeddings = model().cpu().numpy()   # shape: (num_nodes, DIMS)

    np.save(emb_path, embeddings)
    # Save node order so other scripts can align embeddings to node IDs
    with open(emb_path.replace(".npy", "_nodes.pkl"), "wb") as f:
        pickle.dump(nodes, f)

    print(f"  Embeddings saved → {emb_path}  shape={embeddings.shape}")


if __name__ == "__main__":
    print(f"Device: {DEVICE}")
    train(GRAPH_PATH, EMBEDDINGS_PATH)
