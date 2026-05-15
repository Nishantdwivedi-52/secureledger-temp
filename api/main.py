from fastapi import FastAPI

from fastapi.middleware.cors import CORSMiddleware

from fastapi.responses import PlainTextResponse

import json

from graph.graph_queries import (

    test_connection,

    get_dashboard_stats,

    get_top_risky_accounts,

    get_account_details,

    get_recent_transactions,

    get_subgraph,

    detect_circular_flows,

    detect_mule_accounts,

    get_ring_stats,

    get_top_masterminds,

    get_ring_graph
)

from ml.evidence import (

    generate_evidence,

    generate_str_report
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

app.add_middleware(

    CORSMiddleware,

    allow_origins=["*"],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)

# ------------------------------------------------
# ROOT
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

@app.get("/api/ping")

def ping():

    return {

        "status": "ok",

        "neo4j": test_connection()
    }

# ------------------------------------------------
# FRAUD RING GRAPH API
# ------------------------------------------------

@app.get("/api/rings/graph")

def ring_graph():

    return get_ring_graph()

# ------------------------------------------------
# DASHBOARD STATS
# ------------------------------------------------

@app.get("/api/dashboard/stats")

def dashboard_stats():

    return get_dashboard_stats()

# ------------------------------------------------
# TOP RISKY ACCOUNTS
# ------------------------------------------------

@app.get("/api/risk/top")

def top_risk_accounts(

    limit: int = 20,

    search: str = None
):

    return get_top_risky_accounts(

        limit,

        search
    )

# ------------------------------------------------
# ACCOUNT DETAILS
# ------------------------------------------------

@app.get("/api/account/{account_id}")

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

@app.get("/api/account/{account_id}/transactions")

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

@app.get("/api/subgraph/{account_id}")

def subgraph(account_id: str):

    return get_subgraph(account_id)

# ------------------------------------------------
# FRAUD RINGS
# ------------------------------------------------

@app.get("/api/fraud-rings")

def fraud_rings():

    return detect_circular_flows()

# ------------------------------------------------
# MULE ACCOUNTS
# ------------------------------------------------

@app.get("/api/mule-accounts")

def mule_accounts():

    return detect_mule_accounts()

# ------------------------------------------------
# RING STATS
# ------------------------------------------------

@app.get("/api/rings/stats")

def ring_stats():

    return get_ring_stats()

# ------------------------------------------------
# TOP MASTERMINDS
# ------------------------------------------------

@app.get("/api/masterminds")

def masterminds():

    return get_top_masterminds()

# ------------------------------------------------
# GENERATE STR REPORT
# ------------------------------------------------

@app.get(

    "/api/report/{ring_id}",

    response_class=PlainTextResponse
)

def generate_report(ring_id: str):

    # ----------------------------------------
    # LOAD RINGS
    # ----------------------------------------

    with open(

        "ml/rings.json",

        "r"
    ) as f:

        rings = json.load(f)

    # ----------------------------------------
    # FIND RING
    # ----------------------------------------

    ring = next(

        (
            r for r in rings

            if r["ring_id"] == ring_id
        ),

        None
    )

    if not ring:

        return "Ring not found"

    # ----------------------------------------
    # GENERATE EVIDENCE
    # ----------------------------------------

    evidence = generate_evidence(ring)

    # ----------------------------------------
    # GENERATE REPORT
    # ----------------------------------------

    report = generate_str_report(

        evidence
    )

    return report

# ------------------------------------------------
# TIMELINE API
# ------------------------------------------------

@app.get("/api/timeline/{ring_id}")

def get_timeline(ring_id: str):

    # ----------------------------------------
    # LOAD RINGS
    # ----------------------------------------

    with open(

        "ml/rings.json",

        "r"
    ) as f:

        rings = json.load(f)

    # ----------------------------------------
    # FIND RING
    # ----------------------------------------

    ring = next(

        (
            r for r in rings

            if r["ring_id"] == ring_id
        ),

        None
    )

    if not ring:

        return []

    # ----------------------------------------
    # GENERATE EVIDENCE
    # ----------------------------------------

    evidence = generate_evidence(ring)

    # ----------------------------------------
    # SAFE JSON TIMELINE
    # ----------------------------------------

    timeline = []

    for t in evidence["transaction_timeline"][:20]:

        timeline.append({

            "from_acc":

            str(
                t.get("from_acc", "Unknown")
            ),

            "to_acc":

            str(
                t.get("to_acc", "Unknown")
            ),

            "amount":

            float(
                t.get("amount", 0) or 0
            ),

            "fmt":

            str(
                t.get("fmt", "TRANSFER")
            ),

            "fraud":

            int(
                t.get("fraud", 0) or 0
            ),

            "ts":

            str(
                t.get("ts", "Unknown")
            )
        })

    return timeline