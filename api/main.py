import sys
import os
import json
import logging
from contextlib import asynccontextmanager
from typing import Any

# 1. Force Python to look inside the 'api' folder for imports
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

# 2. FastAPI Imports
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse

# 3. Local Project Imports
from simulate_transaction import broadcaster, live_ws_endpoint
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
    get_ring_graph,
    get_ring_transactions,
    get_top_masterminds,
    get_fund_flow_paths,
    detect_structuring_patterns,
    detect_dormant_accounts,
    get_kyc_mismatches,
    get_account_timeline,
)
from ml.evidence import (
    generate_evidence,
    generate_str_report
)

# ------------------------------------------------
# LOGGING SETUP
# ------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)
logger = logging.getLogger("securelegder.api")

# ------------------------------------------------
# PROJECT PATHS
# ------------------------------------------------
API_DIR     = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(API_DIR)

RINGS_FILE   = os.path.join(PROJECT_ROOT, "ml", "rings.json")
METRICS_FILE = os.path.join(PROJECT_ROOT, "evaluation_metrics.txt")


# ------------------------------------------------
# HELPERS
# ------------------------------------------------
def load_rings() -> list[dict]:
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


def read_all_metrics() -> dict:
    metrics = {
        "f1": 0.0,
        "precision": 0.0,
        "recall": 0.0,
        "auc_roc": 0.0,
        "avg_prec": 0.0,
        "tn": 0, "fp": 0, "fn": 0, "tp": 0,
        "best_threshold": 0.0,
        "training_epochs": 0,
        "ensemble_weights": "",
        "train_samples": 81722,
        "test_samples": 20431
    }
    try:
        with open(METRICS_FILE, "r") as f:
            lines = f.read().splitlines()
            for i, line in enumerate(lines):
                stripped = line.strip()
                if stripped.startswith("F1 Score"):
                    metrics["f1"] = float(stripped.split(":", 1)[1].strip())
                elif stripped.startswith("Precision"):
                    metrics["precision"] = float(stripped.split(":", 1)[1].strip())
                elif stripped.startswith("Recall"):
                    metrics["recall"] = float(stripped.split(":", 1)[1].strip())
                elif stripped.startswith("AUC-ROC"):
                    metrics["auc_roc"] = float(stripped.split(":", 1)[1].strip())
                elif stripped.startswith("Avg Prec"):
                    metrics["avg_prec"] = float(stripped.split(":", 1)[1].strip())
                elif stripped.startswith("Best Threshold"):
                    metrics["best_threshold"] = float(stripped.split(":", 1)[1].strip())
                elif stripped.startswith("Training epochs"):
                    metrics["training_epochs"] = int(stripped.split(":", 1)[1].strip())
                elif stripped.startswith("Ensemble weights"):
                    metrics["ensemble_weights"] = stripped.split(":", 1)[1].strip()
                elif stripped.startswith("Confusion Matrix"):
                    if i + 2 < len(lines):
                        row1 = lines[i+1].replace('[', '').replace(']', '').split()
                        row2 = lines[i+2].replace('[', '').replace(']', '').split()
                        if len(row1) == 2 and len(row2) == 2:
                            metrics["tn"] = int(row1[0])
                            metrics["fp"] = int(row1[1])
                            metrics["fn"] = int(row2[0])
                            metrics["tp"] = int(row2[1])
    except FileNotFoundError:
        logger.warning("evaluation_metrics.txt not found at %s — using default metrics", METRICS_FILE)
    except Exception as exc:
        logger.error("Could not parse all metrics: %s — returning partial", exc)

    return metrics


def calculate_suspicious_amount(rings: list[dict]) -> float:
    total = 0.0
    amount_keys = ("total_amount", "amount", "transaction_volume", "flagged_amount")
    for ring in rings:
        for key in amount_keys:
            if key in ring:
                try:
                    total += float(ring[key] or 0)
                except (TypeError, ValueError):
                    pass
                break
    return round(total, 2)


# ------------------------------------------------
# LIFESPAN: STARTUP / SHUTDOWN LOGIC
# ------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=" * 60)
    logger.info("SecureLedger API starting up")
    logger.info("Project root : %s", PROJECT_ROOT)
    logger.info("Rings file   : %s", RINGS_FILE)
    logger.info("Metrics file : %s", METRICS_FILE)

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

    if not os.path.exists(METRICS_FILE):
        logger.warning(
            "⚠️  WARNING: evaluation_metrics.txt not found. "
            "/api/stats will report model_f1 = 0.0 until the model is evaluated."
        )
    else:
        metrics = read_all_metrics()
        logger.info("✅ Evaluation metrics loaded — F1 = %.4f", metrics.get("f1", 0.0))

    logger.info("=" * 60)
    yield
    logger.info("SecureLedger API shutting down — goodbye.")


