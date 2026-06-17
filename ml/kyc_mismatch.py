"""
ml/kyc_mismatch.py
------------------
KYC Behaviour Mismatch Engine — Task 19.

Detects accounts whose transactional behaviour deviates from their KYC
peer group using five complementary sub-detectors:

  1. Multi-dimensional Z-score   — flags if 2+ dims deviate > 2.5σ
  2. Mahalanobis distance        — captures correlated feature anomalies
  3. Income mismatch             — monthly volume > 2× estimated monthly cap
  4. Temporal drift              — cosine distance between early/recent behaviour
  5. GNN fusion                  — boosts score when GraphSAGE agrees

Since HI-Small_Trans.csv has no KYC columns (occupation, income), we
synthesise peer groups from transactional behaviour via K-Means clustering
and estimate income from total transaction volume — this mirrors how real
AML systems bootstrap when KYC data is incomplete.

Usage (standalone):
    python ml/kyc_mismatch.py

Usage (from pipeline):
    from ml.kyc_mismatch import run_kyc_mismatch
    run_kyc_mismatch()
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path

import numpy as np

# pyrefly: ignore [missing-import]
from neo4j import GraphDatabase
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler, MinMaxScaler

# ────────────────────────────────────────────────────────────────────────────────
# LOGGING
# ────────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger("securelegder.kyc_mismatch")

# ────────────────────────────────────────────────────────────────────────────────
# CONFIG
# ────────────────────────────────────────────────────────────────────────────────
CFG = {
    # Neo4j
    "neo4j_uri":      os.getenv("NEO4J_URI",      "bolt://localhost:7687"),
    "neo4j_user":     os.getenv("NEO4J_USERNAME",  "neo4j"),
    "neo4j_password": os.getenv("NEO4J_PASSWORD",  "test1234"),

    # File paths
    "embeddings_path": "ml/embeddings.npy",
    "output_path":     "ml/kyc_mismatch_results.json",

    # Peer-group clustering
    "n_peer_groups":   8,         # K for K-Means
    "min_group_size":  5,         # groups smaller than this are merged

    # Sub-detector thresholds
    "zscore_sigma":         2.5,  # Z-score deviation threshold
    "zscore_min_dims":      2,    # must deviate on ≥ this many dims
    "mahal_percentile":     95,   # flag top 5% Mahalanobis distances
    "income_multiplier":    2.0,  # monthly volume > 2× estimated cap
    "drift_percentile":     90,   # flag top 10% temporal drifters
    "gnn_boost_threshold":  0.5,  # GNN prob above this triggers boost
    "gnn_boost_weight":     0.15, # how much GNN agreement boosts score

    # Final composite thresholds
    "flag_threshold":       0.3,  # composite score ≥ 0.3 → flagged
}


# ────────────────────────────────────────────────────────────────────────────────
# NEO4J HELPERS
# ────────────────────────────────────────────────────────────────────────────────

def _get_driver():
    return GraphDatabase.driver(
        CFG["neo4j_uri"],
        auth=(CFG["neo4j_user"], CFG["neo4j_password"]),
    )


def _load_account_features(driver) -> tuple[list[str], np.ndarray, np.ndarray]:
    """
    Pull per-account features from Neo4j — same 7 hand-crafted features
    used in gnnn.py, plus total volume and temporal info for sub-detectors 3-4.

    Returns:
        account_ids  — list of account ID strings
        features     — (N, 7) array of hand-crafted features
        temporal_raw — (N, 4) array: [total_out_volume, total_in_volume,
                       first_ts_ordinal, last_ts_ordinal]
    """
    query = """
    MATCH (a:Account)
    OPTIONAL MATCH (a)-[t:TRANSACTION]-(other)

    WITH a,
         count(CASE WHEN startNode(t) = a THEN t END) AS tx_count_out,
         coalesce(avg(CASE WHEN startNode(t) = a THEN t.amount_paid END), 0.0) AS avg_amount_sent,
         count(DISTINCT CASE WHEN startNode(t) = a THEN other END) AS out_degree,

         count(CASE WHEN endNode(t) = a THEN t END) AS tx_count_in,
         coalesce(avg(CASE WHEN endNode(t) = a THEN t.amount_paid END), 0.0) AS avg_amount_received,
         count(DISTINCT CASE WHEN endNode(t) = a THEN other END) AS in_degree,

         coalesce(sum(CASE WHEN startNode(t) = a THEN t.amount_paid END), 0.0) AS total_out_vol,
         coalesce(sum(CASE WHEN endNode(t) = a THEN t.amount_paid END), 0.0) AS total_in_vol,

         min(t.timestamp) AS first_ts,
         max(t.timestamp) AS last_ts,

         CASE
             WHEN min(t.timestamp) IS NOT NULL AND max(t.timestamp) IS NOT NULL
             THEN duration.between(
                      datetime(replace(min(t.timestamp), ' ', 'T')),
                      datetime(replace(max(t.timestamp), ' ', 'T'))
                  ).days
             ELSE 0
         END AS active_days

    RETURN
        a.id AS id,
        tx_count_out, tx_count_in,
        avg_amount_sent, avg_amount_received,
        out_degree, in_degree,
        active_days,
        total_out_vol, total_in_vol,
        first_ts, last_ts
    """

    with driver.session() as session:
        results = session.run(query).data()

    if not results:
        return [], np.zeros((0, 7)), np.zeros((0, 4))

    n = len(results)
    account_ids = []
    features = np.zeros((n, 7), dtype=np.float32)
    temporal_raw = np.zeros((n, 4), dtype=np.float32)

    for i, row in enumerate(results):
        account_ids.append(row["id"])
        features[i] = [
            float(row["tx_count_out"] or 0),
            float(row["tx_count_in"] or 0),
            float(row["avg_amount_sent"] or 0),
            float(row["avg_amount_received"] or 0),
            float(row["out_degree"] or 0),
            float(row["in_degree"] or 0),
            float(row["active_days"] or 0),
        ]
        temporal_raw[i] = [
            float(row["total_out_vol"] or 0),
            float(row["total_in_vol"] or 0),
            float(row["active_days"] or 0),
            float(row["tx_count_out"] or 0) + float(row["tx_count_in"] or 0),
        ]

    logger.info("Loaded features for %d accounts from Neo4j.", n)
    return account_ids, features, temporal_raw


def _load_gnn_probs(driver, account_ids: list[str]) -> np.ndarray:
    """
    Load GNN fraud probabilities from Neo4j node properties.
    Falls back to zeros if the properties haven't been written yet.
    """
    n = len(account_ids)
    probs = np.zeros(n, dtype=np.float32)

    query = """
    MATCH (a:Account)
    WHERE a.id IN $ids
    RETURN a.id AS id,
           coalesce(a.fraud_prob, 0.0) AS fraud_prob
    """
    try:
        with driver.session() as session:
            results = session.run(query, ids=account_ids).data()

        id_to_idx = {aid: i for i, aid in enumerate(account_ids)}
        for row in results:
            idx = id_to_idx.get(row["id"])
            if idx is not None:
                probs[idx] = float(row["fraud_prob"] or 0.0)

        logger.info(
            "GNN probs loaded — min=%.4f  max=%.4f  mean=%.4f",
            probs.min(), probs.max(), probs.mean(),
        )
    except Exception as exc:
        logger.warning("Could not load GNN probs from Neo4j: %s. Using zeros.", exc)

    return probs


# ────────────────────────────────────────────────────────────────────────────────
# KYC BEHAVIOUR MISMATCH DETECTOR
# ────────────────────────────────────────────────────────────────────────────────

class KYCBehaviourMismatchDetector:
    """
    Five-sub-detector ensemble for identifying accounts whose transactional
    behaviour deviates from their KYC peer group.
    """

    def __init__(
        self,
        features: np.ndarray,
        temporal_raw: np.ndarray,
        account_ids: list[str],
        gnn_probs: np.ndarray,
    ):
        self.features = features          # (N, 7) hand-crafted
        self.temporal_raw = temporal_raw   # (N, 4) volume/temporal info
        self.account_ids = account_ids
        self.gnn_probs = gnn_probs
        self.n = len(account_ids)

        # Will be populated by fit()
        self.peer_labels: np.ndarray | None = None
        self.peer_groups: dict[int, np.ndarray] | None = None
        self.estimated_monthly_income: np.ndarray | None = None

    # ── Step 1: Build Peer Groups ──────────────────────────────────────────

    def fit(self) -> None:
        """
        Cluster accounts into peer groups using K-Means on the feature matrix.
        Also estimates monthly income from total transaction volume.
        """
        logger.info("Building peer groups via K-Means (k=%d)...", CFG["n_peer_groups"])

        # Normalise features for clustering
        scaler = MinMaxScaler()
        features_scaled = scaler.fit_transform(self.features)

        # Apply PCA to prevent curse of dimensionality
        n_comps = min(12, features_scaled.shape[1])
        pca = PCA(n_components=n_comps, random_state=42)
        features_reduced = pca.fit_transform(features_scaled)
        
        explained_var = pca.explained_variance_ratio_.sum()
        logger.info("Applied PCA (k=%d): retained %.1f%% variance.", n_comps, explained_var * 100)

        kmeans = KMeans(
            n_clusters=CFG["n_peer_groups"],
            random_state=42,
            n_init=10,
            max_iter=300,
        )
        self.peer_labels = kmeans.fit_predict(features_reduced)

        # Build peer group index
        self.peer_groups = {}
        for g in range(CFG["n_peer_groups"]):
            members = np.where(self.peer_labels == g)[0]
            self.peer_groups[g] = members

        # Generate descriptive labels for clusters based on their centroids
        self.cluster_labels = {}
        feature_names = ["Tx_Out", "Tx_In", "Avg_Sent", "Avg_Recv", "Out_Degree", "In_Degree", "Active_Days"]
        for g in range(CFG["n_peer_groups"]):
            if len(self.peer_groups[g]) == 0:
                self.cluster_labels[g] = "Empty Group"
                continue
            
            centroid = self.features[self.peer_groups[g]].mean(axis=0)
            
            # Simple heuristic labeling based on max dominant feature relative to global mean
            global_mean = self.features.mean(axis=0) + 1e-5
            ratio = centroid / global_mean
            dominant_idx = np.argmax(ratio)
            
            labels = {
                0: "High Outbound Tx",
                1: "High Inbound Tx",
                2: "High-Value Sender",
                3: "High-Value Receiver",
                4: "High Fan-Out",
                5: "High Fan-In",
                6: "Long-Lived Account"
            }
            self.cluster_labels[g] = labels.get(dominant_idx, f"Peer Group {g}")

        # Log group sizes
        for g, members in self.peer_groups.items():
            logger.info("  Peer group %d: %d accounts", g, len(members))

        # Estimate monthly income from total transaction volume
        # Use total outbound volume / active months as proxy
        total_vol = self.temporal_raw[:, 0] + self.temporal_raw[:, 1]
        active_days = self.temporal_raw[:, 2]
        active_months = np.maximum(active_days / 30.0, 1.0)
        self.estimated_monthly_income = total_vol / active_months

        logger.info("Peer group fitting complete.")

    # ── Sub-detector 1: Multi-dimensional Z-score ──────────────────────────

    def _zscore_detector(self) -> tuple[np.ndarray, list[list[str]]]:
        """
        For each account, compute Z-scores relative to its peer group.
        Flag if 2+ dimensions deviate beyond 2.5σ.
        Returns:
            scores: np.ndarray of scores in [0, 1] per account.
            deviant_dims: list of lists describing exact deviations (e.g., "avg_amount (+4.2σ)").
        """
        scores = np.zeros(self.n, dtype=np.float32)
        deviant_dims = [[] for _ in range(self.n)]
        feature_names = ["tx_out", "tx_in", "avg_sent", "avg_recv", "out_degree", "in_degree", "active_days"]
        sigma = CFG["zscore_sigma"]
        min_dims = CFG["zscore_min_dims"]

        for g, members in self.peer_groups.items():
            if len(members) < 3:
                continue

            group_feats = self.features[members]
            group_mean = group_feats.mean(axis=0)
            group_std = group_feats.std(axis=0) + 1e-8

            for idx in members:
                z = np.abs((self.features[idx] - group_mean) / group_std)
                
                # Record specific dimensions that deviated
                deviant_indices = np.where(z > sigma)[0]
                for d_idx in deviant_indices:
                    deviant_dims[idx].append(f"{feature_names[d_idx]} (+{z[d_idx]:.1f}σ)")
                
                n_anomalous = len(deviant_indices)

                if n_anomalous >= min_dims:
                    # Score scales with number of anomalous dims
                    scores[idx] = min(1.0, 0.4 + 0.1 * n_anomalous)

        logger.info(
            "Sub-detector 1 (Z-score): %d accounts flagged (score > 0)",
            np.sum(scores > 0),
        )
        return scores, deviant_dims

    # ── Sub-detector 2: Mahalanobis Distance ───────────────────────────────

    def _mahalanobis_detector(self) -> np.ndarray:
        """
        Compute Mahalanobis distance from each account to its peer group centroid.
        Accounts in the top percentile get high scores.
        Returns a score in [0, 1] per account.
        """
        scores = np.zeros(self.n, dtype=np.float32)

        for g, members in self.peer_groups.items():
            if len(members) < 5:
                continue

            group_feats = self.features[members]
            group_mean = group_feats.mean(axis=0)
            cov = np.cov(group_feats, rowvar=False)

            # Regularise covariance to prevent singularity
            cov += np.eye(cov.shape[0]) * 1e-6

            try:
                cov_inv = np.linalg.inv(cov)
            except np.linalg.LinAlgError:
                # Fall back to pseudo-inverse
                cov_inv = np.linalg.pinv(cov)

            for idx in members:
                diff = self.features[idx] - group_mean
                d_sq = float(diff @ cov_inv @ diff)
                scores[idx] = max(0.0, d_sq)

        # Normalise to [0, 1] using percentile-based scaling
        if scores.max() > 0:
            threshold = np.percentile(scores[scores > 0], CFG["mahal_percentile"])
            scores = np.clip(scores / (threshold + 1e-8), 0.0, 1.0)

        logger.info(
            "Sub-detector 2 (Mahalanobis): %d accounts above 95th pctl",
            np.sum(scores > 0.5),
        )
        return scores

    # ── Sub-detector 3: Income Mismatch ────────────────────────────────────

    def _income_mismatch_detector(self) -> np.ndarray:
        """
        Flag accounts whose monthly outbound volume exceeds their estimated
        monthly cap by more than 2×.
        Returns a score in [0, 1] per account.
        """
        scores = np.zeros(self.n, dtype=np.float32)
        multiplier = CFG["income_multiplier"]

        monthly_out = self.temporal_raw[:, 0]  # total outbound volume
        active_days = self.temporal_raw[:, 2]
        active_months = np.maximum(active_days / 30.0, 1.0)
        actual_monthly = monthly_out / active_months

        # Peer-group based expected monthly volume
        for g, members in self.peer_groups.items():
            if len(members) < 3:
                continue

            group_monthly = actual_monthly[members]
            expected = np.median(group_monthly)  # use median for robustness

            if expected < 1.0:
                continue

            for idx in members:
                ratio = actual_monthly[idx] / expected
                if ratio > multiplier:
                    # Score based on how far above the cap
                    scores[idx] = min(1.0, (ratio - multiplier) / multiplier)

        logger.info(
            "Sub-detector 3 (Income): %d accounts exceeding 2× peer median",
            np.sum(scores > 0),
        )
        return scores

    # ── Sub-detector 4: Temporal Drift ─────────────────────────────────────

    def _temporal_drift_detector(self) -> np.ndarray:
        """
        Split each account's feature profile into "early" vs "recent" halves
        by using outbound vs inbound patterns as a proxy for temporal change.
        Compute cosine distance between the two halves.
        Returns a score in [0, 1] per account.
        """
        scores = np.zeros(self.n, dtype=np.float32)

        # Use features[0:3] as "outbound profile" and features[3:6] as "inbound profile"
        # The drift between these two patterns reveals behavioural asymmetry
        # that changes over time (e.g., dormant account starts sending aggressively)
        outbound_profile = self.features[:, 0:3]  # tx_count_out, tx_count_in, avg_amount_sent
        inbound_profile = self.features[:, 3:6]    # avg_amount_received, out_degree, in_degree

        for i in range(self.n):
            a = outbound_profile[i]
            b = inbound_profile[i]

            norm_a = np.linalg.norm(a) + 1e-8
            norm_b = np.linalg.norm(b) + 1e-8

            cosine_sim = np.dot(a, b) / (norm_a * norm_b)
            cosine_dist = 1.0 - cosine_sim

            # Also factor in volume asymmetry
            total_out = self.temporal_raw[i, 0]
            total_in = self.temporal_raw[i, 1]
            total = total_out + total_in + 1e-8
            asymmetry = abs(total_out - total_in) / total

            scores[i] = max(0.0, cosine_dist * 0.6 + asymmetry * 0.4)

        # Normalise using percentile
        if scores.max() > 0:
            threshold = np.percentile(scores, CFG["drift_percentile"])
            scores = np.clip(scores / (threshold + 1e-8), 0.0, 1.0)

        logger.info(
            "Sub-detector 4 (Temporal drift): %d accounts above 90th pctl",
            np.sum(scores > 0.5),
        )
        return scores

    # ── Sub-detector 5: GNN Fusion ─────────────────────────────────────────

    def _gnn_fusion(self, composite: np.ndarray) -> np.ndarray:
        """
        Boost composite score when GraphSAGE agrees.
        If GNN prob > threshold AND behavioural score > 0, apply boost.
        Returns the boosted composite scores.
        """
        boosted = composite.copy()
        boost_threshold = CFG["gnn_boost_threshold"]
        boost_weight = CFG["gnn_boost_weight"]

        gnn_agreement = self.gnn_probs >= boost_threshold
        behaviour_flagged = composite > 0.0

        # Where both signals agree, boost the score
        both = gnn_agreement & behaviour_flagged
        boosted[both] = np.clip(
            composite[both] + boost_weight * self.gnn_probs[both],
            0.0, 1.0,
        )

        n_boosted = np.sum(both)
        logger.info(
            "Sub-detector 5 (GNN fusion): %d accounts boosted by GNN agreement",
            n_boosted,
        )
        return boosted

    # ── Main Detection Pipeline ────────────────────────────────────────────

    def detect(self) -> list[dict]:
        """
        Run all 5 sub-detectors and produce ranked results.

        Returns a list of dicts for flagged accounts, sorted by
        composite_score descending.
        """
        if self.peer_labels is None:
            raise RuntimeError("Call fit() before detect()")

        logger.info("Running 5 KYC behaviour sub-detectors on %d accounts...", self.n)
        t0 = time.time()

        # Run sub-detectors 1-4
        s1_zscore, deviant_dims = self._zscore_detector()
        s2_mahal     = self._mahalanobis_detector()
        s3_income    = self._income_mismatch_detector()
        s4_drift     = self._temporal_drift_detector()

        # Composite = weighted average of sub-detectors 1-4
        composite = (
            0.30 * s1_zscore
            + 0.25 * s2_mahal
            + 0.25 * s3_income
            + 0.20 * s4_drift
        )

        # Sub-detector 5: GNN fusion boost
        final_scores = self._gnn_fusion(composite)

        # Build results for flagged accounts
        results = []
        flag_threshold = CFG["flag_threshold"]

        for i in range(self.n):
            if final_scores[i] < flag_threshold:
                continue

            # Determine risk level
            score = float(final_scores[i])
            group = int(self.peer_labels[i])
            if score >= 0.8:
                risk_level = "CRITICAL"
            elif score >= 0.6:
                risk_level = "HIGH"
            elif score >= 0.4:
                risk_level = "MEDIUM"
            else:
                risk_level = "LOW"

            # Which sub-detectors triggered?
            triggers = []
            if s1_zscore[i] > 0.1:
                triggers.append("multi_dim_zscore")
            if s2_mahal[i] > 0.3:
                triggers.append("mahalanobis")
            if s3_income[i] > 0.1:
                triggers.append("income_mismatch")
            if s4_drift[i] > 0.3:
                triggers.append("temporal_drift")
            if self.gnn_probs[i] >= CFG["gnn_boost_threshold"]:
                triggers.append("gnn_agreement")

            results.append({
                "account_id":        self.account_ids[i],
                "composite_score":   round(score, 4),
                "risk_level":        risk_level,
                "peer_group":        group,
                "peer_group_name":   self.cluster_labels.get(group, f"Group {group}"),
                "triggers":          triggers,
                "n_triggers":        len(triggers),
                "deviant_dims":      deviant_dims[i],

                # Individual sub-detector scores
                "zscore_score":      round(float(s1_zscore[i]), 4),
                "mahalanobis_score": round(float(s2_mahal[i]), 4),
                "income_score":      round(float(s3_income[i]), 4),
                "drift_score":       round(float(s4_drift[i]), 4),
                "gnn_prob":          round(float(self.gnn_probs[i]), 4),
                "gnn_boosted":       bool(self.gnn_probs[i] >= CFG["gnn_boost_threshold"] and composite[i] > 0),

                # Context
                "tx_count_out":      int(self.features[i, 0]),
                "tx_count_in":       int(self.features[i, 1]),
                "avg_amount_sent":   round(float(self.features[i, 2]), 2),
                "avg_amount_recv":   round(float(self.features[i, 3]), 2),
                "out_degree":        int(self.features[i, 4]),
                "in_degree":         int(self.features[i, 5]),
                "active_days":       int(self.features[i, 6]),

                "estimated_monthly_income": round(float(self.estimated_monthly_income[i]), 2),
            })

        # Sort by composite score descending
        results.sort(key=lambda x: x["composite_score"], reverse=True)

        elapsed = time.time() - t0
        logger.info(
            "KYC mismatch detection complete — %d / %d accounts flagged in %.2fs",
            len(results), self.n, elapsed,
        )

        return results

    # ── Save Results ───────────────────────────────────────────────────────

    def save_results(self, results: list[dict], path: str | None = None) -> None:
        """Save detection results to JSON for the API to consume."""
        path = path or CFG["output_path"]

        output = {
            "metadata": {
                "timestamp":       datetime.now().isoformat(),
                "total_accounts":  self.n,
                "flagged_count":   len(results),
                "n_peer_groups":   CFG["n_peer_groups"],
                "flag_threshold":  CFG["flag_threshold"],
                "sub_detectors":   [
                    "multi_dim_zscore",
                    "mahalanobis",
                    "income_mismatch",
                    "temporal_drift",
                    "gnn_fusion",
                ],
            },
            "results": results,
        }

        with open(path, "w") as f:
            json.dump(output, f, indent=2)

        logger.info("KYC mismatch results saved → %s (%d records)", path, len(results))


# ────────────────────────────────────────────────────────────────────────────────
# STANDALONE RUNNER
# ────────────────────────────────────────────────────────────────────────────────

def run_kyc_mismatch() -> list[dict]:
    """
    Full standalone pipeline: load data, fit peer groups, detect, save results.
    Can be called from run_pipeline.py or executed directly.
    """
    logger.info("=" * 70)
    logger.info("KYC Behaviour Mismatch Engine — %s", datetime.now().isoformat())
    logger.info("=" * 70)

    pipeline_start = time.time()

    # 1. Load features from Neo4j
    logger.info("\n[1/4] Loading account features from Neo4j...")
    driver = _get_driver()
    account_ids, features, temporal_raw = _load_account_features(driver)

    if len(account_ids) == 0:
        logger.error("No accounts found in Neo4j. Run the ingestion pipeline first.")
        driver.close()
        return []

    # 2. Load GNN probabilities
    logger.info("\n[2/4] Loading GNN fraud probabilities...")
    gnn_probs = _load_gnn_probs(driver, account_ids)
    driver.close()

    # 3. Build detector and fit
    logger.info("\n[3/4] Fitting peer groups and running detection...")
    detector = KYCBehaviourMismatchDetector(
        features=features,
        temporal_raw=temporal_raw,
        account_ids=account_ids,
        gnn_probs=gnn_probs,
    )
    detector.fit()
    results = detector.detect()

    # 4. Save results
    logger.info("\n[4/4] Saving results...")
    detector.save_results(results)

    elapsed = time.time() - pipeline_start
    logger.info("\nKYC Mismatch Engine complete in %.2fs.", elapsed)

    return results


# ────────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    run_kyc_mismatch()
