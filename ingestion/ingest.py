# ingestion/ingest.py

import pandas as pd
from neo4j import GraphDatabase
from ingestion.hash_utils import hash_id
import time

URI  = 'bolt://127.0.0.1:7687'
AUTH = ('neo4j', 'secureledger123')


def get_driver():
    return GraphDatabase.driver(
        URI,
        auth=AUTH,
        connection_timeout=60,
        max_transaction_retry_time=30
    )


def load_data():
    print("Loading CSV...")

    # df = pd.read_csv('../data/HI-Small_Trans.csv')
    df = pd.read_csv('data/HI-Small_Trans.csv')

    df['Timestamp'] = pd.to_datetime(df['Timestamp'])

    df = df[
        df['Timestamp'].dt.date
        <= pd.Timestamp('2022-09-03').date()
    ]

    print(f'Loaded {len(df):,} transactions after filtering to Sep 1-3')

    return df


def create_indexes(driver):
    with driver.session() as session:
        session.run(
            'CREATE INDEX IF NOT EXISTS FOR (a:Account) ON (a.id)'
        )

    print("Index created")


def clear_database(driver):
    """
    Clear Neo4j database in batches
    to avoid MemoryPoolOutOfMemoryError
    """

    print("Clearing existing data in batches...")

    with driver.session() as session:

        while True:

            result = session.run("""
                MATCH (n)
                WITH n LIMIT 1000
                DETACH DELETE n
                RETURN count(n) AS deleted
            """)

            deleted = result.single()["deleted"]

            if deleted == 0:
                break

            print(f"Deleted {deleted} nodes...")

            time.sleep(0.5)

    print("Database cleared.")


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

            print(
                f'Batch failed (attempt {attempt+1}/{retries}): {e}'
            )

            time.sleep(5)

            if attempt == retries - 1:
                raise


def run():

    driver = get_driver()

    # -------------------------------------------------
    # STEP 1: Clear old graph safely
    # -------------------------------------------------
    clear_database(driver)

    # -------------------------------------------------
    # STEP 2: Load CSV
    # -------------------------------------------------
    df = load_data()

    # -------------------------------------------------
    # STEP 3: Create indexes
    # -------------------------------------------------
    create_indexes(driver)

    rows = []
    total = 0

    print("Starting ingestion...")

    # -------------------------------------------------
    # STEP 4: Prepare rows
    # -------------------------------------------------
    for _, r in df.iterrows():

        rows.append({

            'src': hash_id(str(r['Account'])),

            'dst': hash_id(str(r['Account.1'])),

            'src_bank': str(r['From Bank']),

            'dst_bank': str(r['To Bank']),

            'amount_paid': float(r['Amount Paid']),

            'amount_received': float(r['Amount Received']),

            'pay_currency': str(r['Payment Currency']),

            'recv_currency': str(r['Receiving Currency']),

            'payment_format': str(r['Payment Format']),

            'timestamp': str(r['Timestamp']),

            'is_laundering': int(r['Is Laundering'])

        })

        # ---------------------------------------------
        # Batch insert
        # ---------------------------------------------
        if len(rows) == 200:

            ingest_batch(driver, rows)

            total += len(rows)

            rows = []

            if total % 50000 == 0:

                print(f'  {total:,} rows ingested...')

                # Let Neo4j breathe
                time.sleep(1)

    # -------------------------------------------------
    # Insert remaining rows
    # -------------------------------------------------
    if rows:

        ingest_batch(driver, rows)

        total += len(rows)

    print(f'\nIngestion complete.')
    print(f'Total rows ingested: {total:,}')

    driver.close()


if __name__ == '__main__':
    run()