# SecureLedger
### Graph Intelligence Platform for Tracking Fund Flows and Detecting Financial Fraud

> **PSBs Hackathon Series 2026 · IDEA 2.0 · Union Bank of India**  
> K J Somaiya School of Engineering

---

## Problem Statement

This project addresses the **AML & Financial Fraud Detection** problem statement. Traditional rule-based AML engines analyse transactions in isolation — completely blind to coordinated fraud networks. SecureLedger reframes fraud detection as a graph intelligence problem: accounts are nodes, transactions are directed weighted edges. A 7-step ML pipeline runs from raw CSV to fraud ring detection, enabling investigators to detect circular laundering flows, identify mule account networks, uncover fraud rings via community detection, pinpoint ring masterminds, and generate one-click STR reports for FIU-IND compliance.

---

## Live Demo

 **Demo Video:** *(add link here)*  
 **Live App:** Run locally using instructions below.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Graph DB | Neo4j 5.18 | Account nodes, transaction edges, Cypher cycle detection |
| Embeddings | Node2Vec (64-dim) | Structural neighborhood embeddings  |
| Anomaly Detection | Isolation Forest (300 estimators) | Unsupervised scoring across all around 510K nodes |
| GNN Model | GraphSAGE 3-layer | 2-hop neighborhood aggregation, 74-dim feature input |
| Imbalance Handling | Graph-SMOTE | 5× synthetic fraud nodes interpolated on training set |
| Ring Detection | Louvain + Degree Centrality | Community detection + mastermind isolation |
| Risk Propagation | Custom diffusion engine | 3-iteration weighted propagation, decay=0.5 |
| Backend | FastAPI + Uvicorn | 12 REST endpoints + WebSocket live alerts |
| Frontend | React 19 + Vite | Force-directed graph dashboard |
| Infrastructure | Docker | Neo4j 5.18 containerized deployment |

---

## Core Architecture

```
LAYER 1 — DATA INGESTION & GRAPH CONSTRUCTION
  IBM AML CSV (2,076,752 txns) · SHA-256 account hashing · Neo4j batch ingest

LAYER 2 — GRAPH DATABASE (NEO4J 5.18)
  Account nodes · TRANSACTION edges · 6 composite indexes · Cypher: cycles, mules, subgraphs

LAYER 3 — ML FRAUD DETECTION ENGINE
  Structural embeddings · Isolation Forest · Risk propagation · GraphSAGE+SMOTE · Louvain

LAYER 4 — BACKEND API (FASTAPI + WEBSOCKET)
  12 REST endpoints · WebSocket live alerts · STR generation · Swagger at /docs

LAYER 5 — REACT DASHBOARD (VITE + FORCE GRAPH)
  Dashboard · Risk Table · Fraud Rings · Investigator · Explainability · Live WebSocket
```

---

## Project Structure

```
secureledger/
├── data/                    # Raw IBM AML CSV dataset (HI-Small_Trans.csv)
├── ingestion/               # SHA-256 account hashing + Neo4j batch ingest
├── graph/                   # Cypher query interfaces (cycles, mules, subgraphs)
├── ml/                      # Full ML pipeline
│   ├── embeddings.py        # Node2Vec structural embeddings
│   ├── anomaly.py           # Isolation Forest unsupervised scoring
│   ├── propagation.py       # Dynamic risk diffusion engine
│   ├── gnn.py / gnnn.py     # GraphSAGE classifier + training
│   ├── ring_detection.py    # Louvain community detection + mastermind
│   ├── evidence.py          # STR evidence compiler
│   ├── patterns.py          # Fraud pattern detection
│   ├── build_pyg_graph.py   # PyTorch Geometric graph builder
│   └── write_probs.py       # Score writer to Neo4j
├── api/                     # FastAPI backend (12 endpoints + WebSocket)
├── frontend/                # React 19 + Vite dashboard
├── run_pipeline.py          # Master orchestrator — runs full pipeline end-to-end
├── simulate_transaction.py  # Live transaction injector for demo
├── requirements.txt         # Python dependencies
├── fraud_rings.json         # Detected ring output
└── evaluation_metrics.txt   # Model evaluation results
```

---

## Installation & Setup

### Prerequisites

Ensure the following base dependencies are installed locally on your development system:

- Python 3.10+
- Node.js v18+
- Docker Desktop

### Step 1 — Start the Graph Database

```bash
docker run --name neo4j-secureledger \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/secureledger123 \
  -d neo4j:5.18
```

> Neo4j Browser available at **http://localhost:7474**  
> User: `neo4j` | Password: `secureledger123`  
> Wait ~30 seconds for initialization to complete.

