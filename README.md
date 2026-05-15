# Secureledger

### AI-Powered Financial Fraud Intelligence & Graph Neural Network Engine
Built for the **PSBs Hackathon 2026 — Union Bank of India (IDEA 2.0)**.

---

## Project Overview

SecureLedger is a next-generation Anti-Money Laundering (AML) and financial fraud intelligence platform. Traditional rule-based engines look at accounts in isolation, completely missing complex laundering webs. SecureLedger shifts the paradigm by treating financial ecosystems as multi-hop relational graphs.

By combining **unsupervised graph embeddings**, a custom **dynamic risk propagation engine**, and a supervised **Graph Neural Network (GraphSAGE)** with a live **interactive React dashboard**, the platform automatically detects nested fraud rings, traces transaction flows in real-time, isolates ring masterminds, and drafts regulator-ready Suspicious Transaction Reports (STRs) in a single click.

---

## Core Technical Architecture

The platform runs an advanced 4-tier pipeline to convert raw transaction logs into deep criminal intelligence:

1. **Graph Ingestion Layer (Neo4j):** Parses millions of transaction records, mapping accounts as nodes and transfers as edges with structural properties.
2. **Unsupervised Anomaly Baseline (Node2Vec + Isolation Forest):** Performs multi-hop random walks to learn geometric vector embeddings of neighborhood structural behaviors, passing them to an Isolation Forest to score implicit anomalies without requiring historic labels.
3. **Fund-Flow Risk Propagation Engine:** Runs a dynamic network-wide weight adjustment algorithm. If Account A sends large volumes to suspicious Account B, Account A's implicit risk index escalates automatically across the topological web.
4. **Supervised GNN Classifier (GraphSAGE + Focal Loss):** Aggregates deep neighborhood structural and behavioral features across multi-hop subgraphs. Uses a weighted cross-entropy Focal Loss function to conquer severe real-world data class imbalance (where fraud accounts comprise $<1\%$ of the network).
5. **Ring Detection & Mastermind Extraction:** Filters high-risk subgraphs and applies the Louvain Community Detection algorithm to isolate closed fraud circuits. Runs local PageRank and Betweenness Centrality metrics within each ring to pinpoint the asset coordinator (Mastermind).

---

## Repository Directory Layout

The codebase is organized modularly to decouple intelligence generation from presentation:

```text
secureledger/
├── data/                  # Core raw data asset storage 
├── ingestion/             # Consistent hashing and Neo4j batch ingestion 
├── graph/                 # Native Cypher analytical query interfaces 
├── ml/                    # ML pipeline (Node2Vec, GNN, Louvain, Evidence) 
├── api/                   # High-performance FastAPI routing backend 
└── frontend/              # Interactive React dashboard layer (Vite app) 
