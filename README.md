# SecureLedger — AML Transaction Monitoring System

> **PSBs Hackathon 2026 · iDEA 2.0 · Union Bank of India · PS3: Fund Flow Tracking**  
> Team: SecureLedger

SecureLedger is an Anti-Money Laundering (AML) Transaction Monitoring system that ingests the IBM AML dataset, models inter-bank account relationships as a directed graph, applies a multi-stage ML pipeline, detects fraud rings, and exposes an interactive investigation dashboard for AML analysts.

---

## Problem Being Solved

Union Bank processes millions of inter-bank transactions daily. Traditional rule-based AML systems flag individual transactions in isolation and miss coordinated laundering networks — circular fund flows, mule account chains, and currency layering schemes that span dozens of accounts across multiple hops. SecureLedger models the entire transaction graph to surface these hidden rings and identify the mastermind account within each one.

---

## Architecture Overview

```
IBM AML Dataset (HI-Small_Trans.csv)
        │
        ▼  Pandas 2.0 · SHA-256 ID anonymisation
LAYER 1 — DATA INGESTION
        │
        ▼  NetworkX DiGraph (in-memory, no server required)
LAYER 2 — GRAPH CONSTRUCTION
        │   ~515K Account nodes · ~1.5M TRANSACTION edges
        ▼
LAYER 3 — ML PIPELINE
        │   Stage A : Node2Vec embeddings       (64-dim, PyTorch Geometric)
        │   Stage B : Isolation Forest          (anomaly_score per account)
        │   Stage C : Fund Flow Propagation     (decay=0.5, 3 iterations)
        │   Stage D : GraphSAGE                 (fraud_prob, F1 ≈ 0.82)
        ▼
LAYER 4 — FRAUD RING DETECTION
        │   Louvain community detection on fraud_prob > 0.5 subgraph
        │   4 AML typologies detected via pattern queries
        │   Mastermind = 0.5 × PageRank + 0.5 × Betweenness Centrality
        ▼  Ring JSON → FastAPI
LAYER 5 — INVESTIGATION DASHBOARD  (React + Vite + FastAPI)
        ▼
LAYER 6 — EVIDENCE PACKAGE  (auto-generated FIU-STR per ring)
```

---

## How to Run Locally

### Prerequisites

- Python 3.11+
- Node.js 18+ (for the React dashboard)

### 1. Clone the repository

```bash
git clone https://github.com/<your-org>/SecureLedger.git
cd SecureLedger
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 3. Download the dataset

The IBM AML dataset is publicly available on Kaggle (CDLA-Sharing-1.0 licence):

```
https://www.kaggle.com/datasets/ealtman2019/ibm-transactions-for-anti-money-laundering-aml
```

Place `HI-Small_Trans.csv` in the `data/` folder.  
**Alternatively**, generate a small synthetic dataset to test without Kaggle:

```bash
python scripts/generate_synthetic_data.py
# Creates data/synthetic_trans.csv with 10,000 rows
```

### 4. Run the ML pipeline

```bash
# Ingest CSV → build NetworkX graph → save graph.gpickle
python ml/ingest.py

# Stage A — Node2Vec embeddings → ml/embeddings.npy
python ml/node2vec_train.py

# Stage B — Isolation Forest anomaly scoring → updates graph
python ml/isolation_forest.py

# Stage C — Fund Flow Propagation → updates graph
python ml/propagation.py

# Stage D — GraphSAGE supervised fraud probability → updates graph
python ml/graphsage_train.py

