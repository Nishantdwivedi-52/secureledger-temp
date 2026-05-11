from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from graph.graph_queries import (

    test_connection,
    get_dashboard_stats,
    get_top_risky_accounts,
    get_account_details,
    get_recent_transactions,
    get_subgraph,
    detect_circular_flows,
    detect_mule_accounts

)

# ------------------------------------------------
# CREATE FASTAPI APP
# ------------------------------------------------

app = FastAPI(

    title="SecureLedger API",

    description="AI-Powered Financial Fraud Detection Backend",

    version="1.0"

)

# ------------------------------------------------
# ENABLE CORS
# ------------------------------------------------

# Allows frontend (React/Vercel)
# to connect with backend

app.add_middleware(

    CORSMiddleware,

    allow_origins=["*"],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"]

)

# ------------------------------------------------
# ROOT ROUTE
# ------------------------------------------------

@app.get("/")

def root():

    return {

        "project": "SecureLedger",

        "status": "running",

        "message": "AI Fraud Detection Backend Active"

    }

# ------------------------------------------------
# HEALTH CHECK
# ------------------------------------------------

@app.get("/ping")

def ping():

    return {

        "status": "ok",

        "neo4j": test_connection()

    }

# ------------------------------------------------
# DASHBOARD STATS
# ------------------------------------------------

@app.get("/dashboard/stats")

def dashboard_stats():

    return get_dashboard_stats()

# ------------------------------------------------
# TOP RISKY ACCOUNTS
# ------------------------------------------------

@app.get("/risk/top")

def top_risk_accounts(

    limit: int = 20

):

    return get_top_risky_accounts(limit)

# ------------------------------------------------
# ACCOUNT DETAILS
# ------------------------------------------------

@app.get("/account/{account_id}")

def account_details(account_id: str):

    result = get_account_details(account_id)

    if result is None:

        return {

            "error": "Account not found"

        }

    return result

# ------------------------------------------------
# RECENT TRANSACTIONS
# ------------------------------------------------

@app.get("/account/{account_id}/transactions")

def recent_transactions(

    account_id: str,

    limit: int = 20

):

    return get_recent_transactions(

        account_id,

        limit

    )

# ------------------------------------------------
# SUBGRAPH VISUALIZATION
# ------------------------------------------------

@app.get("/subgraph/{account_id}")

def subgraph(account_id: str):

    return get_subgraph(account_id)

# ------------------------------------------------
# FRAUD RING DETECTION
# ------------------------------------------------

@app.get("/fraud-rings")

def fraud_rings():

    return detect_circular_flows()

# ------------------------------------------------
# MULE ACCOUNT DETECTION
# ------------------------------------------------

@app.get("/mule-accounts")

def mule_accounts():

    return detect_mule_accounts()