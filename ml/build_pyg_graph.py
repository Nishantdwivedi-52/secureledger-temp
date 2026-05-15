import torch
import numpy as np
from torch_geometric.data import Data
from neo4j import GraphDatabase

URI = "bolt://localhost:7687"
AUTH = ("neo4j", "secureledger123")

driver = GraphDatabase.driver(
    URI,
    auth=AUTH
)

def normalize(values):

    arr = np.array(values, dtype=float)

    mn = arr.min()
    mx = arr.max()

    if mx - mn == 0:
        return np.zeros_like(arr)

    return (arr - mn) / (mx - mn)

def run():

    print("\n=== BUILDING PYG GRAPH ===\n")

    with driver.session() as s:

        print("Loading accounts...")

        accs = s.run("""

            MATCH (a:Account)

            RETURN

            a.id AS id,

            coalesce(a.pr_score, 0.0)
            AS pr_score,

            coalesce(a.degree_score, 0.0)
            AS degree_score,

            coalesce(a.community_id, 0)
            AS community_id

        """).data()

        print(f"Accounts Loaded: {len(accs)}")

        print("\nCreating node index mapping...")

        id2idx = {

            a['id']: i

            for i, a in enumerate(accs)
        }

        print("Loading transaction edges...")

        rels = s.run("""

            MATCH

            (src:Account)

            -[t:TRANSACTION]->

            (dst:Account)

            RETURN

            src.id AS s,

            dst.id AS d,

            t.amount_paid AS amt,

            t.is_laundering AS label

        """).data()

        print(f"Edges Loaded: {len(rels)}")

    print("\nNormalizing graph features...")

    pr_scores = normalize(
        [a['pr_score'] for a in accs]
    )

    degree_scores = normalize(
        [a['degree_score'] for a in accs]
    )

    community_scores = normalize(
        [a['community_id'] for a in accs]
    )

    print("Building node feature matrix...")

    x = torch.tensor(

        [

            [
                pr_scores[i],
                degree_scores[i],
                community_scores[i]
            ]

            for i in range(len(accs))

        ],

        dtype=torch.float
    )

    print("Building edge_index...")

    edge_index = torch.tensor(

        [

            [
                id2idx[r['s']],
                id2idx[r['d']]
            ]

            for r in rels

            if r['s'] in id2idx
            and r['d'] in id2idx

        ],

        dtype=torch.long

    ).t().contiguous()

    print("Building edge labels...")

    edge_label = torch.tensor(

        [

            int(r['label'])

            for r in rels

        ],

        dtype=torch.float
    )

    print("Creating PyTorch Geometric Data object...")

    data = Data(

        x=x,

        edge_index=edge_index,

        edge_label=edge_label
    )

    data.id2idx = id2idx

    print("\nSaving graph.pt ...")

    torch.save(
        data,
        "ml/graph.pt"
    )

    print("\n=== SUCCESS ===")
    print(f"Nodes: {data.num_nodes}")
    print(f"Edges: {data.num_edges}")
    print(f"Features per node: {data.num_node_features}")

if __name__ == "__main__":
    run()