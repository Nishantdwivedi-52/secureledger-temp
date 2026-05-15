import json
import networkx as nx
import community as community_louvain

from neo4j import GraphDatabase

# ------------------------------------------------
# CONNECT TO NEO4J
# ------------------------------------------------

driver = GraphDatabase.driver(
    "bolt://localhost:7687",
    auth=("neo4j", "secureledger123")
)

# ------------------------------------------------
# BUILD HIGH-RISK SUBGRAPH
# ------------------------------------------------

def build_risk_subgraph(
    threshold=0.5
):

    print("\n=== BUILDING RISK SUBGRAPH ===\n")

    with driver.session() as session:

        edges = session.run("""

            MATCH

            (src:Account)

            -[t:TRANSACTION]->

            (dst:Account)

            WHERE

            src.fraud_prob > $threshold

            OR

            dst.fraud_prob > $threshold

            RETURN

            src.id AS src,

            dst.id AS dst,

            t.amount_paid AS amount,

            t.is_laundering AS fraud

        """, threshold=threshold).data()

    G = nx.DiGraph()

    for edge in edges:

        G.add_edge(

            edge["src"],

            edge["dst"],

            weight=float(
                edge["amount"]
            ),

            fraud=int(
                edge["fraud"]
            )
        )

    print(
        f"Nodes : {G.number_of_nodes()}"
    )

    print(
        f"Edges : {G.number_of_edges()}"
    )

    return G

# ------------------------------------------------
# DETECT COMMUNITIES
# ------------------------------------------------

def detect_communities(G):

    print("\n=== RUNNING LOUVAIN ===\n")

    undirected = G.to_undirected()

    partition = community_louvain.best_partition(
        undirected
    )

    print(
        f"Communities Found : {len(set(partition.values()))}"
    )

    return partition

# ------------------------------------------------
# FILTER SUSPICIOUS COMMUNITIES
# ------------------------------------------------

def get_suspicious_communities(
    G,
    partition
):

    print("\n=== FILTERING FRAUD RINGS ===\n")

    communities = {}

    for node, comm_id in partition.items():

        communities.setdefault(
            comm_id,
            []
        ).append(node)

    suspicious = {}

    for comm_id, nodes in communities.items():

        # Ignore tiny groups

        if len(nodes) < 3:
            continue

        subG = G.subgraph(nodes)

        fraud_edges = sum(

            1

            for _, _, d

            in subG.edges(data=True)

            if d.get("fraud") == 1
        )

        avg_degree = sum(

            dict(subG.degree()).values()

        ) / max(len(nodes), 1)

        # Keep suspicious communities only

        if fraud_edges > 0 or avg_degree > 2:

            suspicious[comm_id] = {

                "nodes": nodes,

                "fraud_edges": fraud_edges,

                "size": len(nodes),

                "avg_degree": round(avg_degree, 2)
            }

    print(
        f"Suspicious Rings : {len(suspicious)}"
    )

    return suspicious

# ------------------------------------------------
# IDENTIFY MASTERMINDS
# ------------------------------------------------

def identify_masterminds(
    G,
    suspicious
):

    print("\n=== IDENTIFYING MASTERMINDS ===\n")

    rings = []

    for comm_id, info in suspicious.items():

        nodes = info["nodes"]

        subG = G.subgraph(nodes).copy()

        # ----------------------------------------
        # PAGERANK
        # ----------------------------------------

        pagerank = nx.pagerank(
            subG,
            weight="weight",
            alpha=0.85
        )

        # ----------------------------------------
        # BETWEENNESS CENTRALITY
        # ----------------------------------------

        betweenness = nx.betweenness_centrality(
            subG,
            weight="weight",
            normalized=True
        )

        # ----------------------------------------
        # NORMALIZATION
        # ----------------------------------------

        def normalize(scores):

            max_score = max(
                scores.values()
            ) or 1

            return {

                k: v / max_score

                for k, v

                in scores.items()
            }

        pr_norm = normalize(
            pagerank
        )

        bc_norm = normalize(
            betweenness
        )

        # ----------------------------------------
        # COMBINED SCORE
        # ----------------------------------------

        combined_scores = {}

        for node in nodes:

            combined_scores[node] = (

                0.5 * pr_norm[node]

                +

                0.5 * bc_norm[node]
            )

        mastermind = max(
            combined_scores,
            key=combined_scores.get
        )

        print(
            f"ring_{comm_id} -> mastermind = {mastermind[:8]}"
        )

        # ----------------------------------------
        # BUILD RING OBJECT
        # ----------------------------------------

        ring = {

            "ring_id": f"ring_{comm_id}",

            "mastermind": mastermind,

            "nodes": nodes,

            "size": len(nodes),

            "fraud_edges": info["fraud_edges"],

            "avg_degree": info["avg_degree"],

            "scores": {

                k: float(v)

                for k, v

                in combined_scores.items()
            }
        }

        rings.append(ring)

    return rings

# ------------------------------------------------
# WRITE RESULTS TO NEO4J
# ------------------------------------------------

def write_ring_data(rings):

    print("\n=== WRITING TO NEO4J ===\n")

    with driver.session() as session:

        for ring in rings:

            print(
                f"Writing {ring['ring_id']}"
            )

            batch = []

            for node in ring["nodes"]:

                batch.append({

                    "id": node,

                    "ring_id": str(
                        ring["ring_id"]
                    ),

                    "score": float(
                        ring["scores"][node]
                    ),

                    "is_mastermind":

                    bool(
                        node == ring["mastermind"]
                    )
                })

            session.run("""

                UNWIND $rows AS row

                MATCH
                (a:Account {id: row.id})

                SET

                a.ring_id = row.ring_id,

                a.mastermind_score = row.score,

                a.is_mastermind = row.is_mastermind

            """, rows=batch)

    print("\nNeo4j updated successfully")

# ------------------------------------------------
# SAVE JSON FILE
# ------------------------------------------------

def save_rings_json(rings):

    with open(
        "ml/rings.json",
        "w"
    ) as f:

        json.dump(
            rings,
            f,
            indent=2
        )

    print("\nrings.json saved")

# ------------------------------------------------
# MAIN PIPELINE
# ------------------------------------------------

def run_ring_detection():

    G = build_risk_subgraph()

    partition = detect_communities(G)

    suspicious = get_suspicious_communities(
        G,
        partition
    )

    rings = identify_masterminds(
        G,
        suspicious
    )

    write_ring_data(rings)

    save_rings_json(rings)

    print("\n=== RING DETECTION COMPLETE ===\n")

# ------------------------------------------------
# MAIN
# ------------------------------------------------

if __name__ == "__main__":

    run_ring_detection()