# ------------------------------------------------
# CREATE FASTAPI APP
# ------------------------------------------------
app = FastAPI(
    title="SecureLedger API",
    description="AI-Powered Financial Fraud Detection Backend",
    version="1.0",
    lifespan=lifespan,
)

# ------------------------------------------------
# ENABLE CORS
# ------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://127.0.0.1:5173", 
        "https://secureledger-temp-two.vercel.app"
    ], 
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_api_websocket_route("/ws/live-transactions", live_ws_endpoint)

# ================================================
# ROUTES
# ================================================

@app.get("/", tags=["Health"])
def root():
    return {
        "project": "SecureLedger",
        "status": "running",
        "message": "AI Fraud Detection Backend Active"
    }


@app.get("/api/ping", tags=["Health"])
def ping():
    return {
        "status": "ok",
        "neo4j": test_connection(),
        "rings_file_present": os.path.exists(RINGS_FILE),
        "metrics_file_present": os.path.exists(METRICS_FILE),
    }


@app.get("/api/stats", tags=["Dashboard"])
def global_hackathon_stats():
    base_stats = get_dashboard_stats() or {}
    try:
        rings = load_rings()
        fraud_rings_count    = len(rings)
        suspicious_amount    = calculate_suspicious_amount(rings)
    except HTTPException:
        fraud_rings_count = 0
        suspicious_amount = base_stats.get("suspicious_amount", 0.0)

    metrics = read_all_metrics()

    return {
        "total_accounts":    base_stats.get("total_accounts", 0),
        "fraud_rings":       fraud_rings_count,
        "suspicious_amount": suspicious_amount,
        "model_f1":          metrics.get("f1", 0.0),
        "metrics":           metrics
    }


@app.get("/api/rings", tags=["Rings"])
def list_rings():
    return load_rings()


@app.get("/api/rings/stats", tags=["Rings"])
def ring_stats():
    return get_ring_stats()


@app.get("/api/rings/graph", tags=["Rings"])
def ring_graph():
    return get_ring_graph()


@app.get("/api/rings/{ring_id}", tags=["Rings"])
def ring_detail(ring_id: str):
    rings = load_rings()
    ring = next((r for r in rings if r["ring_id"] == ring_id), None)
    if ring is None:
        raise HTTPException(
            status_code=404,
            detail=f"Ring '{ring_id}' not found. Available IDs: {[r['ring_id'] for r in rings[:5]]}…"
        )

    ring = dict(ring)
    ring["subgraph"] = get_subgraph(ring["mastermind"])
    return ring


@app.get("/api/graph/circular-flows", tags=["Graph Analytics"])
def circular_flows():
    return detect_circular_flows()


@app.get("/api/account/{account_id}/flow", tags=["Graph Analytics"])
def fund_flow_paths(
    account_id: str,
    depth: int = 3,
    direction: str = "outbound",
    max_paths: int = 20,
):
    """
    Trace money-flow paths from/to an account with temporal ordering.

    Returns ordered paths where each hop's timestamp is >= the previous hop.
    Paths are ranked by composite risk score (descending).

    Query params:
        depth:     1–5 (default 3)
        direction: outbound | inbound | both
        max_paths: 1–50 (default 20)
    """
    # Clamp inputs
    depth = max(1, min(depth, 5))
    max_paths = max(1, min(max_paths, 50))
    if direction not in ("outbound", "inbound", "both"):
        raise HTTPException(status_code=400, detail="direction must be 'outbound', 'inbound', or 'both'")

    result = get_fund_flow_paths(account_id, depth, direction, max_paths)

    if not result.get("paths") and not result.get("error"):
        # Check if account exists at all
        details = get_account_details(account_id)
        if details is None:
            raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found.")

    return result


@app.get("/api/graph/mule-accounts", tags=["Graph Analytics"])
def mule_accounts():
    return detect_mule_accounts()


@app.get("/api/graph/structuring", tags=["Graph Analytics"])
def structuring():
    return detect_structuring_patterns()


@app.get("/api/masterminds", tags=["Graph Analytics"])
def masterminds():
    return get_top_masterminds()


@app.get("/api/dashboard/stats", tags=["Dashboard"])
def dashboard_stats():
    return get_dashboard_stats()


@app.get("/api/risk/top", tags=["Accounts"])
def top_risk_accounts(limit: int = 20, search: str = None):
    return get_top_risky_accounts(limit, search)


