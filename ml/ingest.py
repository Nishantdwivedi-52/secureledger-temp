"""
ml/ingest.py
Ingest IBM AML dataset into a NetworkX DiGraph.

- Reads HI-Small_Trans.csv with Pandas 2.0
- Filters to first N days (default 3, ~1.5M transactions)
- Anonymises account IDs via SHA-256 (hash_utils.py)
- Builds a directed multigraph: Account nodes, TRANSACTION edges
- Saves graph to ml/graph.gpickle
"""

import os
import pickle
from pathlib import Path

import networkx as nx
import pandas as pd
from dotenv import load_dotenv
from tqdm import tqdm

from hash_utils import hash_account

load_dotenv()

DATA_CSV     = os.getenv("DATA_CSV", "data/HI-Small_Trans.csv")
GRAPH_PATH   = os.getenv("GRAPH_PATH", "ml/graph.gpickle")
DAYS_TO_LOAD = int(os.getenv("DAYS_TO_LOAD", 3))


def load_csv(path: str, days: int) -> pd.DataFrame:
    print(f"Reading {path} …")
    df = pd.read_csv(path, parse_dates=["Timestamp"])

    df.columns = [c.strip() for c in df.columns]
    # Rename ambiguous Account / Account.1 columns
    df = df.rename(columns={"Account": "SrcAccount", "Account.1": "DstAccount"})

    start_date = df["Timestamp"].min()
    cutoff     = start_date + pd.Timedelta(days=days)
    df         = df[df["Timestamp"] < cutoff].reset_index(drop=True)

    print(f"  Loaded {len(df):,} transactions ({days} days)")
    return df


def build_graph(df: pd.DataFrame) -> nx.DiGraph:
    G = nx.DiGraph()

    print("Building graph …")
    for _, row in tqdm(df.iterrows(), total=len(df), unit="tx"):
        src = hash_account(row["SrcAccount"])
        dst = hash_account(row["DstAccount"])

        # Upsert nodes with bank metadata
        if not G.has_node(src):
            G.add_node(src, bank=str(row["From Bank"]),
                       anomaly_score=0.0, fraud_prob=0.0,
                       propagated_risk=0.0, pagerank_score=0.0,
                       betweenness=0.0, mastermind_score=0.0,
                       community_id=-1)
        if not G.has_node(dst):
            G.add_node(dst, bank=str(row["To Bank"]),
                       anomaly_score=0.0, fraud_prob=0.0,
                       propagated_risk=0.0, pagerank_score=0.0,
                       betweenness=0.0, mastermind_score=0.0,
                       community_id=-1)

        G.add_edge(src, dst,
                   amount_paid=float(row["Amount Paid"]),
                   amount_received=float(row["Amount Received"]),
                   pay_currency=str(row["Payment Currency"]),
                   recv_currency=str(row["Receiving Currency"]),
                   payment_format=str(row["Payment Format"]),
                   timestamp=str(row["Timestamp"]),
                   is_laundering=int(row["Is Laundering"]))

    print(f"  Graph: {G.number_of_nodes():,} nodes, {G.number_of_edges():,} edges")
    return G


def save_graph(G: nx.DiGraph, path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        pickle.dump(G, f)
    print(f"  Graph saved → {path}")


def load_graph(path: str) -> nx.DiGraph:
    with open(path, "rb") as f:
        return pickle.load(f)


if __name__ == "__main__":
    df = load_csv(DATA_CSV, DAYS_TO_LOAD)
    G  = build_graph(df)
    save_graph(G, GRAPH_PATH)
