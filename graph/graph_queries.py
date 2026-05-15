
from neo4j import GraphDatabase

# ------------------------------------------------
# NEO4J CONNECTION
# ------------------------------------------------

URI = "bolt://localhost:7687"
USERNAME = "neo4j"
PASSWORD = "secureledger123"

driver = GraphDatabase.driver(
    URI,
    auth=(USERNAME, PASSWORD)
)

# ------------------------------------------------
# TEST CONNECTION
# ------------------------------------------------

def test_connection():

    query = """
    RETURN 'Neo4j Connected Successfully'
    AS message
    """

    with driver.session() as session:

        result = session.run(query).single()

        return result["message"]


# ------------------------------------------------
# DASHBOARD STATS
# ------------------------------------------------

def get_dashboard_stats():
    with driver.session() as session:
        query = """
        MATCH (a:Account)
        RETURN 
            count(a) as total_accounts,
            count(CASE WHEN a.anomaly_score > 0.7 THEN 1 END) as high_risk_accounts,
            avg(a.anomaly_score) as avg_risk
        """
        result = session.run(query).single()
        
        # If the database is empty, return zeros instead of None/null
        return {
            "total_accounts": result["total_accounts"] or 0,
            "high_risk_accounts": result["high_risk_accounts"] or 0,
            "avg_risk": round(result["avg_risk"], 4) if result["avg_risk"] else 0
        }


# ------------------------------------------------
# TOP RISKY ACCOUNTS
# ------------------------------------------------

def get_top_risky_accounts(limit=20, search_id=None):
    with driver.session() as session:
        if search_id:
            # Search for a specific ID across the whole database
            query = """
            MATCH (a:Account {id: $search_id})
            RETURN a.id AS id, a.anomaly_score AS anomaly_score
            """
            result = session.run(query, search_id=search_id)
        else:
            # Default: show the most suspicious ones
            query = """
            MATCH (a:Account)
            WHERE a.anomaly_score IS NOT NULL
            RETURN a.id AS id, a.anomaly_score AS anomaly_score
            ORDER BY a.anomaly_score DESC
            LIMIT $limit
            """
            result = session.run(query, limit=limit)
        
        return [dict(record) for record in result]


# ------------------------------------------------
# ACCOUNT DETAILS
# ------------------------------------------------

def get_account_details(account_id):

    query = """

    MATCH (a:Account {id:$account_id})

    OPTIONAL MATCH
    (a)-[t:TRANSACTION]->(b)

    RETURN

    a.id AS account_id,

    a.risk_score AS risk_score,

    a.pr_score AS pagerank,

    a.betweenness_score AS betweenness,

    a.community_id AS community_id,

    count(t) AS tx_count,

    coalesce(
        sum(t.amount_paid),
        0
    ) AS total_sent

    """

    with driver.session() as session:

        result = session.run(
            query,
            account_id=account_id
        ).single()

        return dict(result) if result else None


# ------------------------------------------------
# RECENT TRANSACTIONS
# ------------------------------------------------

def get_recent_transactions(
    account_id,
    limit=20
):

    query = """

    MATCH
    (a:Account {id:$account_id})

    -[t:TRANSACTION]->

    (b:Account)

    RETURN

    b.id AS receiver,

    t.amount_paid AS amount,

    t.timestamp AS timestamp,

    t.payment_format AS payment_format

    ORDER BY t.timestamp DESC

    LIMIT $limit

    """

    with driver.session() as session:

        result = session.run(
            query,
            account_id=account_id,
            limit=limit
        )

        return [dict(r) for r in result]


# ------------------------------------------------
# SUBGRAPH VISUALIZATION
# ------------------------------------------------

def get_subgraph(account_id):

    query = """

    MATCH path =

    (a:Account {id:$account_id})

    -[:TRANSACTION*1..2]-

    (b)

    RETURN path

    LIMIT 50

    """

    with driver.session() as session:

        result = session.run(
            query,
            account_id=account_id
        )

        nodes = {}
        links = []

        for record in result:

            path = record["path"]

            for node in path.nodes:

                nodes[node.id] = {

                    "id": node["id"],

                    "risk_score":
                    node.get(
                        "risk_score",
                        0
                    ),

                    "community":
                    node.get(
                        "community_id",
                        0
                    )
                }

            for rel in path.relationships:

                links.append({

                    "source":
                    rel.start_node["id"],

                    "target":
                    rel.end_node["id"]

                })

        return {

            "nodes":
            list(nodes.values()),

            "links":
            links
        }


# ------------------------------------------------
# FRAUD RING DETECTION
# ------------------------------------------------

def detect_circular_flows():

    query = """

    MATCH path =

    (a:Account)

    -[:TRANSACTION*2..5]->

    (a)

    RETURN path

    LIMIT 20

    """

    with driver.session() as session:

        result = session.run(query)

        return [
            r["path"]
            for r in result
        ]