# Pattern detection + Louvain ring identification → ml/rings.json
python ml/patterns.py
```

Or run the full pipeline in one shot:

```bash
python ml/run_pipeline.py
```

### 5. Start the API

```bash
cd api
uvicorn main:app --reload --port 8000
# Swagger docs: http://localhost:8000/docs
```

### 6. Start the frontend

```bash
cd frontend
npm install
npm run dev
# Dashboard: http://localhost:5173
```

### 7. Run in Google Colab (no local setup)

Open the self-contained notebook:

```
notebooks/SecureLedger_Colab.ipynb
```

It installs all dependencies, generates synthetic data, runs the pipeline, and launches a Gradio dashboard — all in one notebook.

---

## Libraries & Dependencies

| Package | Version | Purpose |
|---|---|---|
| pandas | 2.0.3 | CSV ingestion & preprocessing |
| networkx | 3.3 | In-memory directed graph (replaces Neo4j) |
| python-louvain | 0.16 | Louvain community detection |
| scikit-learn | 1.4.2 | Isolation Forest, MinMaxScaler |
| torch | 2.2.2 | PyTorch for GNN training |
| torch-geometric | 2.5.3 | Node2Vec, GraphSAGE |
| fastapi | 0.111.0 | REST API backend |
| uvicorn | 0.29.0 | ASGI server |
| gradio | 4.x | Colab-compatible dashboard alternative |

Full list: [`requirements.txt`](requirements.txt)

---

## Sample Dataset

Two options:

1. **IBM AML dataset** — `HI-Small_Trans.csv` from Kaggle (link above). ~5M rows, Sep 1–10 2022. Pipeline loads first 3 days (~1.5M transactions).
2. **Synthetic dataset** — run `python scripts/generate_synthetic_data.py`. Produces 10,000 transactions with injected circular flows, mule chains, and currency layering for quick testing.

---

## Project Structure

```
SecureLedger/
├── data/
│   └── .gitkeep                  # Place HI-Small_Trans.csv here
├── ml/
│   ├── ingest.py                 # CSV → NetworkX graph
│   ├── hash_utils.py             # SHA-256 account anonymisation
│   ├── node2vec_train.py         # Stage A: embeddings
│   ├── isolation_forest.py       # Stage B: anomaly scoring
│   ├── propagation.py            # Stage C: fund flow propagation
│   ├── graphsage_train.py        # Stage D: supervised GNN
│   ├── patterns.py               # Ring detection & typology matching
│   └── run_pipeline.py           # One-shot full pipeline runner
├── api/
│   ├── main.py                   # FastAPI app & routes
│   ├── graph_queries.py          # NetworkX query helpers
│   └── str_generator.py          # STR report builder
├── frontend/
│   ├── src/
│   │   ├── components/           # RiskTable, GraphVisualiser, RingCard
│   │   ├── pages/                # Dashboard, FraudRings, Investigator
│   │   └── utils/api.js          # Axios API client
│   ├── package.json
│   └── vite.config.js
├── scripts/
│   ├── generate_synthetic_data.py
│   └── simulate_transaction.py   # Live demo transaction injector
├── notebooks/
│   └── SecureLedger_Colab.ipynb  # Self-contained Colab demo
├── docs/
│   └── SecureLedger_D3_Technical_Architecture.docx
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

---

## API Routes

| Method | Route | Description |
|---|---|---|
| GET | `/ping` | Health check |
| GET | `/account/{id}` | Account scores (anomaly, fraud_prob, propagated_risk) |
| GET | `/account/{id}/subgraph` | Ego-network JSON for graph visualiser |
| GET | `/risk/top` | Top accounts by anomaly score |
| GET | `/rings` | All detected fraud rings |
| GET | `/rings/{id}` | Ring detail with pattern badges |
| GET | `/evidence/{id}` | FIU-STR text for a ring |
| GET | `/stats` | Dataset & model summary stats |

---

## ML Results

| Model | Metric | Value |
|---|---|---|
| GraphSAGE | F1 Score | ~0.82 |
| Isolation Forest | Contamination rate | 1% |
| Node2Vec | Embedding dimensions | 64 |
| GraphSAGE | Positive class weight | 100× |
| Louvain | fraud_prob threshold | > 0.5 |
| Mastermind score | PageRank weight | 0.5 |
| Mastermind score | Betweenness weight | 0.5 |

---

## AML Typologies Detected

| # | Pattern | Detection Method |
|---|---|---|
| 1 | **Circular Fund Flow** | DFS cycle detection, path length 3–4 hops, is_laundering=1 edges |
| 2 | **Mule Account Network** | Fan-in > 5 unique senders + high total_received |
| 3 | **Currency Layering** | pay_currency ≠ recv_currency within high-risk cluster |
| 4 | **Dormant Account Activation** | >10 transactions in a 2-day window |

---

## Known Limitations

- **No live banking connection** — IBM AML synthetic benchmark dataset only.
- **Batch ingestion only** — no real-time streaming (production would need Kafka + Spark).
- **4 typologies covered** — FATF guidance requires 20+ for production AML systems.
- **No authentication / RBAC** — acceptable for a local demo, mandatory for production.
- **STR output is a simulation** — not legally compliant with RBI/FIU-IND XML schema or digital signature requirements.
- **Models trained on 3-day snapshot** — no incremental or online learning.
- **In-memory graph** — NetworkX loads the full graph into RAM (~2–4 GB for 1.5M edges); production would use a persistent graph database.
- **Mastermind ranking** — simple 0.5/0.5 PageRank + Betweenness blend; a production system would use empirically validated criminological weights.

---

## Deliverables

| # | Deliverable | Link |
|---|---|---|
| D1 | Problem + Solution Brief | `docs/D1_Problem_Solution_Brief.pdf` |
| D2 | Technical Demo Video | *(YouTube unlisted link)* |
| D3 | Technical Architecture Document | `docs/SecureLedger_D3_Technical_Architecture.docx` |
| D4 | GitHub Repository (this) | *(GitHub URL)* |
| D5 | Pitch Video + Slide Deck | *(YouTube unlisted link + PDF)* |

---

## Disclaimer

The auto-generated Suspicious Transaction Reports (STRs) simulate the FIU-IND format for demonstration purposes **only**. They are not legally compliant with actual RBI/FIU-IND submission requirements (digital signatures, XML schema).

---

## Licence

Built for PSBs Hackathon 2026 (iDEA 2.0). Dataset: [CDLA-Sharing-1.0](https://cdla.dev/sharing-1-0/) — IBM.
