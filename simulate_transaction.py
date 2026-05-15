# simulate_transaction.py
import argparse
from neo4j import GraphDatabase
from ingestion.hash_utils import hash_id
from ml.propagation import propagate
from datetime import datetime

parser = argparse.ArgumentParser()
parser.add_argument('--from-acc', required=True)
parser.add_argument('--to-acc',   required=True)
parser.add_argument('--amount',   type=float, required=True)
parser.add_argument('--fraud',    type=int, default=0)
args = parser.parse_args()

driver = GraphDatabase.driver('bolt://localhost:7687', auth=('neo4j','secureledger123'))
with driver.session() as s:
    s.run('''
        MERGE (src:Account {id: $src})
        MERGE (dst:Account {id: $dst})
        CREATE (src)-[:TRANSACTION {
            amount_paid: $amt, amount_received: $amt, timestamp: $ts,
            is_laundering: $fraud, payment_format: 'Wire',
            pay_currency: 'USD', recv_currency: 'USD'
        }]->(dst)
    ''', src=hash_id(args.from_acc), dst=hash_id(args.to_acc),
         amt=args.amount, ts=str(datetime.now()), fraud=args.fraud)

print('Transaction added. Re-running propagation...')
propagate(iterations=2)
print('Done. Refresh the browser.')