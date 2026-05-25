# SecureLedger AI Agent Guide

## Purpose
This file helps AI coding agents understand the SecureLedger repository layout, core runtime flows, and the most important developer commands.

## Key Areas
- `run_pipeline.py` is the main orchestrator for the full ML pipeline.
- `ingestion/`, `graph/`, and `ml/` contain the backend data ingestion, Neo4j graph query logic, and machine learning pipeline.
- `api/main.py` exposes the FastAPI backend and relies on `graph.graph_queries` plus generated files in `ml/`.
- `frontend/` is a separate Vite/React application for the dashboard.

## Runtime and Build Commands
Use the following commands from the project root on Windows:

```powershell
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python run_pipeline.py
uvicorn api.main:app --reload
cd frontend
npm install
npm run dev
```

> Note: The shebang `#!/usr/bin/env python3` in `run_pipeline.py` is not compatible with Windows PowerShell. Run the script with `python run_pipeline.py`.

## Important Runtime Assumptions
- Neo4j runs locally at `bolt://localhost:7687` with credentials `neo4j / secureledger123`.
- The dataset file is expected at `data/HI-Small_Trans.csv` or the project root.
- Intermediate artifacts are stored under `ml/`, including `ml/graph.pt`, `ml/embeddings.npy`, and `ml/pipeline_run_report.json`.
- The API also reads `ml/rings.json` and `evaluation_metrics.txt` for runtime routes.

## Pipeline Behavior
`run_pipeline.py` implements a 7-step sequential pipeline:

1. Data Ingestion (`ingestion/ingest.py`)
2. Build PyG Graph (`ml/build_pyg_graph.py`)
3. Node2Vec Embeddings (`ml/embeddings.py`)
4. Anomaly Scores (`ml/anomaly.py`)
5. Risk Propagation (`ml/propagation.py`)
6. GNN Training (`ml/gnnn.py`)
7. Fraud Ring Detection (`ml/louvain.py`)

It supports skip flags, `--from-step`, `--only-step`, `--no-interactive`, `--dry-run`, and `--skip-checks`.

## What Agents Should Know
- Preserve the step ordering and naming when editing pipeline orchestration.
- Use the `run_pipeline.py` CLI to inspect how the pipeline is expected to execute.
- Avoid hard-coding Neo4j connection details in new code unless the repository already uses them.
- Keep API route changes aligned with the `frontend/` dashboard expectations.
- Prefer small, targeted changes in the ML pipeline files, because the repository is structured as a single end-to-end system rather than separate microservices.

## Where to Look First
- `README.md` for high-level project goals and setup instructions.
- `run_pipeline.py` for runtime orchestration and environment checks.
- `api/main.py` for backend startup behavior and file dependencies.
- `frontend/package.json` for UI build scripts.
- `requirements.txt` for Python dependency expectations.
