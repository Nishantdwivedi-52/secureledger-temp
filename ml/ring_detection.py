# =========================================================
# FRAUD RING DETECTION — FULLY CORRECTED VERSION
# =========================================================

import json
from collections import defaultdict

import community as community_louvain
import networkx as nx
from neo4j import GraphDatabase


print("LOADED UPDATED RING DETECTION FILE")


# =========================================================
# NEO4J CONNECTION
# =========================================================

URI = "bolt://localhost:7687"
USERNAME = "neo4j"
PASSWORD = "secureledger123"

driver = GraphDatabase.driver(
    URI,
    auth=(USERNAME, PASSWORD)
)


# =========================================================
# BUILD RISK SUBGRAPH
# =========================================================

def build_risk_subgraph(threshold=0.05):

    print("\n=== BUILDING RISK SUBGRAPH ===")

    G = nx.Graph()

    query = """
    MATCH
        (src:Account)-[tx:TRANSACTION]->(dst:Account)

    WHERE
        src.fraud_prob >= $threshold
        OR
        dst.fraud_prob >= $threshold

    RETURN
        src.id AS src,
        dst.id AS dst,

        coalesce(src.fraud_prob, 0.0) AS src_prob,
        coalesce(dst.fraud_prob, 0.0) AS dst_prob,

        coalesce(tx.amount_paid, 1.0) AS amount,

        coalesce(tx.is_laundering, 0) AS is_fraud
    """

    with driver.session() as session:

        result = session.run(
            query,
            threshold=threshold
        )

        for record in result:

            src = str(record["src"]).strip()
            dst = str(record["dst"]).strip()

            src_prob = float(record["src_prob"])
            dst_prob = float(record["dst_prob"])

            amount = float(record["amount"])

            is_fraud = bool(record["is_fraud"])

            # Dynamic edge weight
            weight = amount

            if is_fraud:
                weight *= 3.0

            weight *= (1.0 + src_prob + dst_prob)

            G.add_edge(
                src,
                dst,
                weight=weight,
                amount=amount,
                is_fraud=is_fraud
            )

    print(f"Nodes : {G.number_of_nodes()}")
    print(f"Edges : {G.number_of_edges()}")

    return G


# =========================================================
# DETECT COMMUNITIES
# =========================================================

def get_suspicious_communities(G):

    print("\n=== RUNNING LOUVAIN COMMUNITY DETECTION ===")

    if G.number_of_nodes() == 0:

        print("Empty graph.")
        return {}

    partition = community_louvain.best_partition(
        G,
        weight="weight"
    )

    print("Partition size:", len(partition))
    print("Partition sample:", list(partition.items())[:10])

    communities = defaultdict(list)

    for node, comm_id in partition.items():

        communities[comm_id].append(node)

    suspicious = {}

    for comm_id, members in communities.items():

        subG = G.subgraph(members)

        fraud_edges = sum(

            1

            for _, _, d

            in subG.edges(data=True)

            if d.get("is_fraud") is True
        )

        total_edges = max(
            subG.number_of_edges(),
            1
        )

        fraud_ratio = fraud_edges / total_edges

        avg_degree = (

            sum(dict(subG.degree()).values())

            / max(len(members), 1)
        )

        total_volume = sum(

            d.get("amount", 0.0)

            for _, _, d

            in subG.edges(data=True)
        )

        # Keep all meaningful communities
        if len(members) >= 2:

            suspicious[comm_id] = {

                "members": members,

                "fraud_ratio": fraud_ratio,

                "avg_degree": avg_degree,

                "total_volume": total_volume
            }

    print(f"Suspicious Rings Found : {len(suspicious)}")

    print(
        "Suspicious keys sample:",
        list(suspicious.keys())[:10]
    )

    return suspicious


# =========================================================
# IDENTIFY MASTERMIND
# =========================================================

