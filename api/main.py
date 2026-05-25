from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from simulate_transaction import broadcaster, live_ws_endpoint
import json
import os
import logging
from contextlib import asynccontextmanager
from typing import Any

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
# LOGGING SETUP
# Always use a named logger — never rely on print()
# in production code. This integrates with uvicorn's
# log pipeline automatically.
# ------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)
logger = logging.getLogger("securelegder.api")

# ------------------------------------------------
# PROJECT PATHS
# Centralise all path resolution here so nothing
# is ever hard-coded or CWD-dependent deeper in
# the codebase.
# ------------------------------------------------
# api/main.py lives one level below the project root
API_DIR     = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(API_DIR)

RINGS_FILE   = os.path.join(PROJECT_ROOT, "ml", "rings.json")
METRICS_FILE = os.path.join(PROJECT_ROOT, "evaluation_metrics.txt")


# ------------------------------------------------
# HELPER: SAFE rings.json LOADER
# Every route that needs rings.json calls this.
# Single responsibility, single failure point.
# ------------------------------------------------
def load_rings() -> list[dict]:
    """
    Load and return the fraud rings list from ml/rings.json.

    Raises:
        HTTPException 503 – file missing (model hasn't run yet).
        HTTPException 500 – file exists but is corrupt / not valid JSON.
    """
    if not os.path.exists(RINGS_FILE):
        logger.warning("rings.json requested but file does not exist at %s", RINGS_FILE)
        raise HTTPException(
            status_code=503,
            detail=(
                "Fraud-ring data is not available yet. "
                "Run the GNN pipeline (ml/gnnn.py) to generate ml/rings.json."
            )
        )
    try:
        with open(RINGS_FILE, "r") as f:
            data = json.load(f)
        if not isinstance(data, list):
            raise ValueError("Expected a JSON array at the top level.")
        return data
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("rings.json is corrupt: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"rings.json exists but could not be parsed: {exc}"
        )


# ------------------------------------------------
# HELPER: READ F1 SCORE FROM EVALUATION FILE
# ------------------------------------------------
def read_f1_score() -> float:
    """
    Parse the F1 Score line from evaluation_metrics.txt.

    Expected format (any line):
        F1 Score  : 0.0057

    Returns 0.0 on any failure so the /api/stats endpoint
    never crashes just because the metrics file is missing.
    """
    try:
        with open(METRICS_FILE, "r") as f:
            for line in f:
                stripped = line.strip()
                if stripped.startswith("F1 Score"):
                    parts = stripped.split(":", 1)
                    if len(parts) == 2:
                        value = float(parts[1].strip())
                        logger.debug("Parsed F1 score: %f", value)
                        return value
        logger.warning("F1 Score line not found in %s — defaulting to 0.0", METRICS_FILE)
    except FileNotFoundError:
        logger.warning("evaluation_metrics.txt not found at %s — defaulting to 0.0", METRICS_FILE)
    except (ValueError, IndexError) as exc:
        logger.error("Could not parse F1 score: %s — defaulting to 0.0", exc)

    return 0.0


# ------------------------------------------------
# HELPER: CALCULATE SUSPICIOUS AMOUNT FROM RINGS
# Fixes the bug where suspicious_amount was always 0.0
# ------------------------------------------------
def calculate_suspicious_amount(rings: list[dict]) -> float:
    """
    Sum the total flagged transaction volume across all fraud rings.

    Looks for common key names used by the GNN output:
    'total_amount', 'amount', 'transaction_volume', 'flagged_amount'.
    Falls back to 0.0 per ring if none are present, so the function
    is resilient to schema variations between model versions.
    """
    total = 0.0
    amount_keys = ("total_amount", "amount", "transaction_volume", "flagged_amount")

    for ring in rings:
        for key in amount_keys:
            if key in ring:
                try:
                    total += float(ring[key] or 0)
                except (TypeError, ValueError):
                    pass
                break   # stop at the first matching key per ring

    return round(total, 2)


