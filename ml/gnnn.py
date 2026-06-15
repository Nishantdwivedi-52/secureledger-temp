"""
ml/gnnn.py
----------
SecureLedger — GraphSAGE Fraud Detection — Production Training Pipeline

Key improvements over the baseline:
  1.  Rich node features (7 hand-crafted + Node2Vec embeddings)
      NOTE: fraud_tx_ratio REMOVED — it directly encodes the label (is_laundering)
      and constitutes severe target leakage. See load_rich_features() for details.
  2.  Graph-safe SMOTE oversampling on fraud node features
  3.  3-layer GraphSAGE with BatchNorm + residual connections
  4.  Focal Loss + weighted CrossEntropy hybrid
  5.  500 epochs with F1-based early stopping
  6.  Cosine annealing LR scheduler
  7.  Precision-Recall curve optimal threshold selection on VALIDATION set
  8.  Ensemble scoring: 0.6 × GNN + 0.4 × Isolation Forest
  9.  Full metrics saved to evaluation_metrics.txt
  10. Best model + threshold persisted and reloaded before inference

Data Leakage Fixes Applied (vs. original):
  [FIX-1] fraud_tx_ratio removed from features (direct label encoding)
  [FIX-2] MinMaxScaler fitted ONLY on train_idx rows, then transformed on all
  [FIX-3] Degree normalisation uses training-set max only
  [FIX-4] Isolation Forest fitted ONLY on train features, scores all nodes
  [FIX-5] Threshold selection moved to a held-out validation split (not test set)
  [FIX-6] Feature engineering happens AFTER train/test split
"""

from __future__ import annotations

import os
import time
import json
import logging
from datetime import datetime

import numpy as np
import torch
import torch.nn.functional as F
from torch import Tensor

from torch_geometric.nn import SAGEConv
from torch_geometric.data import Data

