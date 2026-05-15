from neo4j import GraphDatabase

driver = GraphDatabase.driver(
    'bolt://localhost:7687',
    auth=('neo4j', 'secureledger123')
)

# ------------------------------------------------
# CIRCULAR FLOW DETECTION
# ------------------------------------------------

def detect_circular_flow(nodes):

    with driver.session() as s:

        result = s.run(

            '''

            MATCH path =

            (a:Account)

            -[:TRANSACTION*3..4]->

            (a)

            WHERE a.id IN $nodes

            RETURN

            [n IN nodes(path) | n.id] AS cycle

            LIMIT 5

            ''',

            nodes=nodes
        ).data()

    return {

        'detected': len(result) > 0,

        'cycles': [

            r['cycle']

            for r in result
        ]
    }

# ------------------------------------------------
# MULE NETWORK DETECTION
# ------------------------------------------------

def detect_mule_network(nodes):

    with driver.session() as s:

        result = s.run(

            '''

            MATCH

            (src:Account)

            -[:TRANSACTION]->

            (dst:Account)

            WHERE dst.id IN $nodes

            WITH dst,

            count(DISTINCT src) AS fan_in

            WHERE fan_in > 3

            RETURN

            dst.id AS mule,

            fan_in

            ORDER BY fan_in DESC

            ''',

            nodes=nodes
        ).data()

    return {

        'detected': len(result) > 0,

        'mules': result
    }

# ------------------------------------------------
# DORMANT ACTIVATION
# ------------------------------------------------

def detect_dormant_activation(nodes):

    with driver.session() as s:

        result = s.run(

            '''

            MATCH

            (a:Account)

            -[t:TRANSACTION]->()

            WHERE a.id IN $nodes

            WITH

            a,

            min(t.timestamp) AS first_txn,

            max(t.timestamp) AS last_txn,

            count(t) AS txn_count

            WHERE txn_count > 10

            RETURN

            a.id AS account,

            txn_count,

            first_txn,

            last_txn

            ''',

            nodes=nodes
        ).data()

    return {

        'detected': len(result) > 0,

        'accounts': result
    }

# ------------------------------------------------
# CURRENCY LAYERING
# ------------------------------------------------

def detect_currency_layering(nodes):

    with driver.session() as s:

        result = s.run(

            '''

            MATCH

            (src:Account)

            -[t:TRANSACTION]->

            (dst:Account)

            WHERE

            src.id IN $nodes

            AND

            t.pay_currency <> t.recv_currency

            RETURN

            src.id AS src,

            dst.id AS dst,

            t.pay_currency AS pay_currency,

            t.recv_currency AS recv_currency,

            t.amount_paid AS amount_paid,

            t.amount_received AS amount_received

            LIMIT 10

            ''',

            nodes=nodes
        ).data()

    return {

        'detected': len(result) > 0,

        'conversions': result
    }