# ------------------------------------------------
# LIFESPAN: STARTUP / SHUTDOWN LOGIC
# asynccontextmanager replaces the deprecated
# @app.on_event("startup") pattern (FastAPI >= 0.93).
# ------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---------- STARTUP ----------
    logger.info("=" * 60)
    logger.info("SecureLedger API starting up")
    logger.info("Project root : %s", PROJECT_ROOT)
    logger.info("Rings file   : %s", RINGS_FILE)
    logger.info("Metrics file : %s", METRICS_FILE)

    # Warn loudly if rings.json is absent — routes will 503
    # until the GNN pipeline has been executed.
    if not os.path.exists(RINGS_FILE):
        logger.warning(
            "⚠️  WARNING: ml/rings.json does not exist. "
            "All /api/rings* endpoints will return 503 until the "
            "GNN pipeline (ml/gnnn.py) has been run successfully."
        )
    else:
        try:
            rings = load_rings()
            logger.info("✅ rings.json loaded OK — %d rings found.", len(rings))
        except HTTPException:
            logger.error("❌ rings.json exists but is invalid — check the file.")

    # Warn if evaluation metrics are absent
    if not os.path.exists(METRICS_FILE):
        logger.warning(
            "⚠️  WARNING: evaluation_metrics.txt not found. "
            "/api/stats will report model_f1 = 0.0 until the model is evaluated."
        )
    else:
        f1 = read_f1_score()
        logger.info("✅ Evaluation metrics loaded — F1 = %.4f", f1)

    logger.info("=" * 60)

    yield  # application runs here

    # ---------- SHUTDOWN ----------
    logger.info("SecureLedger API shutting down — goodbye.")


