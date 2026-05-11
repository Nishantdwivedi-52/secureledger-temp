# ingestion/ingest.py
import pandas as pd
from neo4j import GraphDatabase
from hash_utils import hash_id
import time

URI  = 'bolt://127.0.0.1:7687'
AUTH = ('neo4j', 'secureledger123')

def get_driver():
    return GraphDatabase.driver(
        URI, auth=AUTH,
        connection_timeout=60,
        max_transaction_retry_time=30
    )

def load_data():
    print("Loading CSV...")
    df = pd.read_csv('../data/HI-Small_Trans.csv')
    df = pd.read_csv('data/HI-Small_Trans.csv')
    df['Timestamp'] = pd.to_datetime(df['Timestamp'])
    df = df[df['Timestamp'].dt.date <= pd.Timestamp('2022-09-03').date()]
    print(f'Loaded {len(df):,} transactions after filtering to Sep 1-3')
    return df

def create_indexes(driver):
    with driver.session() as session:
        session.run('CREATE INDEX IF NOT EXISTS FOR (a:Account) ON (a.id)')
    print("Index created")

def ingest_batch(driver, batch, retries=3):
    for attempt in range(retries):
        try:
            with driver.session() as session:
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
            return  # success
        except Exception as e:
            print(f'  Batch failed (attempt {attempt+1}/{retries}): {e}')
            time.sleep(5)
            if attempt == retries - 1:
                raise

def run():
    # First wipe the DB so we don't double-load from the previous run
    print("Clearing existing data...")
    driver = get_driver()
    with driver.session() as session:
        session.run("MATCH (n) DETACH DELETE n")
    print("Cleared.")

    df = load_data()
    rows = []
    total = 0

    create_indexes(driver)

    for _, r in df.iterrows():
        rows.append({
            'src':             hash_id(str(r['Account'])),
            'dst':             hash_id(str(r['Account.1'])),
            'src_bank':        str(r['From Bank']),
            'dst_bank':        str(r['To Bank']),
            'amount_paid':     float(r['Amount Paid']),
            'amount_received': float(r['Amount Received']),
            'pay_currency':    str(r['Payment Currency']),
            'recv_currency':   str(r['Receiving Currency']),
            'payment_format':  str(r['Payment Format']),
            'timestamp':       str(r['Timestamp']),
            'is_laundering':   int(r['Is Laundering'])
        })
        if len(rows) == 200:  # smaller batch size = less timeout risk
            ingest_batch(driver, rows)
            total += len(rows)
            rows = []
            if total % 50000 == 0:
                print(f'  {total:,} rows ingested...')
                time.sleep(1)  # brief pause to let Neo4j breathe

    if rows:
        ingest_batch(driver, rows)
        total += len(rows)

    print(f'Ingestion complete. Total rows: {total:,}')
    driver.close()

if __name__ == '__main__':
    run()