@app.get("/api/account/{account_id}", tags=["Accounts"])
def account_details(account_id: str):
    result = get_account_details(account_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found.")
    return result


@app.get("/api/account/{account_id}/transactions", tags=["Accounts"])
def recent_transactions(account_id: str, limit: int = 20):
    return get_recent_transactions(account_id, limit)


@app.get("/api/subgraph/{account_id}", tags=["Accounts"])
def subgraph(account_id: str):
    return get_subgraph(account_id)


@app.get("/api/report/{ring_id}", response_class=JSONResponse, tags=["Reports"])
def generate_report(ring_id: str):
    rings = load_rings()
    
    # Strip out "ring_" so a request for "ring_206" safely matches "206" in the JSON
    clean_req_id = ring_id.replace("ring_", "")
    ring = next((r for r in rings if str(r.get("ring_id", "")).replace("ring_", "") == clean_req_id), None)
    
    if ring is None:
        raise HTTPException(status_code=404, detail=f"Ring '{ring_id}' not found.")
    
    return generate_str_report(ring["ring_id"])

@app.get("/api/timeline/{ring_id}", tags=["Reports"])
def get_timeline(ring_id: str) -> list[dict[str, Any]]:
    rings = load_rings()
    
    # 1. Strip out "ring_" just like we did for the STR report
    clean_req_id = ring_id.replace("ring_", "")
    ring = next((r for r in rings if str(r.get("ring_id", "")).replace("ring_", "") == clean_req_id), None)
    
    if ring is None:
        raise HTTPException(status_code=404, detail=f"Ring '{ring_id}' not found.")

    # 2. Get members of the ring
    members = ring.get("members", [])

    # 3. Fetch transactions between the members from Neo4j
    txs = get_ring_transactions(members, limit=20)

    # 4. Map to response format
    timeline: list[dict[str, Any]] = []
    for t in txs:
        timeline.append({
            "from_acc": str(t.get("from_acc") or "Unknown"),
            "to_acc":   str(t.get("to_acc")   or "Unknown"),
            "amount":   float(t.get("amount")  or 0.0),
            "fmt":      str(t.get("fmt")       or "TRANSFER"),
            "fraud":    int(t.get("fraud")     or 0),
            "ts":       str(t.get("ts")        or "Unknown"),
        })

    return timeline


# ────────────────────────────────────────────────────────────────────────────────
# TASK 18 — DORMANT ACCOUNT FLAG
# GET /api/graph/dormant-accounts
# Detect accounts inactive for ≥ min_dormant_days that were reactivated.
# ────────────────────────────────────────────────────────────────────────────────
@app.get("/api/graph/dormant-accounts", tags=["Graph Analytics"])
def get_dormant_accounts(
    limit: int = 50,
    min_dormant_days: int = 90,
) -> list[dict[str, Any]]:
    """
    Return accounts that were dormant for **min_dormant_days** or more and
    subsequently reactivated (Interpretation B — most-recent gap only).

    Response fields (12 total):
    - account_id, days_dormant, reactivation_date
    - transaction_volume_first_7_days, transaction_count_first_7_days
    - out_degree_first_7_days, unique_destinations_first_7_days
    - rapid_fanout_flag, mule_signature_flag
    - gnn_fraud_probability, propagated_risk_score, risk_level
    """
    try:
        return detect_dormant_accounts(
            limit=max(1, min(limit, 200)),
            min_dormant_days=max(1, min_dormant_days),
        )
    except Exception as exc:
        logger.error("Error in /api/graph/dormant-accounts: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Dormant account detection failed: {exc}",
        )


# ────────────────────────────────────────────────────────────────────────────────
# 5. KYC BEHAVIOUR MISMATCH (TASK 19)
# ────────────────────────────────────────────────────────────────────────────────
@app.get("/api/graph/kyc-mismatches", tags=["Graph Analytics"])
def get_kyc_mismatches_endpoint(
    limit: int = 50,
) -> list[dict[str, Any]]:
    """
    Return accounts whose transactional behaviour deviates from their KYC peer group.
    Results are pre-calculated by the ML pipeline (ml/kyc_mismatch.py).
    """
    try:
        return get_kyc_mismatches(
            limit=max(1, min(limit, 200)),
        )
    except Exception as exc:
        logger.error("Error in /api/graph/kyc-mismatches: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"KYC Mismatch retrieval failed: {exc}",
        )

# ────────────────────────────────────────────────────────────────────────────────
# 6. ACCOUNT TIMELINE (TASK 20)
# ────────────────────────────────────────────────────────────────────────────────
@app.get("/api/account/{account_id}/timeline", tags=["Accounts"])
def get_account_timeline_endpoint(account_id: str) -> list[dict[str, Any]]:
    """
    Returns the full transaction history for an account as a timeline.
    """
    try:
        return get_account_timeline(account_id)
    except Exception as exc:
        logger.error("Error in /api/account/{account_id}/timeline: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Account timeline retrieval failed: {exc}",
        )