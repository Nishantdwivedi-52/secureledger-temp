"""
scripts/simulate_transaction.py
Live demo transaction injector.

Adds a new transaction to the loaded graph, re-runs Fund Flow Propagation,
and prints the updated risk scores for the affected accounts.

Usage:
  python scripts/simulate_transaction.py --src <account_id> --dst <account_id> \
         --amount 50000 --currency USD
"""

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "ml"))

from dotenv import load_dotenv
from ingest import load_graph, save_graph
from propagation import propagate

load_dotenv()

GRAPH_PATH = os.getenv("GRAPH_PATH", "ml/graph.gpickle")


def inject(src: str, dst: str, amount: float, currency: str) -> None:
    print(f"\nLoading graph …")
    G = load_graph(GRAPH_PATH)

    if not G.has_node(src):
        G.add_node(src, bank="INJECTED", anomaly_score=0.0, fraud_prob=0.0,
                   propagated_risk=0.0, pagerank_score=0.0, betweenness=0.0,
                   mastermind_score=0.0, community_id=-1)
    if not G.has_node(dst):
        G.add_node(dst, bank="INJECTED", anomaly_score=0.0, fraud_prob=0.0,
                   propagated_risk=0.0, pagerank_score=0.0, betweenness=0.0,
                   mastermind_score=0.0, community_id=-1)

    G.add_edge(src, dst,
               amount_paid=amount, amount_received=amount * 0.99,
               pay_currency=currency, recv_currency=currency,
               payment_format="INJECTED", timestamp=datetime.utcnow().isoformat(),
               is_laundering=0)

    print(f"  Injected: {src} → {dst}  amount={amount:,.2f} {currency}")

    # Re-run propagation to update risk scores
    print("Re-running Fund Flow Propagation …")
    propagate(GRAPH_PATH, decay=float(os.getenv("PROPAGATION_DECAY", 0.5)),
              iterations=int(os.getenv("PROPAGATION_ITERS", 3)))

    G = load_graph(GRAPH_PATH)
    for acct in [src, dst]:
        d = G.nodes[acct]
        print(f"\n  {acct}")
        print(f"    anomaly_score   : {d.get('anomaly_score', 0):.4f}")
        print(f"    fraud_prob      : {d.get('fraud_prob', 0):.4f}")
        print(f"    propagated_risk : {d.get('propagated_risk', 0):.4f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inject a live demo transaction")
    parser.add_argument("--src",      required=True,  help="Source account ID")
    parser.add_argument("--dst",      required=True,  help="Destination account ID")
    parser.add_argument("--amount",   type=float, default=10_000.0)
    parser.add_argument("--currency", default="USD")
    args = parser.parse_args()

    inject(args.src, args.dst, args.amount, args.currency)
