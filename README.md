# SecureLedger

### AI-Powered Financial Fraud Intelligence and Graph Neural Network Engine

Built for the PSBs Hackathon 2026 — Union Bank of India (IDEA 2.0).

## Project Overview

SecureLedger is a next-generation Anti-Money Laundering (AML) and financial fraud intelligence platform built using the IBM AML dataset. Traditional rule-based engines look at accounts in isolation, completely missing complex laundering webs. SecureLedger shifts the paradigm by treating financial ecosystems as multi-hop relational graphs.

By combining **unsupervised graph embeddings**, a custom **dynamic risk propagation engine**, and a supervised **Graph Neural Network (GraphSAGE)** with a live **interactive React dashboard**, the platform automatically detects nested fraud rings, traces transaction flows in real-time, isolates ring masterminds, and drafts regulator-ready Suspicious Transaction Reports (STRs) in a single click.

## Core Technical Architecture

The platform runs an advanced pipeline to convert raw transaction logs into deep criminal intelligence:

1.  **Graph Ingestion Layer (Neo4j):** Parses millions of transaction records, mapping accounts as nodes and transfers as edges with structural properties.
    
2.  **Unsupervised Anomaly Baseline (Node2Vec + Isolation Forest):** Performs multi-hop random walks to learn geometric vector embeddings of neighborhood structural behaviors, passing them to an Isolation Forest to score implicit anomalies without requiring historic labels.
    
3.  **Fund-Flow Risk Propagation Engine:** Runs a dynamic network-wide weight adjustment algorithm. If Account A sends large volumes to suspicious Account B, Account A's implicit risk index escalates automatically across the topological web.
    
4.  **Supervised GNN Classifier (GraphSAGE + Focal Loss):** Aggregates deep neighborhood structural and behavioral features across multi-hop subgraphs. Uses a weighted cross-entropy setup to conquer severe real-world data class imbalance where fraud accounts comprise less than 1% of the network.
    
5.  **Ring Detection & Mastermind Extraction:** Filters high-risk subgraphs and applies the Louvain Community Detection algorithm to isolate closed fraud circuits. Runs local PageRank and Betweenness Centrality metrics within each ring to pinpoint the asset coordinator (Mastermind).
    

## Repository Directory Layout

The codebase is organized modularly to decouple intelligence generation from presentation:


## Repository Directory Layout

The codebase is organized modularly to decouple intelligence generation from presentation:

```text
secureledger/
├── data/         # Core raw data asset storage
├── ingestion/    # Consistent hashing and Neo4j batch ingestion
├── graph/        # Native Cypher analytical query interfaces
├── ml/           # ML pipeline (Node2Vec, GNN, Louvain, Evidence)
├── api/          # High-performance FastAPI routing backend
└── frontend/     # Interactive React dashboard layer (Vite app)
```

## Installation and Environment Setup

### Prerequisites

Ensure the following base dependencies are installed locally on your development system:

-   Python 3.10+
    
-   Node.js (v18+)
    
-   Docker Desktop
    

### 1\. Unified Environment and Dependency Initialization

Run the following commands sequentially to spin up your isolated database container, initialize your Python virtual environment, install all deep-learning frameworks, install the frontend node modules, and launch the frontend application:

```bash
# A. Deploy the graph database layer inside an isolated container space
docker run --name neo4j-secureledger -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/secureledger123 -d neo4j:5.18

# B. Initialize and activate the python virtual environment from the root folder
python -m venv venv
source venv/bin/activate
# Windows terminal: .\venv\Scripts\activate

# C. Install the machine learning dependencies core stack
pip install -r requirements.txt

# D. Navigate into your user interface directory folder and boot the development engine
cd frontend
npm install
npm run dev
```

> **Database Access:** Once initialization completes (~30 seconds), you can log into the native Neo4j Browser utility at http://localhost:7474 using the credentials: **User:** neo4j | **Password:** secureledger123. **Client Portal:** The interactive user interface application will instantiate automatically inside your local browser space at http://localhost:5173. _(Note: Ensure that your raw dataset file HI-Small\_Trans.csv is correctly positioned within the data/ subdirectory before starting automated data execution routines)_.

## Running the Platform

### The Master Execution Pipeline

SecureLedger includes an automated structural orchestrator script. Running this single file handles clean ingestion mapping, node embeddings, unsupervised scoring, risk propagation passes, deep supervised GNN training, cluster grouping, and automated case evidence preparation:

```Bash

python run_pipeline.py
```

### Booting the Live API Layer

To interface your graph network data models cleanly with your web browser app, initiate your high-performance FastAPI server framework:

```Bash

uvicorn api.main:app --reload
```

The service layer routes will dynamically establish on your local machine at http://127.0.0.1:8000.

### Real-Time Interactivity Simulator

To demonstrate live, reactive money laundering interception capabilities during a jury evaluation, execute the live transaction injector script in an independent terminal window:

```Bash

python simulate_transaction.py --from-acc "SENDER_ACCOUNT_ID" --to-acc "RECEIVER_ACCOUNT_ID" --amount 250000.0 --fraud 1
```

_Hit refresh on your web application to witness the dynamic network-wide risk propagation index recalculate across your visible node clusters instantly!_

## Application Core Features

**Feature SpaceFunctional Value PropositionCore Underlying Technology StackExecutive Telemetry**

Global summary cards track processed nodes, mapped clusters, total flagged monetary assets, and cross-validation model parameters.

FastAPI Endpoint + React Dashboard Matrix

**Risk Matrix Board**

Tabular, searchable index of high-probability anomalous targets categorized by dynamic, custom color-coded threat badges.

Isolation Forest Scoring + Client Filtering

**Fraud Ring Clusters**

Structural isolation of closed criminal networks running illegal circular transaction circuits.

Louvain Graph Community Grouping Algorithm

**Investigator Panel**

Chronological ledger timelines, automated behavioral pattern flags, and 1-click text report compiling.

NetworkX Centrality Analytics + Native Evidence Compilers


    

## Future Production Scalability Roadmap

To deliver a production-ready system optimized for true enterprise-scale financial networks, we designed SecureLedger with an architectural layout engineered to easily adopt these downstream integrations:

-   **Apache Kafka & Spark Streaming Integration:** Swap the local file-system batch processing pipeline with continuous, multi-partition event streams to catch suspicious behaviors at runtime.
    
-   **Camouflage Resistance (CARE-GNN):** Integrate relation-aware neighborhood filtering mechanics into our GNN pipeline to seamlessly filter out intentional, deceptive noise added by advanced financial adversaries.
    
-   **Distributed Multi-GPU Clusters:** Scale up model performance profiles across massive production graph terrains by shifting localized graph analytics onto distributed cloud instances using PyTorch Geometric's native multi-node training capabilities.