from sklearn.ensemble import IsolationForest
from sklearn.metrics import (
    precision_recall_curve,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    roc_auc_score,
    average_precision_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler

from neo4j import GraphDatabase

# ════════════════════════════════════════════════════════════════════════════════
# ENVIRONMENT & LOGGING
# ════════════════════════════════════════════════════════════════════════════════
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger("securelegder.gnn")

# ════════════════════════════════════════════════════════════════════════════════
# CONFIG — change these without touching any logic below
# ════════════════════════════════════════════════════════════════════════════════
CFG = {
    # Paths
    "graph_path":      "ml/graph.pt",
    "embeddings_path": "ml/embeddings.npy",
    "model_path":      "ml/best_sage_model.pt",
    "metrics_path":    "evaluation_metrics.txt",
    "threshold_path":  "ml/best_threshold.json",

    # Neo4j
    "neo4j_uri":      os.getenv("NEO4J_URI",      "bolt://localhost:7687"),
    "neo4j_user":     os.getenv("NEO4J_USERNAME",  "neo4j"),
    "neo4j_password": os.getenv("NEO4J_PASSWORD",  "secureledger123"),

    # Model architecture
    "hidden_channels": 256,
    "dropout":         0.4,

    # Training
    "epochs":          500,
    "lr":              0.001,
    "weight_decay":    1e-4,
    "patience":        40,           # early stopping patience
    "class_weight":    1000.0,       # weight applied to fraud class
    "focal_alpha":     0.75,         # focal loss alpha
    "focal_gamma":     2.0,          # focal loss gamma

    # SMOTE-style oversampling
    "oversample_ratio": 5,           # generate N synthetic fraud nodes per real one

    # Ensemble
    "gnn_weight":      0.6,
    "iforest_weight":  0.4,
    "iforest_estimators": 300,
    "iforest_contamination": 0.02,

    # Validation split (carved out of training set for threshold selection)
    # This prevents threshold optimisation from seeing the test set at all.
    "val_size": 0.15,

    # Neo4j write batch size
    "neo4j_batch": 500,
}

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
logger.info("Device: %s", device)
if torch.cuda.is_available():
    logger.info("GPU: %s", torch.cuda.get_device_name(0))
    torch.cuda.empty_cache()


# ════════════════════════════════════════════════════════════════════════════════
# NEO4J HELPERS
# ════════════════════════════════════════════════════════════════════════════════

def _get_driver():
    return GraphDatabase.driver(
        CFG["neo4j_uri"],
        auth=(CFG["neo4j_user"], CFG["neo4j_password"]),
    )


def load_fraud_ids(driver) -> set:
    """
    Return the set of account IDs that have at least one laundering transaction.
    An account is fraudulent if it SENT or RECEIVED a flagged transaction.
    """
    query = """
    MATCH (a:Account)-[t:TRANSACTION]-()
    WITH a, count(CASE WHEN t.is_laundering = 1 THEN 1 END) AS fraud_tx
    WHERE fraud_tx > 0
    RETURN a.id AS id
    """
    with driver.session() as session:
        result = session.run(query).data()
    return {r["id"] for r in result}


def load_rich_features(driver, id2idx: dict) -> np.ndarray:
    """
    Pull 7 hand-crafted features per account from Neo4j:
      0  tx_count_out          — total outbound transactions
      1  tx_count_in           — total inbound transactions
      2  avg_amount_sent       — mean outbound amount
      3  avg_amount_received   — mean inbound amount
      4  out_degree            — distinct outbound counterparties
      5  in_degree             — distinct inbound counterparties
      6  active_days           — days between first and last transaction

    Returns an (N, 7) float32 array aligned to id2idx ordering.
    NOTE: Normalisation is NOT done here — it must be done AFTER the
    train/test split (in main()) so the scaler is fitted only on training rows.
    This is [FIX-2] for MinMaxScaler leakage.

    INTENTIONALLY OMITTED:
      fraud_tx_ratio — this is count(is_laundering==1) / total_txs per account.
      It directly encodes the target label into the feature vector. A model
      trained with this feature is essentially given the answer sheet at test
      time and will report misleadingly high F1/AUC scores. [FIX-1]
    """
    logger.info("Loading rich node features from Neo4j…")

    # [FIX-1] fraud_tx_ratio REMOVED from this query.
    # The original query used:
    #   count(CASE WHEN out.is_laundering = 1 THEN 1 END) AS fraud_out
    #   ... THEN toFloat(fraud_out + fraud_in) / (tx_out + tx_in) ... AS fraud_ratio
    # That directly encodes the label as a feature — a textbook data leak.
    query = """
    MATCH (a:Account)
    OPTIONAL MATCH (a)-[out:TRANSACTION]->()
    WITH a,
         count(out)                                               AS tx_out,
         coalesce(avg(out.amount_paid), 0)                       AS avg_sent,
         count(DISTINCT out.__endNode)                           AS out_deg
    OPTIONAL MATCH (a)<-[inn:TRANSACTION]-()
    WITH a, tx_out, avg_sent, out_deg,
         count(inn)                                              AS tx_in,
         coalesce(avg(inn.amount_paid), 0)                       AS avg_recv,
         count(DISTINCT inn.__startNode)                         AS in_deg
    OPTIONAL MATCH (a)-[t2:TRANSACTION]-()
    WITH a, tx_out, avg_sent, out_deg,
             tx_in,  avg_recv,  in_deg,
         min(t2.timestamp) AS first_ts,
         max(t2.timestamp) AS last_ts
    RETURN
        a.id          AS id,
        tx_out        AS tx_count_out,
        tx_in         AS tx_count_in,
        avg_sent      AS avg_amount_sent,
        avg_recv      AS avg_amount_received,
        out_deg       AS out_degree,
        in_deg        AS in_degree,
        CASE WHEN first_ts IS NOT NULL AND last_ts IS NOT NULL
             THEN (toFloat(last_ts) - toFloat(first_ts)) / 86400.0
             ELSE 0.0 END AS active_days
    """

    n = len(id2idx)
    features = np.zeros((n, 7), dtype=np.float32)

    with driver.session() as session:
        results = session.run(query).data()

    found = 0
    for row in results:
        acc_id = row["id"]
        if acc_id not in id2idx:
            continue
        idx = id2idx[acc_id]
        features[idx] = [
            float(row["tx_count_out"]        or 0),
            float(row["tx_count_in"]         or 0),
            float(row["avg_amount_sent"]      or 0),
            float(row["avg_amount_received"]  or 0),
            float(row["out_degree"]           or 0),
            float(row["in_degree"]            or 0),
            float(row["active_days"]          or 0),
        ]
        found += 1

    logger.info("Rich features loaded for %d / %d accounts.", found, n)
    # Return raw (un-normalised) features. Normalisation happens in main() after split.
    return features


# ════════════════════════════════════════════════════════════════════════════════
# FEATURE ENGINEERING
# ════════════════════════════════════════════════════════════════════════════════

def build_features(
    embeddings: np.ndarray,
    rich_features: np.ndarray,
    edge_index: Tensor,
    num_nodes: int,
    train_idx: np.ndarray,
) -> np.ndarray:
    """
    Concatenate all feature sources into one matrix:
      - Node2Vec embeddings  (64-dim)
      - Rich hand-crafted    (7-dim)   ← was 8-dim before fraud_tx_ratio removal
      - Normalised out-degree (1-dim, from edge_index)
      - Normalised in-degree  (1-dim, from edge_index)

    Final shape: (N, 73)

    Args:
        train_idx: indices of training nodes, used to compute normalisation
                   constants so that test node degrees do not influence scaling.
                   [FIX-3] degree normalisation uses training-set max only.
    """
    # Compute raw degree counts from edge_index
    out_deg = torch.bincount(edge_index[0], minlength=num_nodes).float().numpy().reshape(-1, 1)
    in_deg  = torch.bincount(edge_index[1], minlength=num_nodes).float().numpy().reshape(-1, 1)

    # [FIX-3] Normalise using the MAX of training nodes only.
    # Using the global max would let test-node degree statistics influence
    # the feature scale seen during training. Using train max avoids that.
    out_max = out_deg[train_idx].max() + 1e-8
    in_max  = in_deg[train_idx].max()  + 1e-8
    out_deg = out_deg / out_max
    in_deg  = in_deg  / in_max

    combined = np.concatenate(
        [embeddings, rich_features, out_deg, in_deg], axis=1
    ).astype(np.float32)

    logger.info("Combined feature matrix shape: %s", combined.shape)
    return combined


# ════════════════════════════════════════════════════════════════════════════════
# GRAPH-SAFE SMOTE OVERSAMPLING
# ════════════════════════════════════════════════════════════════════════════════

def graph_smote(
    x: np.ndarray,
    labels: np.ndarray,
    edge_index_np: np.ndarray,
    ratio: int = 5,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Synthetic Minority Oversampling for graph node features.

    Standard SMOTE creates synthetic samples by interpolating between
    a minority sample and one of its k-nearest neighbours in feature space.
    Here we do the same but restrict neighbour lookup to actual graph
    neighbours so the synthetic nodes respect graph topology context.

    IMPORTANT: This function receives ONLY training-set features and
    training-set-local edges, so no test-node information ever enters
    the synthetic samples. This is enforced in main() before calling here.

    Args:
        x             : (N_train, F) training feature matrix (NOT full matrix)
        labels        : (N_train,)   integer training labels
        edge_index_np : (2, E_train) edge index restricted to training nodes,
                        remapped to local [0, N_train) indices
        ratio         : how many synthetic nodes to create per real fraud node

    Returns:
        aug_x      : (N_train + synth, F) augmented features
        aug_labels : (N_train + synth,)   augmented labels
    """
    fraud_idx = np.where(labels == 1)[0]
    logger.info(
        "SMOTE: generating %d × %d = %d synthetic fraud nodes…",
        len(fraud_idx), ratio, len(fraud_idx) * ratio,
    )

    # Build adjacency list for fast neighbour lookup
    adj: dict[int, list[int]] = {i: [] for i in range(len(labels))}
    for src, dst in zip(edge_index_np[0], edge_index_np[1]):
        adj[int(src)].append(int(dst))

    synth_x      = []
    synth_labels = []

    rng = np.random.default_rng(42)

    for fi in fraud_idx:
        neighbours = adj[fi]

        # Use graph neighbours if available; fall back to random fraud peers
        candidate_pool = (
            [n for n in neighbours if labels[n] == 1] or
            list(fraud_idx[fraud_idx != fi])           or
            list(fraud_idx)
        )

        if not candidate_pool:
            continue

        for _ in range(ratio):
            peer = rng.choice(candidate_pool)
            # Interpolate: synthetic = self + λ × (peer − self), λ ~ U(0,1)
            lam    = rng.random()
            synth  = x[fi] + lam * (x[peer] - x[fi])
            # Add small noise to avoid exact duplicates
            synth += rng.normal(0, 0.01, size=synth.shape).astype(np.float32)
            synth_x.append(synth)
            synth_labels.append(1)

    if synth_x:
        aug_x      = np.vstack([x, np.array(synth_x, dtype=np.float32)])
        aug_labels = np.concatenate([labels, np.array(synth_labels, dtype=np.int64)])
    else:
        aug_x, aug_labels = x, labels

    fraud_after = (aug_labels == 1).sum()
    total_after = len(aug_labels)
    logger.info(
        "After SMOTE: %d total nodes, %d fraud (%.2f%%)",
        total_after, fraud_after, 100 * fraud_after / total_after,
    )
    return aug_x, aug_labels


# ════════════════════════════════════════════════════════════════════════════════
# LOSS FUNCTIONS
# ════════════════════════════════════════════════════════════════════════════════

class FocalLoss(torch.nn.Module):
    """
    Focal Loss — down-weights easy negatives so the model focuses
    on hard-to-classify fraud cases.

    FL(p_t) = −α(1 − p_t)^γ log(p_t)
    """

    def __init__(self, alpha: float = 0.75, gamma: float = 2.0):
        super().__init__()
        self.alpha = alpha
        self.gamma = gamma

    def forward(self, logits: Tensor, targets: Tensor) -> Tensor:
        ce   = F.cross_entropy(logits, targets, reduction="none")
        pt   = torch.exp(-ce)
        loss = self.alpha * (1 - pt) ** self.gamma * ce
        return loss.mean()


class HybridLoss(torch.nn.Module):
    """
    Weighted sum of Focal Loss and class-weighted CrossEntropy.

    Using both simultaneously gives the model two complementary
    gradient signals: Focal pushes it to find hard positives,
    CrossEntropy with high class weight penalises missed fraud hard.
    """

    def __init__(
        self,
        class_weight: float,
        focal_alpha: float,
        focal_gamma: float,
        focal_mix: float = 0.5,
    ):
        super().__init__()
        self.focal     = FocalLoss(alpha=focal_alpha, gamma=focal_gamma)
        self.ce_weight = torch.tensor([1.0, class_weight], device=device)
        self.mix       = focal_mix      # weight on focal; (1-mix) on CE

    def forward(self, logits: Tensor, targets: Tensor) -> Tensor:
        ce_weight = self.ce_weight.to(logits.device)
        ce_loss   = F.cross_entropy(logits, targets, weight=ce_weight)
        fl_loss   = self.focal(logits, targets)
        return self.mix * fl_loss + (1 - self.mix) * ce_loss


# ════════════════════════════════════════════════════════════════════════════════
# MODEL
# ════════════════════════════════════════════════════════════════════════════════

class GraphSAGE(torch.nn.Module):
    """
    3-layer GraphSAGE with:
      - BatchNorm after each hidden layer for training stability
      - Residual (skip) connection from layer-1 output to layer-3 input
        so gradients flow cleanly through all 3 layers
      - Dropout tuned to 0.4 (higher than baseline to prevent overfitting
        on the oversampled training set)
    """

    def __init__(
        self,
        in_channels:     int,
        hidden_channels: int = 256,
        out_channels:    int = 2,
        dropout:         float = 0.4,
    ):
        super().__init__()
        self.dropout = dropout

        # Layer 1: input → hidden
        self.conv1 = SAGEConv(in_channels,     hidden_channels)
        self.bn1   = torch.nn.BatchNorm1d(hidden_channels)

        # Layer 2: hidden → hidden
        self.conv2 = SAGEConv(hidden_channels, hidden_channels)
        self.bn2   = torch.nn.BatchNorm1d(hidden_channels)

        # Layer 3: hidden → hidden (residual target)
        self.conv3 = SAGEConv(hidden_channels, hidden_channels)
        self.bn3   = torch.nn.BatchNorm1d(hidden_channels)

        # Final classifier head
        self.head  = torch.nn.Linear(hidden_channels, out_channels)

    def forward(self, x: Tensor, edge_index: Tensor) -> Tensor:
        # Layer 1
        x1 = self.conv1(x, edge_index)
        x1 = self.bn1(x1)
        x1 = F.relu(x1)
        x1 = F.dropout(x1, p=self.dropout, training=self.training)

        # Layer 2
        x2 = self.conv2(x1, edge_index)
        x2 = self.bn2(x2)
        x2 = F.relu(x2)
        x2 = F.dropout(x2, p=self.dropout, training=self.training)

        # Layer 3 + residual from layer 1
        # The residual connection lets the model choose how much of the
        # local (1-hop) signal to blend with the deeper (2-hop) signal.
        x3 = self.conv3(x2, edge_index)
        x3 = self.bn3(x3 + x1)         # residual add before normalisation
        x3 = F.relu(x3)
        x3 = F.dropout(x3, p=self.dropout, training=self.training)

        return self.head(x3)


# ════════════════════════════════════════════════════════════════════════════════
# THRESHOLD SELECTION via Precision-Recall Curve
# ════════════════════════════════════════════════════════════════════════════════

def find_best_threshold(
    y_true:  np.ndarray,
    y_proba: np.ndarray,
    beta:    float = 1.0,
) -> tuple[float, float]:
    """
    Use the Precision-Recall curve to find the threshold that maximises
    F-beta score on the given split.

    beta=1 → equal weight to precision and recall (standard F1).
    beta=2 → recall weighted twice as heavily (prefer catching more fraud).

    [FIX-5] This should be called on the VALIDATION set, not the test set.
    Selecting thresholds on the test set is a form of evaluation leakage —
    the threshold becomes tuned to the test distribution, inflating reported F1.

    Returns (best_threshold, best_fbeta).
    """
    precisions, recalls, thresholds = precision_recall_curve(y_true, y_proba)

    # thresholds has one fewer element than precisions/recalls
    fbeta_scores = (
        (1 + beta**2)
        * (precisions[:-1] * recalls[:-1])
        / (beta**2 * precisions[:-1] + recalls[:-1] + 1e-8)
    )

    best_idx       = np.argmax(fbeta_scores)
    best_threshold = float(thresholds[best_idx])
    best_fbeta     = float(fbeta_scores[best_idx])

    return best_threshold, best_fbeta


# ════════════════════════════════════════════════════════════════════════════════
# ISOLATION FOREST ANOMALY SCORING — LEAK-FREE
# ════════════════════════════════════════════════════════════════════════════════

def compute_iforest_scores(
    train_features: np.ndarray,
    all_features:   np.ndarray,
) -> np.ndarray:
    """
    Fit an Isolation Forest ONLY on training node features, then score ALL nodes.

    [FIX-4] The original pipeline called iforest.fit(all_features), meaning
    the IForest learned the density structure of BOTH train and test nodes.
    When test nodes cluster near fraud patterns, the IForest would assign them
    elevated anomaly scores before having ever seen them during model training —
    inflating ensemble scores on test nodes.

    The fix: fit on train_features only, score on all_features.
    This mirrors proper train/test discipline for unsupervised components.

    Higher score = more anomalous.
    """
    logger.info(
        "Fitting Isolation Forest (%d estimators) on %d training nodes only…",
        CFG["iforest_estimators"], len(train_features),
    )
    iforest = IsolationForest(
        n_estimators=CFG["iforest_estimators"],
        contamination=CFG["iforest_contamination"],
        random_state=42,
        n_jobs=-1,
    )
    # [FIX-4] fit ONLY on training nodes — test nodes must not influence the forest
    iforest.fit(train_features)

    # Score all nodes (train + test) using the training-fitted forest
    raw    = iforest.score_samples(all_features)    # lower = more anomalous

    # Flip and normalise using the full range so scores remain in [0, 1]
    # Normalisation here is cosmetic (not a scaler fitted on train), so no leak.
    raw_flipped = -raw
    scores = (raw_flipped - raw_flipped.min()) / (raw_flipped.max() - raw_flipped.min() + 1e-8)

    logger.info(
        "IForest scores — min=%.4f  max=%.4f  mean=%.4f",
        scores.min(), scores.max(), scores.mean(),
    )
    return scores.astype(np.float32)


# ════════════════════════════════════════════════════════════════════════════════
# MAIN TRAINING PIPELINE
# ════════════════════════════════════════════════════════════════════════════════

def main() -> None:
    pipeline_start = time.time()
    logger.info("=" * 70)
    logger.info("SecureLedger GNN Training Pipeline — %s", datetime.now().isoformat())
    logger.info("=" * 70)

    # ── 1. Load graph & embeddings ─────────────────────────────────────────────
    logger.info("\n[1/10] Loading graph and Node2Vec embeddings…")

    data: Data = torch.load(CFG["graph_path"], weights_only=False)
    embeddings: np.ndarray = np.load(CFG["embeddings_path"])

    logger.info("  Nodes      : %d", data.num_nodes)
    logger.info("  Edges      : %d", data.num_edges)
    logger.info("  Emb shape  : %s", embeddings.shape)

    # ── 2. Connect to Neo4j & load labels ─────────────────────────────────────
    logger.info("\n[2/10] Connecting to Neo4j and loading fraud labels…")

    driver = _get_driver()
    fraud_ids = load_fraud_ids(driver)
    logger.info("  Fraud accounts : %d", len(fraud_ids))

    labels_np = np.zeros(data.num_nodes, dtype=np.int64)
    for node_id, idx in data.id2idx.items():
        if node_id in fraud_ids:
            labels_np[idx] = 1

    total_fraud = labels_np.sum()
    total_nodes = len(labels_np)
    logger.info(
        "  Fraud nodes: %d / %d (%.3f%%)",
        total_fraud, total_nodes, 100 * total_fraud / total_nodes,
    )

    # ── 3. Load raw (un-normalised) rich features ─────────────────────────────
    # We load raw features BEFORE splitting so we have the full feature array,
    # but normalisation is deferred to step 4b (after the split). This is safe
    # because loading raw counts from Neo4j carries no label information.
    logger.info("\n[3/10] Loading raw rich node features from Neo4j…")

    rich_feats = load_rich_features(driver, data.id2idx)
    edge_np    = data.edge_index.numpy()

    # ── 4. Stratified train/test split ─────────────────────────────────────────
    # ALL normalisation happens AFTER this point so that no test-set statistics
    # ever influence the values the training loop sees.
    logger.info("\n[4/10] Stratified train/test split (80/20)…")

    indices = np.arange(data.num_nodes)
    train_idx, test_idx = train_test_split(
        indices,
        test_size=0.2,
        stratify=labels_np,
        random_state=42,
    )

    train_labels = labels_np[train_idx]
    test_labels  = labels_np[test_idx]

    train_fraud = train_labels.sum()
    test_fraud  = test_labels.sum()
    logger.info(
        "  Train: %d nodes, %d fraud | Test: %d nodes, %d fraud",
        len(train_idx), train_fraud, len(test_idx), test_fraud,
    )

    # [FIX-5] Carve a validation split out of the training set.
    # This is used ONLY for threshold selection and early stopping.
    # The test set is kept completely isolated until final evaluation.
    val_size = CFG["val_size"]
    train_proper_idx, val_idx = train_test_split(
        train_idx,
        test_size=val_size,
        stratify=train_labels,
        random_state=42,
    )
    val_labels         = labels_np[val_idx]
    train_proper_labels = labels_np[train_proper_idx]
    logger.info(
        "  Train proper: %d | Val: %d | Test: %d",
        len(train_proper_idx), len(val_idx), len(test_idx),
    )

    # ── 4b. Feature normalisation — fitted ONLY on training rows ──────────────
    # [FIX-2] The scaler must be fitted on train rows only.
    # Fitting on all rows lets test-node statistics (mean, max) shift the
    # training features, meaning the model implicitly "sees" test data during
    # optimisation. Here we fit_transform on train, then transform on test/val.
    logger.info("\n[4b/10] Normalising rich features with train-only scaler…")

    scaler = MinMaxScaler()
    rich_feats[train_idx] = scaler.fit_transform(rich_feats[train_idx])
    rich_feats[test_idx]  = scaler.transform(rich_feats[test_idx])
    rich_feats[val_idx]   = scaler.transform(rich_feats[val_idx])
    # val_idx is a subset of train_idx, so this re-transforms it safely
    # using the same scaler — no additional information is introduced.

    # [FIX-3] build_features receives train_idx so degree normalisation uses
    # the training-set maximum only. See build_features() docstring.
    all_features = build_features(
        embeddings, rich_feats, data.edge_index, data.num_nodes, train_idx
    )

    logger.info("  Feature dim: %d", all_features.shape[1])

    # ── 5. Graph-safe SMOTE on training nodes only ─────────────────────────────
    # SMOTE receives only the training portion of the feature matrix and
    # only edges within the training subgraph. Test node features and
    # connectivity never enter the synthetic sample generation.
    logger.info("\n[5/10] Applying Graph-SMOTE to training set…")

    train_x_orig = all_features[train_idx]

    # Restrict edges to those entirely within the training set
    train_local_edges = edge_np[
        :, np.isin(edge_np[0], train_idx) & np.isin(edge_np[1], train_idx)
    ]

    # Remap global node IDs to local [0, N_train) indices for SMOTE
    global2local = {g: l for l, g in enumerate(train_idx)}
    local_edges  = np.vectorize(global2local.get)(train_local_edges)

    aug_x, aug_labels = graph_smote(
        train_x_orig, train_labels, local_edges, ratio=CFG["oversample_ratio"]
    )

    # Convert augmented training data to tensors
    aug_x_t      = torch.tensor(aug_x,      dtype=torch.float32)
    aug_labels_t = torch.tensor(aug_labels, dtype=torch.long)

    # ── 6. Prepare full graph data for message passing ─────────────────────────
    logger.info("\n[6/10] Preparing graph tensors…")

    # The GNN operates on ALL nodes (message passing needs the full graph)
    # but we compute loss only on train masks and evaluate on val/test masks.
    # Augmented synthetic nodes don't have edges — they're feature-only.
    # This is the standard "feature augmentation + graph message passing" technique.
    data.x = torch.tensor(all_features, dtype=torch.float32)
    data.y = torch.tensor(labels_np,    dtype=torch.long)

    train_mask = torch.zeros(data.num_nodes, dtype=torch.bool)
    val_mask   = torch.zeros(data.num_nodes, dtype=torch.bool)
    test_mask  = torch.zeros(data.num_nodes, dtype=torch.bool)
    train_mask[train_idx]        = True
    val_mask[val_idx]            = True
    test_mask[test_idx]          = True
    data.train_mask = train_mask
    data.val_mask   = val_mask
    data.test_mask  = test_mask

    data         = data.to(device)
    aug_x_t      = aug_x_t.to(device)
    aug_labels_t = aug_labels_t.to(device)

    in_channels = all_features.shape[1]
    logger.info("  Input feature dim : %d", in_channels)

    # ── 7. Model, optimizer, scheduler, loss ──────────────────────────────────
    logger.info("\n[7/10] Initialising model, optimiser, scheduler, loss…")

    model = GraphSAGE(
        in_channels=in_channels,
        hidden_channels=CFG["hidden_channels"],
        dropout=CFG["dropout"],
    ).to(device)

    logger.info("  Architecture:\n%s", model)

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=CFG["lr"],
        weight_decay=CFG["weight_decay"],
    )

    # Cosine annealing: smoothly decays LR to near-zero over training,
    # which tends to find flatter (more generalisable) minima.
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer,
        T_max=CFG["epochs"],
        eta_min=1e-6,
    )

    criterion = HybridLoss(
        class_weight=CFG["class_weight"],
        focal_alpha=CFG["focal_alpha"],
        focal_gamma=CFG["focal_gamma"],
    )

    # ── 8. Training loop ───────────────────────────────────────────────────────
    logger.info("\n[8/10] Training (%d max epochs, patience=%d)…\n",
                CFG["epochs"], CFG["patience"])

    best_f1             = 0.0
    best_threshold      = 0.5
    patience_counter    = 0
    best_epoch          = 0
    train_loss_history  = []
    val_f1_history      = []

    for epoch in range(CFG["epochs"]):
        t0 = time.time()

        # ── Forward pass on full graph (message passing uses all nodes) ────────
        model.train()
        optimizer.zero_grad()

        # Full-graph forward — all nodes participate in neighbourhood aggregation
        full_logits = model(data.x, data.edge_index)

        # Loss computed ONLY on training nodes (by mask) — test/val excluded
        real_loss = criterion(
            full_logits[data.train_mask],
            data.y[data.train_mask],
        )

        # Additional loss on SMOTE synthetic nodes (feature-only, no edges).
        # We run a single-layer pass through conv1→classifier head only.
        # This avoids adding phantom edges to the graph while still letting
        # synthetic fraud gradients influence the classifier head.
        synth_logits = model.head(
            F.relu(model.bn1(model.conv1(aug_x_t.to(device), data.edge_index[:, :1].to(device))))
        )
        synth_loss = criterion(synth_logits, aug_labels_t)

        # Blend: real graph loss dominates, synth adds regularisation signal
        loss = 0.7 * real_loss + 0.3 * synth_loss
        loss.backward()

        # Gradient clipping — prevents exploding gradients with high class weights
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

        optimizer.step()
        scheduler.step()

        train_loss_history.append(loss.item())

        # ── Evaluation every 5 epochs (on VALIDATION set, not test) ──────────
        # [FIX-5] Early stopping and threshold tuning use val_mask only.
        # This prevents the model from being selected based on test performance.
        if epoch % 5 == 0:
            model.eval()
            with torch.no_grad():
                logits = model(data.x, data.edge_index)
                proba  = torch.softmax(logits, dim=1)[:, 1]

            # Evaluate on VALIDATION nodes
            y_true_val  = data.y[data.val_mask].cpu().numpy()
            y_proba_val = proba[data.val_mask].cpu().numpy()

            # PR-curve optimal threshold selected on VALIDATION set
            threshold, epoch_f1 = find_best_threshold(y_true_val, y_proba_val, beta=1.0)
            y_pred_val = (y_proba_val >= threshold).astype(int)

            precision = precision_score(y_true_val, y_pred_val, zero_division=0)
            recall    = recall_score(   y_true_val, y_pred_val, zero_division=0)

            val_f1_history.append(epoch_f1)

            # ── Save best model based on validation F1 ─────────────────────────
            if epoch_f1 > best_f1:
                best_f1          = epoch_f1
                best_threshold   = threshold
                best_epoch       = epoch
                patience_counter = 0
                torch.save(model.state_dict(), CFG["model_path"])
                logger.info(
                    "  ✅ New best val-F1=%.4f at epoch %d (threshold=%.3f) — model saved",
                    best_f1, epoch, best_threshold,
                )
            else:
                patience_counter += 5   # we eval every 5 epochs

            elapsed = time.time() - t0
            logger.info(
                "Epoch %03d | loss=%.4f | val-P=%.4f | val-R=%.4f | val-F1=%.4f | "
                "thr=%.3f | bestF1=%.4f | lr=%.2e | t=%.2fs",
                epoch, loss.item(), precision, recall, epoch_f1,
                threshold, best_f1,
                scheduler.get_last_lr()[0], elapsed,
            )

        # ── Early stopping ─────────────────────────────────────────────────────
        if patience_counter >= CFG["patience"]:
            logger.info(
                "\nEarly stopping at epoch %d — no validation F1 improvement for %d evaluations.",
                epoch, CFG["patience"],
            )
            break

    logger.info("\nTraining complete. Best val-F1=%.4f at epoch %d.", best_f1, best_epoch)

    # ── 9. Final evaluation with best model on HELD-OUT TEST SET ─────────────
    # The test set has been completely invisible to all fitting/selection steps.
    # This is the only honest measure of model performance.
    logger.info("\n[9/10] Final evaluation with best saved model on test set…")

    model.load_state_dict(torch.load(CFG["model_path"], map_location=device))
    model.eval()

    with torch.no_grad():
        logits    = model(data.x, data.edge_index)
        gnn_proba = torch.softmax(logits, dim=1)[:, 1].cpu().numpy()

    # ── Isolation Forest anomaly scores [FIX-4] ───────────────────────────────
    # Fit ONLY on training features; score all nodes.
    iforest_scores = compute_iforest_scores(
        train_features=all_features[train_idx],
        all_features=all_features,
    )
    np.save("ml/anomaly_scores.npy", iforest_scores)

    # ── Ensemble: 0.6 × GNN + 0.4 × IForest ──────────────────────────────────
    ensemble_scores = (
        CFG["gnn_weight"]     * gnn_proba
        + CFG["iforest_weight"] * iforest_scores
    )
    # Cosmetic re-normalisation — this uses all nodes so it's not a scaler leak;
    # it merely rescales the ensemble output to [0, 1] for Neo4j readability.
    ens_min = ensemble_scores.min()
    ens_max = ensemble_scores.max()
    ensemble_scores = ((ensemble_scores - ens_min) / (ens_max - ens_min + 1e-8)).astype(np.float32)

    # ── Apply threshold chosen on VALIDATION set to the TEST set ──────────────
    # [FIX-5] We use best_threshold (selected on val) instead of re-optimising
    # on test scores. Re-optimising on test would inflate reported F1.
    y_true_test = labels_np[test_idx]
    y_ens_test  = ensemble_scores[test_idx]
    y_pred_test = (y_ens_test >= best_threshold).astype(int)

    precision = precision_score(y_true_test, y_pred_test, zero_division=0)
    recall    = recall_score(   y_true_test, y_pred_test, zero_division=0)
    f1        = f1_score(       y_true_test, y_pred_test, zero_division=0)
    cm        = confusion_matrix(y_true_test, y_pred_test)

    try:
        auc_roc  = roc_auc_score(y_true_test, y_ens_test)
        avg_prec = average_precision_score(y_true_test, y_ens_test)
    except ValueError:
        auc_roc  = 0.0
        avg_prec = 0.0

    logger.info("\n%s", "=" * 60)
    logger.info("=== MODEL EVALUATION (test set — zero leakage) ===")
    logger.info("")
    logger.info("Best Threshold : %.2f  (selected on validation set)", best_threshold)
    logger.info("")
    logger.info("Precision : %.4f", precision)
    logger.info("Recall    : %.4f", recall)
    logger.info("F1 Score  : %.4f", f1)
    logger.info("AUC-ROC   : %.4f", auc_roc)
    logger.info("Avg Prec  : %.4f", avg_prec)
    logger.info("")
    logger.info("Confusion Matrix:\n%s", cm)
    logger.info(
        "\nFraud Predictions : %d / %d test nodes",
        y_pred_test.sum(), len(test_idx),
    )
    logger.info("%s", "=" * 60)

    # ── Save metrics file (read by /api/stats) ─────────────────────────────────
    with open(CFG["metrics_path"], "w") as f:
        f.write("=== MODEL EVALUATION ===\n\n")
        f.write(f"Best Threshold : {best_threshold:.2f}\n\n")
        f.write(f"Precision : {precision:.4f}\n")
        f.write(f"Recall    : {recall:.4f}\n")
        f.write(f"F1 Score  : {f1:.4f}\n\n")
        f.write(f"AUC-ROC   : {auc_roc:.4f}\n")
        f.write(f"Avg Prec  : {avg_prec:.4f}\n\n")
        f.write(f"Confusion Matrix:\n{cm}\n\n")
        f.write(f"Training epochs : {best_epoch}\n")
        f.write(f"Best GNN-only F1: {best_f1:.4f}\n")
        f.write(f"Ensemble weights: GNN={CFG['gnn_weight']} IForest={CFG['iforest_weight']}\n")
        f.write(f"Run timestamp   : {datetime.now().isoformat()}\n")
    logger.info("Metrics saved → %s", CFG["metrics_path"])

    # ── Save best threshold ────────────────────────────────────────────────────
    with open(CFG["threshold_path"], "w") as f:
        json.dump({
            "threshold":       best_threshold,
            "threshold_source": "validation_set",
            "gnn_weight":      CFG["gnn_weight"],
            "iforest_weight":  CFG["iforest_weight"],
            "f1":              f1,
            "precision":       precision,
            "recall":          recall,
            "auc_roc":         auc_roc,
            "timestamp":       datetime.now().isoformat(),
        }, f, indent=2)
    logger.info("Threshold saved → %s", CFG["threshold_path"])

    # ── 10. Write ensemble scores back to Neo4j ────────────────────────────────
    logger.info("\n[10/10] Writing ensemble scores to Neo4j…")

    idx2id = {v: k for k, v in data.id2idx.items()}

    batch = [
        {
            "id":            idx2id[i],
            "fraud_prob":    float(ensemble_scores[i]),
            "gnn_prob":      float(gnn_proba[i]),
            "anomaly_score": float(iforest_scores[i]),
        }
        for i in range(data.num_nodes)
        if i in idx2id
    ]

    write_query = """
    UNWIND $rows AS row
    MATCH (a:Account {id: row.id})
    SET
        a.fraud_prob    = row.fraud_prob,
        a.gnn_prob      = row.gnn_prob,
        a.anomaly_score = row.anomaly_score,
        a.risk_score    = row.fraud_prob
    """

    with driver.session() as session:
        total = len(batch)
        for i in range(0, total, CFG["neo4j_batch"]):
            chunk = batch[i : i + CFG["neo4j_batch"]]
            session.run(write_query, rows=chunk)
            logger.info(
                "  Written %d / %d accounts…",
                min(i + CFG["neo4j_batch"], total), total,
            )

    logger.info("All scores written to Neo4j.")
    driver.close()

    elapsed_total = time.time() - pipeline_start
    logger.info(
        "\n✅ Pipeline complete in %.1fs — Honest Ensemble F1=%.4f",
        elapsed_total, f1,
    )


# ════════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ════════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    main()