### Step 2 — Python Environment

```bash
# From the project root
python -m venv venv
source venv/bin/activate          # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
```

### Step 3 — Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

> Frontend runs at **http://localhost:5173**

---

## Running the Pipeline

### Place the Dataset

Before running anything, place `HI-Small_Trans.csv` inside the `data/` directory.

### Run the Full ML Pipeline

This single command handles everything — graph ingestion, embeddings, anomaly scoring, risk propagation, GNN training, ring detection, and evidence generation:

```bash
python run_pipeline.py
```

**What it executes internally, in order:**

| Step | Script | What it does |
|---|---|---|
| 1 | `ingestion/` | Parses CSV, hashes account IDs with SHA-256, batch-loads into Neo4j |
| 2 | `ml/build_pyg_graph.py` | Builds PyTorch Geometric graph from Neo4j data |
| 3 | `ml/embeddings.py` | Runs Node2Vec random walks → 64-dim structural embeddings |
| 4 | `ml/anomaly.py` | Isolation Forest (300 estimators) scores all nodes without labels |
| 5 | `ml/propagation.py` | 3-iteration weighted risk diffusion across full graph (decay=0.5) |
| 6 | `ml/gnnn.py` | Trains 3-layer GraphSAGE with Focal Loss + Weighted CE, 425 epochs |
| 7 | `ml/ring_detection.py` | Louvain community detection → 40,072 rings, mastermind per ring |
| 8 | `ml/evidence.py` | Compiles per-ring STR evidence packages |
| 9 | `ml/write_probs.py` | Writes all scores and ring memberships back to Neo4j |

### Start the API Server

```bash
uvicorn api.main:app --reload
```

API routes available at **http://localhost:8000** | Swagger docs at **http://localhost:8000/docs**

### Troubleshooting — Node2Vec / PyG Installation Errors
 
If `ml/embeddings.py` (Node2Vec) throws errors, your PyTorch Geometric dependencies may be mismatched. Run this fix:
 
```bash
# Step 1 — Clean uninstall
pip uninstall torch torch-geometric torch-cluster pyg-lib -y
 
# Step 2 — Reinstall correct torch version
pip install torch==2.4.1
 
# Step 3 — Reinstall PyG with CPU wheel
pip install torch-geometric==2.6.1
pip install pyg-lib torch-scatter torch-sparse torch-cluster -f https://data.pyg.org/whl/torch-2.4.0+cpu.html
 
# Step 4 — If still failing, try the 2.4.1 wheel instead
pip install pyg-lib torch-cluster -f https://data.pyg.org/whl/torch-2.4.1+cpu.html
```
 
> Use the `torch-2.4.0+cpu.html` index first. If errors persist, switch to `torch-2.4.1+cpu.html` as shown in Step 4.
 
---

### Live Transaction Demo (Optional)

To demonstrate real-time risk propagation during evaluation, run this in a separate terminal:

```bash
python simulate_transaction.py \
  --from-acc "SENDER_ACCOUNT_ID" \
  --to-acc "RECEIVER_ACCOUNT_ID" \
  --amount 250000.0 \
  --fraud 1
```

Refresh the dashboard to see risk scores recalculate across the network instantly.

---

## Dataset

**Source:** IBM AML Dataset (`https://www.kaggle.com/datasets/ealtman2019/ibm-transactions-for-anti-money-laundering-aml?select=HI-Small_Trans.csv`)

| Metric | Value |
|---|---|
| Total Accounts | 5,10,764 |
| Total Transactions | 20,76,752 |
| Fraud Rings Detected | 40,072 |
| High-Risk Accounts Flagged | 1,528 |
| Fraud Account Prevalence | < 1% of network |

Severe class imbalance handled via **Graph-SMOTE** — 5× synthetic fraud nodes interpolated along graph edges, applied to training set only.

---

## ML Pipeline — Technical Detail

### Feature Engineering (74-dim input)

- **Structural embeddings (64-dim):** out-degree, in-degree, PageRank, clustering coefficient, velocity, fan-out ratio — normalised and expanded with decaying Gaussian noise (σₖ = 0.05 × 0.70ᵏ)
- **Transactional features (8-dim):** tx counts, mean amounts, counterparty counts, fraud ratio, active days
- **Degree features (2-dim):** normalised out/in degree from edge index

### GraphSAGE Architecture

| Layer | Operation | Output Dim |
|---|---|---|
| Conv1 | SAGEConv(74→256) + BN + ReLU + Dropout(0.4) | 256 |
| Conv2 | SAGEConv(256→256) + BN + ReLU + Dropout(0.4) | 256 |
| Conv3 | SAGEConv(256→256) + BN + Residual skip (Conv1) | 256 |
| Head | Linear(256→2) + Softmax | 2 |