# ------------------------------------------------
# MULE ACCOUNT DETECTION
# ------------------------------------------------

def detect_mule_accounts():

    query = """

    MATCH
    (a:Account)-[t:TRANSACTION]->()

    WITH
    a,
    count(t) AS out_degree

    WHERE out_degree > 15

    RETURN

    a.id AS account_id,

    out_degree

    ORDER BY out_degree DESC

    LIMIT 50

    """

    with driver.session() as session:

        result = session.run(query)

        return [
            dict(r)
            for r in result
        ]

def get_circular_flows(limit=10):
    with driver.session() as s:
        result = s.run('''
            MATCH path = (a:Account)-[:TRANSACTION*3..4]->(a)
            WHERE ALL(r IN relationships(path) WHERE r.is_laundering = 1)
            RETURN [n IN nodes(path) | n.id] AS cycle,
                   [r IN relationships(path) | r.amount_paid] AS amounts
            LIMIT $limit
        ''', limit=limit)
        return [{'cycle': r['cycle'], 'amounts': r['amounts']} for r in result]
    
# ------------------------------------------------
# MAIN TEST
# ------------------------------------------------
# ------------------------------------------------
# FRAUD RING GRAPH VISUALIZATION
# ------------------------------------------------

def get_ring_graph(limit=120):

    query = """

    MATCH

    (src:Account)

    -[t:TRANSACTION]->

    (dst:Account)

    WHERE

    (src.ring_id IS NOT NULL

    OR

    dst.ring_id IS NOT NULL
    )
    AND
    (src.fraud_prob > 0.5
    OR
    dst.fraud_prob > 0.5
    )

    RETURN

    src,
    dst,
    t

    LIMIT $limit

    """

    with driver.session() as session:

        results = session.run(
            query,
            limit=limit
        )

        nodes = {}

        links = []

        for record in results:

            src = record["src"]

            dst = record["dst"]

            tx = record["t"]

            # --------------------------------
            # SOURCE NODE
            # --------------------------------

            nodes[src.id] = {

                "id": src["id"],

                "fraud_prob":

                src.get(
                    "fraud_prob",
                    0
                ),

                "ring_id":

                src.get(
                    "ring_id",
                    None
                ),

                "is_mastermind":

                src.get(
                    "is_mastermind",
                    False
                )
            }

            # --------------------------------
            # DEST NODE
            # --------------------------------

            nodes[dst.id] = {

                "id": dst["id"],

                "fraud_prob":

                dst.get(
                    "fraud_prob",
                    0
                ),

                "ring_id":

                dst.get(
                    "ring_id",
                    None
                ),

                "is_mastermind":

                dst.get(
                    "is_mastermind",
                    False
                )
            }

            # --------------------------------
            # EDGE
            # --------------------------------

            links.append({

                "source": src["id"],

                "target": dst["id"],

                "amount":

                tx.get(
                    "amount_paid",
                    1
                )
            })

        return {

            "nodes": list(nodes.values()),

            "links": links
        }
    
# ------------------------------------------------
# RING STATISTICS
# ------------------------------------------------

def get_ring_stats():

    query = """

    MATCH (a:Account)

    WHERE a.ring_id IS NOT NULL

    RETURN

    count(DISTINCT a.ring_id) AS total_rings,

    count(
        CASE
        WHEN a.is_mastermind = true
        THEN 1
        END
    ) AS masterminds,

    count(a) AS suspicious_accounts

    """

    with driver.session() as session:

        result = session.run(query).single()

        return {

            "total_rings":
            result["total_rings"],

            "masterminds":
            result["masterminds"],

            "suspicious_accounts":
            result["suspicious_accounts"]
        }

# ------------------------------------------------
# TOP MASTERMINDS
# ------------------------------------------------

def get_top_masterminds(limit=20):

    query = """

    MATCH (a:Account)

    WHERE a.is_mastermind = true

    RETURN

    a.id AS id,

    a.ring_id AS ring_id,

    a.mastermind_score AS mastermind_score,

    a.fraud_prob AS fraud_prob

    ORDER BY a.mastermind_score DESC

    LIMIT $limit

    """

    with driver.session() as session:

        results = session.run(
            query,
            limit=limit
        )

        return [

            {
                "id": r["id"],

                "ring_id": r["ring_id"],

                "mastermind_score":

                r["mastermind_score"],

                "fraud_prob":

                r["fraud_prob"]
            }

            for r in results
        ]
if __name__ == "__main__":

    print("\n=== CONNECTION TEST ===")
    print(test_connection())

    print("\n=== DASHBOARD STATS ===")
    print(get_dashboard_stats())

    print("\n=== TOP RISKY ACCOUNTS ===")
    print(get_top_risky_accounts(5))

    print("\n=== CIRCULAR FLOWS ===")
    print(get_circular_flows(5))

    print("\n=== MULE ACCOUNTS ===")
    print(detect_mule_accounts())