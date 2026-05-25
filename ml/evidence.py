import json
from pathlib import Path
from datetime import datetime


# =========================================================
# LOAD RINGS
# =========================================================

RINGS_PATH = Path("ml/rings.json")


def load_rings():

    if not RINGS_PATH.exists():

        raise FileNotFoundError(
            "ml/rings.json not found"
        )

    with open(RINGS_PATH, "r") as f:

        rings = json.load(f)

    return rings


# =========================================================
# GENERATE EVIDENCE
# =========================================================

def generate_evidence(ring_id):

    rings = load_rings()

    # =====================================================
    # CORRECTED RING LOOKUP
    # =====================================================

    target_ring = None

    for ring in rings:

        if int(ring["ring_id"]) == int(ring_id):

            target_ring = ring
            break

    if target_ring is None:

        raise ValueError(
            f"Ring '{ring_id}' not found — cannot generate report."
        )

    # =====================================================
    # CORRECTED MEMBERS FIELD
    # =====================================================

    nodes = target_ring["members"]

    mastermind = target_ring.get(
        "mastermind",
        "UNKNOWN"
    )

    evidence = {

        "ring_id": target_ring["ring_id"],

        "mastermind": mastermind,

        "nodes": nodes,

        "member_count": len(nodes),

        "fraud_ratio": target_ring.get(
            "fraud_ratio",
            0.0
        ),

        "avg_degree": target_ring.get(
            "avg_degree",
            0.0
        ),

        "total_volume": target_ring.get(
            "total_volume",
            0.0
        ),

        "scores": target_ring.get(
            "scores",
            {}
        )
    }

    return evidence


# =========================================================
# GENERATE STR REPORT
# =========================================================

def generate_str_report(ring_id):

    rings = load_rings()

    # =====================================================
    # CORRECTED RING LOOKUP
    # =====================================================

    target_ring = None

    for ring in rings:

        if int(ring["ring_id"]) == int(ring_id):

            target_ring = ring
            break

    if target_ring is None:

        raise ValueError(
            f"Ring '{ring_id}' not found — cannot generate report."
        )

    # =====================================================
    # CORRECTED MEMBERS FIELD
    # =====================================================

    nodes = target_ring["members"]

    mastermind = target_ring.get(
        "mastermind",
        "UNKNOWN"
    )

    report = {

        # =================================================
        # CORRECTED REPORT ID
        # =================================================

        "report_id": f'SEC-{target_ring["ring_id"]}',

        "generated_at": datetime.now().isoformat(),

        "ring_id": target_ring["ring_id"],

        "mastermind": mastermind,

        "nodes": nodes,

        "member_count": len(nodes),

        "fraud_ratio": target_ring.get(
            "fraud_ratio",
            0.0
        ),

        "avg_degree": target_ring.get(
            "avg_degree",
            0.0
        ),

        "total_volume": target_ring.get(
            "total_volume",
            0.0
        ),

        "risk_level": "HIGH",

        "summary": (
            f"Fraud ring "
            f"{target_ring['ring_id']} "
            f"contains "
            f"{len(nodes)} accounts "
            f"with mastermind "
            f"{mastermind}."
        )
    }

    return report