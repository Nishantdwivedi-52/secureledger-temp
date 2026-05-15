from neo4j import GraphDatabase

# ------------------------------------------------
# NEO4J CONNECTION
# ------------------------------------------------

URI = "bolt://localhost:7687"

AUTH = (
    "neo4j",
    "secureledger123"
)

driver = GraphDatabase.driver(
    URI,
    auth=AUTH
)

# ------------------------------------------------
# PROPAGATION ENGINE
# ------------------------------------------------

def propagate(
    iterations=3,
    decay=0.5
):

    print("\n=== STARTING RISK PROPAGATION ===\n")

    # -----------------------------------------
    # LOAD ACCOUNT SCORES
    # -----------------------------------------

    with driver.session() as session:

        accounts = session.run("""

            MATCH (a:Account)

            RETURN

            a.id AS id,

            coalesce(
                a.anomaly_score,
                0
            ) AS score

        """).data()

        # Convert to dictionary

        scores = {

            acc["id"]: acc["score"]

            for acc in accounts
        }

        print(
            f"Loaded {len(scores)} accounts"
        )

        # -----------------------------------------
        # LOAD TRANSACTIONS
        # -----------------------------------------

        edges = session.run("""

            MATCH

            (src:Account)

            -[t:TRANSACTION]->

            (dst:Account)

            RETURN

            src.id AS src,

            dst.id AS dst,

            t.amount_paid AS amount

        """).data()

        print(
            f"Loaded {len(edges)} transactions"
        )

    # -----------------------------------------
    # BUILD GRAPH ADJACENCY
    # -----------------------------------------

    adjacency = {}

    for edge in edges:

        src = edge["src"]

        dst = edge["dst"]

        amount = edge["amount"]

        adjacency.setdefault(
            src,
            []
        ).append(
            (
                dst,
                amount
            )
        )

    print("Adjacency graph built")

    # -----------------------------------------
    # NORMALIZE TRANSACTION WEIGHTS
    # -----------------------------------------

    for src in adjacency:

        total_amount = sum(

            amount

            for _, amount

            in adjacency[src]

        )

        if total_amount == 0:

            total_amount = 1

        adjacency[src] = [

            (
                dst,
                amount / total_amount
            )

            for dst, amount

            in adjacency[src]
        ]

    print("Transaction weights normalized")

    # -----------------------------------------
    # PROPAGATION ITERATIONS
    # -----------------------------------------

    current_scores = dict(scores)

    for iteration in range(iterations):

        print(
            f"\nRunning iteration {iteration+1}"
        )

        new_scores = {}

        for node in current_scores:

            propagated_risk = sum(

                current_scores.get(dst, 0) * weight

                for dst, weight

                in adjacency.get(node, [])

            )

            new_scores[node] = (

                (1 - decay)
                * current_scores[node]

                +

                decay
                * propagated_risk
            )

        current_scores = new_scores

    print("\nPropagation complete")

    # -----------------------------------------
    # WRITE TO NEO4J
    # -----------------------------------------

    batch = [

        {
            "id": node_id,
            "risk": float(score)
        }

        for node_id, score

        in current_scores.items()
    ]

    with driver.session() as session:

        for i in range(0, len(batch), 500):

            session.run("""

                UNWIND $rows AS row

                MATCH
                (a:Account {id: row.id})

                SET
                a.propagated_risk = row.risk

            """, rows=batch[i:i+500])

            print(
                f"Written {i+500} rows"
            )

    print("\n=== SUCCESS ===")

    driver.close()

# ------------------------------------------------
# MAIN
# ------------------------------------------------

if __name__ == "__main__":

    propagate()