def identify_mastermind(G, members):

    subG = G.subgraph(members)

    centrality = nx.degree_centrality(subG)

    mastermind = max(
        centrality,
        key=centrality.get
    )

    normalized_scores = {}

    max_score = max(
        centrality.values()
    ) if centrality else 1.0

    for node, score in centrality.items():

        normalized_scores[node] = float(
            score / max_score
        )

    return mastermind, normalized_scores


# =========================================================
# SAVE JSON
# =========================================================

def save_ring_json(suspicious, G):

    print("\n=== SAVING fraud_rings.json ===")

    data = []

    for ring_id, info in suspicious.items():

        members = info["members"]

        mastermind, scores = identify_mastermind(
            G,
            members
        )

        data.append({

            "ring_id": int(ring_id),

            "size": len(members),

            "members": [
                str(x)
                for x in members
            ],

            "mastermind": str(mastermind),

            "fraud_ratio": float(
                info["fraud_ratio"]
            ),

            "avg_degree": float(
                info["avg_degree"]
            ),

            "total_volume": float(
                info["total_volume"]
            ),

            "scores": {

                str(k): float(v)

                for k, v

                in scores.items()
            }
        })

    with open(
        "ml/rings.json",
        "w"
    ) as f:

        json.dump(
            data,
            f,
            indent=4
        )

    print("Saved fraud_rings.json")


# =========================================================
# WRITE RESULTS TO NEO4J
# =========================================================

def save_results_to_neo4j(G, suspicious):

    print("\n=== WRITING RESULTS TO NEO4J ===")

    rows = []

    for ring_id, info in suspicious.items():

        members = info["members"]

        mastermind, scores = identify_mastermind(
            G,
            members
        )

        for node in members:

            rows.append({

                "account_id": str(node).strip(),

                "ring_id": int(ring_id),

                "mastermind_score": float(
                    scores[node]
                ),

                "is_mastermind": bool(
                    node == mastermind
                ),

                "ring_size": int(
                    len(members)
                ),

                "fraud_ratio": float(
                    info["fraud_ratio"]
                ),

                "avg_degree": float(
                    info["avg_degree"]
                ),

                "total_volume": float(
                    info["total_volume"]
                )
            })

    print("Rows prepared:", len(rows))

    if len(rows) == 0:

        print("No suspicious rings found.")
        return

    print(rows[:5])

    query = """
    UNWIND $rows AS row

    MATCH (a:Account {id: row.account_id})

    SET
        a.ring_id = row.ring_id,
        a.mastermind_score = row.mastermind_score,
        a.is_mastermind = row.is_mastermind,
        a.ring_size = row.ring_size,
        a.ring_fraud_ratio = row.fraud_ratio,
        a.ring_avg_degree = row.avg_degree,
        a.ring_total_volume = row.total_volume
    """

    # =====================================================
    # BATCH WRITE TO NEO4J
    # =====================================================

    BATCH_SIZE = 5000

    with driver.session() as session:

        total_batches = (
            len(rows) // BATCH_SIZE
        ) + 1

        for i in range(0, len(rows), BATCH_SIZE):

            batch = rows[i:i + BATCH_SIZE]

            current_batch = (
                i // BATCH_SIZE
            ) + 1

            print(
                f"Writing batch "
                f"{current_batch}/{total_batches}"
            )

            def write_tx(tx):

                result = tx.run(
                    query,
                    rows=batch
                )

                result.consume()

            session.execute_write(
                write_tx
            )

    print("Neo4j updated successfully.")

# =========================================================
# RUN PIPELINE
# =========================================================

def run_ring_detection():

    print("\n=== FRAUD RING DETECTION PIPELINE ===")

    G = build_risk_subgraph(
        threshold=0.05
    )

    suspicious = get_suspicious_communities(G)

    save_ring_json(
        suspicious,
        G
    )

    save_results_to_neo4j(
        G,
        suspicious
    )

    print("\n=== FRAUD RING DETECTION COMPLETE ===")


# =========================================================
# MAIN
# =========================================================

def main():

    run_ring_detection()


if __name__ == "__main__":

    main()