# ------------------------------------------------
# CREATE FASTAPI APP
# ------------------------------------------------
app = FastAPI(
    title="SecureLedger API",
    description="AI-Powered Financial Fraud Detection Backend",
    version="1.0",
    lifespan=lifespan,       # wire up the startup/shutdown hook
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

app.add_api_websocket_route("/ws/live-transactions", live_ws_endpoint)
# ================================================
# ROUTES
# ================================================

# ------------------------------------------------
# ROOT & HEALTH CHECK
# ------------------------------------------------
@app.get("/", tags=["Health"])
def root():
    return {
        "project": "SecureLedger",
        "status": "running",
        "message": "AI Fraud Detection Backend Active"
    }


@app.get("/api/ping", tags=["Health"])
def ping():
    """
    Lightweight liveness probe.
    Also checks whether Neo4j is reachable and rings.json exists.
    """
    return {
        "status": "ok",
        "neo4j": test_connection(),
        "rings_file_present": os.path.exists(RINGS_FILE),
        "metrics_file_present": os.path.exists(METRICS_FILE),
    }


# ------------------------------------------------
# GLOBAL DASHBOARD STATS
# ------------------------------------------------
@app.get("/api/stats", tags=["Dashboard"])
def global_hackathon_stats():
    """
    High-level summary cards for the landing page.

    - suspicious_amount is calculated live from rings.json so it
      reflects the real flagged transaction volume, not a hardcoded 0.
    - model_f1 is read from evaluation_metrics.txt, not hardcoded.
    - fraud_rings count comes from rings.json length.
    - Falls back gracefully if either file is missing.
    """
    base_stats = get_dashboard_stats() or {}

    # Attempt to load rings for derived stats; don't crash if absent
    try:
        rings = load_rings()
        fraud_rings_count    = len(rings)
        suspicious_amount    = calculate_suspicious_amount(rings)
    except HTTPException:
        # GNN hasn't run yet — surface zeroes rather than an error page
        fraud_rings_count = 0
        suspicious_amount = base_stats.get("suspicious_amount", 0.0)

    return {
        "total_accounts":    base_stats.get("total_accounts", 0),
        "fraud_rings":       fraud_rings_count,
        "suspicious_amount": suspicious_amount,
        "model_f1":          read_f1_score(),
    }


# ------------------------------------------------
# FRAUD RINGS — list & detail
# FIX: /api/fraud-rings was a duplicate of /api/rings.
# Kept /api/rings (RESTful noun) and removed /api/fraud-rings.
# detect_circular_flows() from Neo4j is exposed separately
# under a clearly distinct path so intent is unambiguous.
# ------------------------------------------------
@app.get("/api/rings", tags=["Rings"])
def list_rings():
    """
    Returns the full compiled fraud-ring list from ml/rings.json.
    503 if the GNN pipeline hasn't been run yet.
    """
    return load_rings()


@app.get("/api/rings/stats", tags=["Rings"])
def ring_stats():
    """Aggregate statistics across all detected rings (Neo4j query)."""
    return get_ring_stats()


@app.get("/api/rings/graph", tags=["Rings"])
def ring_graph():
    """Full ring graph for visualisation (Neo4j query)."""
    return get_ring_graph()


@app.get("/api/rings/{ring_id}", tags=["Rings"])
def ring_detail(ring_id: str):
    """
    Single ring detail with an injected 2-hop subgraph centred on
    the mastermind node for front-end visualisation.
    """
    rings = load_rings()   # raises 503/500 with meaningful message if broken

    ring = next((r for r in rings if r["ring_id"] == ring_id), None)
    if ring is None:
        raise HTTPException(
            status_code=404,
            detail=f"Ring '{ring_id}' not found. "
                   f"Available IDs: {[r['ring_id'] for r in rings[:5]]}…"
        )

    # Enrich with live subgraph from Neo4j
    ring = dict(ring)                           # don't mutate the cached object
    ring["subgraph"] = get_subgraph(ring["mastermind"])
    return ring


# ------------------------------------------------
# GRAPH ANALYTICS (Neo4j-backed, no rings.json dep)
# These are kept separate from rings.json routes
# because they hit the graph DB directly.
# ------------------------------------------------
@app.get("/api/graph/circular-flows", tags=["Graph Analytics"])
def circular_flows():
    """
    Detect circular transaction flows via Neo4j.
    Previously /api/fraud-rings — renamed to avoid confusion with
    the ML-detected rings at /api/rings.
    """
    return detect_circular_flows()


@app.get("/api/graph/mule-accounts", tags=["Graph Analytics"])
def mule_accounts():
    """Detect probable money-mule accounts via Neo4j heuristics."""
    return detect_mule_accounts()


@app.get("/api/masterminds", tags=["Graph Analytics"])
def masterminds():
    """Top mastermind nodes ranked by ring centrality (Neo4j)."""
    return get_top_masterminds()


# ------------------------------------------------
# ACCOUNT ROUTES
# ------------------------------------------------
@app.get("/api/dashboard/stats", tags=["Dashboard"])
def dashboard_stats():
    """Raw dashboard telemetry from Neo4j (unprocessed)."""
    return get_dashboard_stats()


@app.get("/api/risk/top", tags=["Accounts"])
def top_risk_accounts(limit: int = 20, search: str = None):
    return get_top_risky_accounts(limit, search)


@app.get("/api/account/{account_id}", tags=["Accounts"])
def account_details(account_id: str):
    result = get_account_details(account_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"Account '{account_id}' not found in the graph database."
        )
    return result


@app.get("/api/account/{account_id}/transactions", tags=["Accounts"])
def recent_transactions(account_id: str, limit: int = 20):
    return get_recent_transactions(account_id, limit)


@app.get("/api/subgraph/{account_id}", tags=["Accounts"])
def subgraph(account_id: str):
    return get_subgraph(account_id)


# ------------------------------------------------
# EVIDENCE, STR REPORTS & TIMELINE
# ------------------------------------------------
@app.get("/api/report/{ring_id}", response_class=PlainTextResponse, tags=["Reports"])
def generate_report(ring_id: str):
    """
    Generate a Suspicious Transaction Report (STR) for a given ring.
    Returns plain text suitable for download or display.
    """
    rings = load_rings()

    ring = next((r for r in rings if r["ring_id"] == ring_id), None)
    if ring is None:
        # PlainTextResponse route — raise as plain text, not JSON
        raise HTTPException(
            status_code=404,
            detail=f"Ring '{ring_id}' not found — cannot generate report."
        )

    evidence = generate_evidence(ring)
    return generate_str_report(evidence)


@app.get("/api/timeline/{ring_id}", tags=["Reports"])
def get_timeline(ring_id: str) -> list[dict[str, Any]]:
    """
    Returns a sanitised, front-end-ready chronological transaction
    timeline for the given ring (capped at 20 events).
    """
    rings = load_rings()

    ring = next((r for r in rings if r["ring_id"] == ring_id), None)
    if ring is None:
        raise HTTPException(
            status_code=404,
            detail=f"Ring '{ring_id}' not found — cannot build timeline."
        )

    evidence = generate_evidence(ring)

    # Sanitise every field — the ML layer can emit None / NaN values
    # that break JSON serialisation, so we coerce everything explicitly.
    timeline: list[dict[str, Any]] = []
    for t in evidence["transaction_timeline"][:20]:
        timeline.append({
            "from_acc": str(t.get("from_acc") or "Unknown"),
            "to_acc":   str(t.get("to_acc")   or "Unknown"),
            "amount":   float(t.get("amount")  or 0),
            "fmt":      str(t.get("fmt")       or "TRANSFER"),
            "fraud":    int(t.get("fraud")     or 0),
            "ts":       str(t.get("ts")        or "Unknown"),
        })

    return timeline