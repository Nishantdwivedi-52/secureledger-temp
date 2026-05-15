from datetime import datetime

from neo4j import GraphDatabase

from ml.patterns import (

    detect_circular_flow,

    detect_mule_network,

    detect_dormant_activation,

    detect_currency_layering
)

# ------------------------------------------------
# NEO4J CONNECTION
# ------------------------------------------------

driver = GraphDatabase.driver(

    'bolt://localhost:7687',

    auth=('neo4j', 'secureledger123')
)

# ------------------------------------------------
# GENERATE EVIDENCE PACKAGE
# ------------------------------------------------

def generate_evidence(ring):

    nodes = ring['nodes']

    # --------------------------------------------
    # LOAD TRANSACTIONS
    # --------------------------------------------

    with driver.session() as s:

        txns = s.run(

            '''

            MATCH

            (src:Account)

            -[t:TRANSACTION]->

            (dst:Account)

            WHERE

            src.id IN $nodes

            AND

            dst.id IN $nodes

            RETURN

            src.id AS from_acc,

            dst.id AS to_acc,

            t.amount_paid AS amount,

            t.timestamp AS ts,

            t.payment_format AS fmt,

            t.is_laundering AS fraud

            ORDER BY t.timestamp

            ''',

            nodes=nodes

        ).data()

    # --------------------------------------------
    # PATTERN DETECTION
    # --------------------------------------------

    patterns = {

        'circular_flow':

        detect_circular_flow(nodes),

        'mule_network':

        detect_mule_network(nodes),

        'dormant_activation':

        detect_dormant_activation(nodes),

        'currency_layering':

        detect_currency_layering(nodes),
    }

    # --------------------------------------------
    # ACTIVE PATTERNS
    # --------------------------------------------

    active_patterns = [

        k

        for k, v in patterns.items()

        if v['detected']
    ]

    # --------------------------------------------
    # SAFE TIMESTAMPS
    # --------------------------------------------

    timestamps = [

        t.get('ts')

        for t in txns

        if t.get('ts')
    ]

    # --------------------------------------------
    # FINAL EVIDENCE OBJECT
    # --------------------------------------------

    evidence = {

        'case_id':

        f'SEC-{ring["ring_id"].upper()}',

        'generated_at':

        datetime.now().isoformat(),

        'ring_id':

        ring['ring_id'],

        'flagged_accounts':

        nodes,

        'mastermind':

        ring['mastermind'],

        'total_amount':

        round(

            sum(
                t.get('amount', 0) or 0
                for t in txns
            ),

            2
        ),

        'time_window': {

            'start':

            min(timestamps)

            if timestamps else None,

            'end':

            max(timestamps)

            if timestamps else None
        },

        'transaction_count':

        len(txns),

        'fraud_transaction_count':

        len([

            t for t in txns

            if t.get('fraud', 0) == 1
        ]),

        'active_patterns':

        active_patterns,

        'pattern_details':

        patterns,

        'transaction_timeline':

        txns
    }

    return evidence

# ------------------------------------------------
# GENERATE STR REPORT
# ------------------------------------------------

def generate_str_report(evidence):

    lines = [

        'SUSPICIOUS TRANSACTION REPORT (STR)',

        '=' * 60,

        f'Case ID: {evidence["case_id"]}',

        f'Generated At: {evidence["generated_at"]}',

        f'Ring ID: {evidence["ring_id"]}',

        f'Mastermind: {evidence["mastermind"]}',

        f'Flagged Accounts: {len(evidence["flagged_accounts"])}',

        f'Total Amount: {evidence["total_amount"]:,.2f}',

        f'Transactions: {evidence["transaction_count"]}',

        f'Fraud Transactions: {evidence["fraud_transaction_count"]}',

        '',

        'DETECTED PATTERNS:',
    ]

    # --------------------------------------------
    # PATTERN LIST
    # --------------------------------------------

    for p in evidence['active_patterns']:

        lines.append(

            f' - {p.replace("_"," ").title()}'
        )

    # --------------------------------------------
    # FLAGGED ACCOUNTS
    # --------------------------------------------

    lines.extend([

        '',

        'FLAGGED ACCOUNTS:'
    ])

    for acc in evidence['flagged_accounts']:

        lines.append(f' - {acc}')

    # --------------------------------------------
    # TRANSACTION TIMELINE
    # --------------------------------------------

    lines.extend([

        '',

        'TRANSACTION TIMELINE:'
    ])

    for t in evidence['transaction_timeline'][:20]:

        lines.append(

            f'{t.get("ts")} | '

            f'{str(t.get("from_acc"))[:8]} '

            f'-> '

            f'{str(t.get("to_acc"))[:8]} | '

            f'{(t.get("amount",0) or 0):,.2f} | '

            f'{"FRAUD" if t.get("fraud",0) else "NORMAL"}'
        )

    # --------------------------------------------
    # REPORT END
    # --------------------------------------------

    lines.extend([

        '',

        'END OF REPORT'
    ])

    return '\n'.join(lines)