**Loss:** `L = 0.5 × Focal(α=0.75, γ=2) + 0.5 × WeightedCE(w=[1, 1000])`  
**Training:** 425 epochs · AdamW · Cosine LR · Early stop patience=40 · RTX 4050

### Fraud Patterns Detected

| Pattern | Method | Signal |
|---|---|---|
| Circular Transactions | Cypher 3–4 hop directed cycles | A→B→C→A within minutes, all edges flagged |
| Mule Networks | Out-degree > 15 threshold | Account fans $500K to 22 destinations in 2 hrs |
| Fraud Ring Membership | Louvain community detection | 40,072 rings; largest has 1,573 members |
| Mastermind Isolation | Degree centrality per ring | Highest-centrality node flagged per ring |
| Risk Propagation | 3-iter weighted diffusion | Suspicious neighbour raises propagated risk |
| Ensemble Anomaly | 0.6×GNN + 0.4×IForest | 1,528 accounts flagged high-risk |

---

## Model Performance

> GraphSAGE ensemble with Isolation Forest, evaluated on IBM AML dataset.

| Metric | Score |
|---|---|
| **F1 Score** | **0.9033** |
| Precision | 0.8768 |
| Recall | 0.9315 |
| AUC-ROC | 0.9990 |
| Avg Precision | 0.8905 |
| Best Threshold | 0.65 |
| Training Epochs | 425 |
| Best GNN-only F1 | 0.9235 |

**Confusion Matrix:**
```
[[101773    44]
 [    23   313]]
```

**Ensemble weights:** GNN × 0.6 + IForest × 0.4 · **Run:** 2026-05-25T21:27:02

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/stats` | Global KPIs: accounts, rings, high-risk count, F1 |
| GET | `/api/risk/top` | Top-N accounts ranked by anomaly score |
| GET | `/api/rings` | All fraud rings from `fraud_rings.json` |
| GET | `/api/rings/{id}` | Single ring + 2-hop mastermind subgraph |
| GET | `/api/masterminds` | Top masterminds ranked by centrality |
| GET | `/api/subgraph/{id}` | 2-hop ego-network (80 node cap) |
| GET | `/api/report/{ring_id}` | Auto-generated STR plain-text download |
| GET | `/api/graph/circular-flows` | Live Cypher cycle detection results |
| GET | `/api/graph/mule-accounts` | Out-degree > 15 accounts |
| WS | `/ws/live-transactions` | WebSocket stream with real-time risk delta |

---

## Dashboard Features

| Feature | Description | Technology |
|---|---|---|
| Executive Telemetry | Global KPI cards: nodes, clusters, flagged assets, model metrics | FastAPI + React |
| Risk Matrix Board | Searchable table of anomalous accounts with color-coded threat badges | Isolation Forest + client filtering |
| Fraud Ring Clusters | Visual isolation of closed criminal networks with circular transaction circuits | Louvain community detection |
| Investigator Panel | behavioral flags, 1-click STR report generation | NetworkX centrality + evidence compiler |

---

## Known Limitations

- **Static dataset:** Uses IBM AML CSV snapshot. Production requires Apache Kafka streaming ingestion.
- **Local deployment only:** No cloud or Kubernetes setup; runs entirely on localhost.
- **No authentication:** Open dashboard is acceptable for POC; RBAC required for production.
- **4 fraud typologies:** Circular flows, mule networks, rings, anomaly outliers. Production systems monitor 15–20+ patterns.

---

## Future Roadmap

- **Apache Kafka & Spark Streaming** — replace batch CSV pipeline with real-time event streams
- **CARE-GNN** — relation-aware neighborhood filtering against adversarial camouflage tactics
- **GraphRAG** — LLM-powered investigation assistant over the Neo4j fraud graph
- **Distributed Multi-GPU** — scale GNN training across cloud instances via PyTorch Geometric multi-node

---

## Team

| Name | Contribution |
|---|---|
| Poonam Gupta | ML model development, GNN pipeline |
| Sahaj Bindal | Data pipeline, graph ingestion |
| Nishant Kumar | Backend API, WebSocket integration |
| Shambhavi Singh | Frontend dashboard, documentation |

*K J Somaiya School of Engineering*

---

## Contact

**Team:** SecureLedger  
**Institute:** IIT Kanpur 
**Email:** poonamiitk2028@gmail.com,sahajbindal2005@gmail.com,shambhavis410@gmail.com,nishantkashyapwivedi2006@gmail.com


**Submission:** PSBs Hackathon Series 2026 · IDEA 2.0 · Union Bank of India
