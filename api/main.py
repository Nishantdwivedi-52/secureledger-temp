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
# ROOT & HEALTH CHECK
# ------------------------------------------------
@app.get("/")
def root():
    return {
        "project": "SecureLedger",
        "status": "running",
        "message": "AI Fraud Detection Backend Active"
    }

@app.get("/api/ping")
def ping():
    return {
        "status": "ok",
        "neo4j": test_connection()
    }

# ------------------------------------------------
# DAY 7: GLOBAL HACKATHON DASHBOARD STATS
# ------------------------------------------------
@app.get("/api/stats")
def global_hackathon_stats():
    """Exposes high-level summary cards for the landing page template."""
    # Pull base transaction telemetry numbers from your existing database checker
    base_stats = get_dashboard_stats() or {}
    
    try:
        with open("ml/rings.json", "r") as f:
            fraud_rings_count = len(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError):
        fraud_rings_count = 0

    return {
        "total_accounts": base_stats.get("total_accounts", 0),
        "fraud_rings": fraud_rings_count,
        "suspicious_amount": base_stats.get("suspicious_amount", 0.0),
        "model_f1": 0.92  # Update this value to match your exact gnnn.py terminal training log output
    }

# ------------------------------------------------
# DAY 5: FRAUD RINGS LIST & INDIVIDUAL DETAILS
# ------------------------------------------------
@app.get("/api/rings")
def list_rings():
    """Returns the full list of compiled fraud rings from the local JSON cluster file."""
    try:
        with open("ml/rings.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return []



# ------------------------------------------------
# EXISTING DASHBOARD & RISK TABLE ROUTES
# ------------------------------------------------
# Find this route in api/main.py and update it:
# Locate this function in api/main.py and replace it with this:
@app.get("/api/rings/graph")
def ring_graph():
    return get_ring_graph()
@app.get("/api/dashboard/stats")
def dashboard_stats():
    return get_dashboard_stats()

@app.get("/api/risk/top")
def top_risk_accounts(limit: int = 20, search: str = None):
    return get_top_risky_accounts(limit, search)

@app.get("/api/account/{account_id}")
def account_details(account_id: str):
    result = get_account_details(account_id)
    if result is None:
        return {"error": "Account not found"}
    return result

@app.get("/api/account/{account_id}/transactions")
def recent_transactions(account_id: str, limit: int = 20):
    return get_recent_transactions(account_id, limit)

@app.get("/api/subgraph/{account_id}")
def subgraph(account_id: str):
    return get_subgraph(account_id)

@app.get("/api/fraud-rings")
def fraud_rings():
    return detect_circular_flows()

@app.get("/api/mule-accounts")
def mule_accounts():
    return detect_mule_accounts()

@app.get("/api/rings/stats")
def ring_stats():
    return get_ring_stats()
@app.get("/api/rings/{ring_id}")
def ring_detail(ring_id: str):
    """Fetches a specific ring and maps out a 2-hop neighborhood centered around the mastermind."""
    try:
        with open("ml/rings.json", "r") as f:
            rings = json.load(f)
    except FileNotFoundError:
        return {"error": "Rings file not found"}

    ring = next((r for r in rings if r["ring_id"] == ring_id), None)
    if not ring:
        return {"error": "Ring not found"}
        
    # Inject the visual neighborhood subgraph structure for the mastermind node
    ring["subgraph"] = get_subgraph(ring["mastermind"])
    return ring

@app.get("/api/masterminds")
def masterminds():
    return get_top_masterminds()

# ------------------------------------------------
# DAY 6: EVIDENCE & REPORT GENERATION
# ------------------------------------------------
@app.get("/api/report/{ring_id}", response_class=PlainTextResponse)
def generate_report(ring_id: str):
    with open("ml/rings.json", "r") as f:
        rings = json.load(f)

    ring = next((r for r in rings if r["ring_id"] == ring_id), None)
    if not ring:
        return "Ring not found"

    evidence = generate_evidence(ring)
    report = generate_str_report(evidence)
    return report

# ------------------------------------------------
# TIMELINE GENERATION
# ------------------------------------------------
@app.get("/api/timeline/{ring_id}")
def get_timeline(ring_id: str):
    with open("ml/rings.json", "r") as f:
        rings = json.load(f)

    ring = next((r for r in rings if r["ring_id"] == ring_id), None)
    if not ring:
        return []

    evidence = generate_evidence(ring)
    timeline = []

    for t in evidence["transaction_timeline"][:20]:
        timeline.append({
            "from_acc": str(t.get("from_acc", "Unknown")),
            "to_acc": str(t.get("to_acc", "Unknown")),
            "amount": float(t.get("amount", 0) or 0),
            "fmt": str(t.get("fmt", "TRANSFER")),
            "fraud": int(t.get("fraud", 0) or 0),
            "ts": str(t.get("ts", "Unknown"))
        })

    return timeline