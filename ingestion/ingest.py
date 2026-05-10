# ingestion/ingest.py
import pandas as pd
from neo4j import GraphDatabase
from hash_utils import hash_id

URI  = 'bolt://localhost:7687'
AUTH = ('neo4j', 'secureledger123')

def load_data():
    print("Loading CSV...")
    df = pd.read_csv('../data/HI-Small_Trans.csv')
    df['Timestamp'] = pd.to_datetime(df['Timestamp'])
    # Filter to Sep 1-3 only
    df = df[df['Timestamp'].dt.date <= pd.Timestamp('2022-09-03').date()]
    print(f'Loaded {len(df):,} transactions after filtering to Sep 1-3')
    return df

def create_indexes(session):
    session.run('CREATE INDEX IF NOT EXISTS FOR (a:Account) ON (a.id)')
    print("Index created")

def ingest_batch(session, batch):
    session.run('''
        UNWIND $rows AS row
        MERGE (src:Account {id: row.src})
          SET src.bank = row.src_bank
        MERGE (dst:Account {id: row.dst})
          SET dst.bank = row.dst_bank
        CREATE (src)-[:TRANSACTION {
            amount_paid:     row.amount_paid,
            amount_received: row.amount_received,
            pay_currency:    row.pay_currency,
            recv_currency:   row.recv_currency,
            payment_format:  row.payment_format,
            timestamp:       row.timestamp,
            is_laundering:   row.is_laundering
        }]->(dst)
    ''', rows=batch)

def run():
    df = load_data()
    driver = GraphDatabase.driver(URI, auth=AUTH)
    rows = []
    total = 0

    with driver.session() as session:
        create_indexes(session)
        for _, r in df.iterrows():
            rows.append({
                'src':             hash_id(r['Account']),
                'dst':             hash_id(r['Account.1']),
                'src_bank':        str(r['From Bank']),
                'dst_bank':        str(r['To Bank']),
                'amount_paid':     float(r['Amount Paid']),
                'amount_received': float(r['Amount Received']),
                'pay_currency':    r['Payment Currency'],
                'recv_currency':   r['Receiving Currency'],
                'payment_format':  r['Payment Format'],
                'timestamp':       str(r['Timestamp']),
                'is_laundering':   int(r['Is Laundering'])
            })
            if len(rows) == 500:
                ingest_batch(session, rows)
                total += len(rows)
                rows = []
                if total % 50000 == 0:
                    print(f'  {total:,} rows ingested...')

        # flush remaining
        if rows:
            ingest_batch(session, rows)
            total += len(rows)

    print(f'Ingestion complete. Total rows: {total:,}')
    driver.close()

if __name__ == '__main__':
    run()