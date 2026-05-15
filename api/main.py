"""
api/main.py
FastAPI backend — SecureLedger AML Investigation API

Loads graph.gpickle + rings.json at startup.
All graph queries run against the in-memory NetworkX DiGraph.

Routes:
  GET /ping
  GET /account/{id}
  GET /account/{id}/subgraph
  GET /risk/top
  GET /rings
  GET /rings/{ring_id}
  GET /evidence/{ring_id}
  GET /stats
"""

import json
import os
import sys
from pathlib import Path

# Allow running from repo root or from api/ directory
sys.path.insert(0, str(Path(__file__).parent.parent / "ml"))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

import graph_queries as gq
from str_generator import generate_str
from ingest import load_graph

load_dotenv()

GRAPH_PATH = os.getenv("GRAPH_PATH", "ml/graph.gpickle")
RINGS_PATH = os.getenv("RINGS_PATH", "ml/rings.json")

app = FastAPI(
    title="SecureLedger AML API",
    description="Fund flow tracking & fraud ring investigation — PSBs Hackathon 2026",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Startup: load graph & rings ────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    app.state.graph = load_graph(GRAPH_PATH)
    with open(RINGS_PATH) as f:
        app.state.rings = json.load(f)
    print(f"[SecureLedger] Graph loaded: "
          f"{app.state.graph.number_of_nodes():,} nodes, "
          f"{app.state.graph.number_of_edges():,} edges | "
          f"{len(app.state.rings)} rings")


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/ping")
def ping():
    return {"status": "ok", "service": "SecureLedger AML API"}


@app.get("/account/{account_id}")
def get_account(account_id: str):
    result = gq.get_account(app.state.graph, account_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return result


@app.get("/account/{account_id}/subgraph")
def get_subgraph(account_id: str, hops: int = 2):
    if not app.state.graph.has_node(account_id):
        raise HTTPException(status_code=404, detail="Account not found")
    return gq.get_subgraph(app.state.graph, account_id, hops=min(hops, 3))


@app.get("/risk/top")
def top_risk(limit: int = 50):
    return gq.get_top_risk(app.state.graph, limit=min(limit, 200))


@app.get("/rings")
def list_rings():
    return app.state.rings


@app.get("/rings/{ring_id}")
def get_ring(ring_id: str):
    ring = next((r for r in app.state.rings if r["ring_id"] == ring_id), None)
    if ring is None:
        raise HTTPException(status_code=404, detail="Ring not found")
    return ring


@app.get("/evidence/{ring_id}")
def get_evidence(ring_id: str):
    ring = next((r for r in app.state.rings if r["ring_id"] == ring_id), None)
    if ring is None:
        raise HTTPException(status_code=404, detail="Ring not found")
    return {"ring_id": ring_id, "str_report": generate_str(ring)}


@app.get("/stats")
def stats():
    return gq.get_stats(app.state.graph, app.state.rings)
