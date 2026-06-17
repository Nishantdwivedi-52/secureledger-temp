# Task 19 — KYC Behaviour Mismatch Engine

## What It Does & Why We Need It

The KYC Mismatch Engine detects accounts whose **transactional behaviour deviates from their KYC peer group**. This is the #1 AML red flag that regulators look for — an account classified as "Farmer" suddenly moving money like a money service business.

### The 5 Sub-Detectors

| # | Sub-Detector | What It Catches | Why Simple Rules Miss It |
|---|---|---|---|
| 1 | **Multi-dimensional Z-score** | Accounts deviating on 2+ feature dimensions beyond 2.5σ from their peer group mean | Single-feature thresholds miss accounts anomalous on combinations (e.g., high fan-out + high counterparty count) |
| 2 | **Mahalanobis Distance** | Correlated feature anomalies within peer group covariance | Z-score treats each dimension independently; a shop owner with high tx_count + low avg_amount looks normal on Z-score but Mahalanobis catches it when the *joint* distribution is anomalous |
| 3 | **Income Mismatch** | Monthly transaction volume exceeding expected monthly cap (income/12) by > 2× | Annual income comparison is too coarse; monthly cap catches structuring attempts |
| 4 | **Temporal Drift** | Accounts whose early vs recent behaviour diverges (cosine distance between period feature vectors) | Catches gradual fraud escalation and dormant account reactivation that rolling windows miss |
| 5 | **GNN Fusion** | Boosts composite score when GraphSAGE probability agrees with behavioural anomaly | Combines structural (graph) signal with behavioural signal — strongest differentiator |

### How It Works In This Project

The detector uses the **same 73-dim feature matrix** that GraphSAGE trains on (64-dim Node2Vec + 7 hand-crafted + 2 degree features). Since our dataset (`HI-Small_Trans.csv`) doesn't include KYC fields (occupation, income), we **synthesize realistic peer groups and income from the transaction patterns themselves** — accounts are clustered by their behavioural fingerprint into peer groups using K-Means, and income is estimated from total transaction volume. This is actually how real AML systems bootstrap when KYC data is incomplete.

## Proposed Changes

### ML Layer

#### [NEW] [kyc_mismatch.py](file:///c:/Users/HP/secureledger-temp/ml/kyc_mismatch.py)

The core detector class `KYCBehaviourMismatchDetector` with:
- `fit(features, accounts_df)` — clusters accounts into peer groups, computes group stats
- `detect()` — runs all 5 sub-detectors, returns scored results
- `save_results(path)` — writes `ml/kyc_mismatch_results.json`

**Data flow:** Reads `ml/embeddings.npy` + queries Neo4j for the same 7 rich features used in `gnnn.py`, builds the 73-dim feature matrix, synthesizes peer groups via K-Means clustering on feature subspace, then runs the 5 sub-detectors.

---

### Backend API

#### [MODIFY] [graph_queries.py](file:///c:/Users/HP/secureledger-temp/graph/graph_queries.py)

Add `get_kyc_mismatches()` function that reads from `ml/kyc_mismatch_results.json` (with a fallback when the file doesn't exist).

#### [MODIFY] [main.py](file:///c:/Users/HP/secureledger-temp/api/main.py)

Add:
- `GET /api/graph/kyc-mismatches` — returns all flagged accounts with their sub-detector scores
- Import `get_kyc_mismatches` from `graph_queries`

---

### Frontend

#### [NEW] [KYCMismatch.jsx](file:///c:/Users/HP/secureledger-temp/frontend/src/pages/KYCMismatch.jsx)

Full page following the exact same architecture as `DormantAccounts.jsx`:
- 4 KPI stat cards (Total Flagged, Critical, Multi-Dimensional Anomalies, GNN-Boosted)
- Expandable table showing each flagged account with all 5 sub-detector scores
- Radar chart per account showing the 5 sub-detector scores
- Risk badges, copy buttons, "Trace Flows" links

#### [MODIFY] [App.jsx](file:///c:/Users/HP/secureledger-temp/frontend/src/App.jsx)

Add route: `<Route path="/kyc" element={<KYCMismatch />} />`

#### [MODIFY] [Navbar.jsx](file:///c:/Users/HP/secureledger-temp/frontend/src/components/Navbar.jsx)

Add link: `{ to: "/kyc", label: "KYC Mismatch" }`

## Verification Plan

### Manual Verification
- Start the API server and hit `GET /api/graph/kyc-mismatches` — should return JSON with flagged accounts
- Open the frontend at `/kyc` — should show the KYC Mismatch page with stat cards and table
- Click "View Details" on a row — should show all 5 sub-detector scores
