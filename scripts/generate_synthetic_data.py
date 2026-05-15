"""
scripts/generate_synthetic_data.py
Generate a small synthetic AML dataset for testing without the Kaggle download.

Produces: data/synthetic_trans.csv  (10,000 rows)

Injects four laundering scenarios:
  1. Circular Fund Flow  — A → B → C → A
  2. Mule Account Chain  — fan-in from 8 accounts into one mule
  3. Currency Layering   — USD → EUR → GBP within a cluster
  4. Dormant Activation  — 15 transactions in 2 days from a dormant account
"""

import random
import os
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

SEED = 42
random.seed(SEED)

N_ACCOUNTS     = 500
N_TRANSACTIONS = 10_000
CURRENCIES     = ["USD", "EUR", "GBP", "INR", "SGD", "AED"]
FORMATS        = ["Wire Transfer", "SWIFT", "RTGS", "NEFT", "ACH", "Cheque"]
START_DATE     = datetime(2022, 9, 1)

Path("data").mkdir(exist_ok=True)
OUT_PATH = os.getenv("DATA_CSV", "data/synthetic_trans.csv")


def rand_account():
    return f"ACCT{random.randint(1000, 1000 + N_ACCOUNTS):04d}"


def rand_bank():
    return random.choice(["SBI", "UBI", "PNB", "HDFC", "ICICI", "AXIS", "BOB"])


rows = []


def add_tx(src, dst, amount, currency, fmt, ts, is_laundering=0):
    recv_currency = currency if random.random() > 0.1 else random.choice(CURRENCIES)
    rows.append({
        "Timestamp":          ts.isoformat(),
        "From Bank":          rand_bank(),
        "Account":            src,
        "To Bank":            rand_bank(),
        "Account.1":          dst,
        "Amount Paid":        round(amount, 2),
        "Amount Received":    round(amount * random.uniform(0.95, 1.0), 2),
        "Payment Currency":   currency,
        "Receiving Currency": recv_currency,
        "Payment Format":     fmt,
        "Is Laundering":      is_laundering,
    })


# ── Legitimate transactions ────────────────────────────────────────────────────
print("Generating legitimate transactions …")
for _ in range(N_TRANSACTIONS - 100):
    ts  = START_DATE + timedelta(seconds=random.randint(0, 86400 * 9))
    add_tx(rand_account(), rand_account(),
           random.uniform(100, 50_000),
           random.choice(CURRENCIES),
           random.choice(FORMATS), ts)

# ── Scenario 1: Circular Fund Flow ────────────────────────────────────────────
print("Injecting circular fund flow …")
ring = ["ACCT9901", "ACCT9902", "ACCT9903"]
ts0  = START_DATE + timedelta(hours=10)
for i in range(len(ring)):
    add_tx(ring[i], ring[(i + 1) % len(ring)],
           50_000, "USD", "Wire Transfer",
           ts0 + timedelta(hours=i * 2), is_laundering=1)

# ── Scenario 2: Mule Account Network ──────────────────────────────────────────
print("Injecting mule account network …")
mule    = "ACCT9910"
feeders = [f"ACCT98{i:02d}" for i in range(8)]
ts1     = START_DATE + timedelta(days=1)
for feeder in feeders:
    add_tx(feeder, mule, random.uniform(5_000, 20_000),
           "USD", "ACH", ts1 + timedelta(hours=random.randint(0, 12)),
           is_laundering=1)

# ── Scenario 3: Currency Layering ─────────────────────────────────────────────
print("Injecting currency layering …")
layering = [("ACCT9920", "ACCT9921", "USD"), ("ACCT9921", "ACCT9922", "EUR"),
            ("ACCT9922", "ACCT9923", "GBP")]
ts2 = START_DATE + timedelta(days=2)
for src, dst, ccy in layering:
    rows.append({
        "Timestamp":          (ts2 + timedelta(hours=1)).isoformat(),
        "From Bank":          rand_bank(),
        "Account":            src,
        "To Bank":            rand_bank(),
        "Account.1":          dst,
        "Amount Paid":        75_000.0,
        "Amount Received":    74_500.0,
        "Payment Currency":   ccy,
        "Receiving Currency": {"USD": "EUR", "EUR": "GBP", "GBP": "USD"}[ccy],
        "Payment Format":     "SWIFT",
        "Is Laundering":      1,
    })

# ── Scenario 4: Dormant Activation ────────────────────────────────────────────
print("Injecting dormant account activation …")
dormant = "ACCT9930"
ts3     = START_DATE + timedelta(days=1, hours=5)
for i in range(15):
    add_tx(dormant, rand_account(),
           random.uniform(1_000, 10_000), "USD", "NEFT",
           ts3 + timedelta(hours=i * 2), is_laundering=1)

# ── Save ──────────────────────────────────────────────────────────────────────
df = pd.DataFrame(rows)
df = df.sample(frac=1, random_state=SEED).reset_index(drop=True)
df.to_csv(OUT_PATH, index=False)
print(f"\n✓  Saved {len(df):,} transactions → {OUT_PATH}")
print(f"   Laundering rows: {df['Is Laundering'].sum()}")
print("\nTo use this dataset, set in .env:")
print(f"  DATA_CSV={OUT_PATH}")
