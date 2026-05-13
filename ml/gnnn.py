import torch
import torch.nn.functional as F
import numpy as np

from torch_geometric.nn import SAGEConv

from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix
)

from neo4j import GraphDatabase

# ------------------------------------------------
# LOAD GRAPH
# ------------------------------------------------

print("\n=== LOADING GRAPH DATA ===\n")

data = torch.load(
    "ml/graph.pt",
    weights_only=False
)

embeddings = np.load(
    "ml/embeddings.npy"
)

# Use Node2Vec embeddings as features

data.x = torch.tensor(
    embeddings,
    dtype=torch.float
)

print(f"Nodes Loaded : {data.num_nodes}")
print(f"Edges Loaded : {data.num_edges}")
print(f"Embedding Shape : {embeddings.shape}")

# ------------------------------------------------
# CONNECT TO NEO4J
# ------------------------------------------------

driver = GraphDatabase.driver(
    "bolt://localhost:7687",
    auth=("neo4j", "secureledger123")
)

# ------------------------------------------------
# LOAD FRAUD LABELS
# ------------------------------------------------

print("\n=== LOADING FRAUD LABELS ===\n")

with driver.session() as session:

    result = session.run("""

        MATCH (a:Account)-[t:TRANSACTION]->()

        WITH
        a,
        count(
            CASE
            WHEN t.is_laundering = 1
            THEN 1
            END
        ) AS fraud_count

        WHERE fraud_count > 0

        RETURN
        a.id AS id

    """).data()

fraud_ids = {

    r["id"]

    for r in result
}

print(f"Fraud Accounts Found : {len(fraud_ids)}")

# ------------------------------------------------
# CREATE LABEL VECTOR
# ------------------------------------------------

labels = torch.zeros(
    data.num_nodes,
    dtype=torch.long
)

for node_id, idx in data.id2idx.items():

    if node_id in fraud_ids:

        labels[idx] = 1

data.y = labels

print("Labels created successfully")

# ------------------------------------------------
# TRAIN / TEST SPLIT
# ------------------------------------------------

print("\n=== TRAIN / TEST SPLIT ===\n")

num_nodes = data.num_nodes

perm = torch.randperm(num_nodes)

train_size = int(
    0.8 * num_nodes
)

data.train_mask = torch.zeros(
    num_nodes,
    dtype=torch.bool
)

data.test_mask = torch.zeros(
    num_nodes,
    dtype=torch.bool
)

data.train_mask[
    perm[:train_size]
] = True

data.test_mask[
    perm[train_size:]
] = True

print(f"Training Nodes : {train_size}")
print(f"Testing Nodes  : {num_nodes - train_size}")

# ------------------------------------------------
# GRAPH SAGE MODEL
# ------------------------------------------------

class GraphSAGE(torch.nn.Module):

    def __init__(
        self,
        in_channels,
        hidden_channels=128,
        out_channels=2
    ):

        super().__init__()

        self.conv1 = SAGEConv(
            in_channels,
            hidden_channels
        )

        self.conv2 = SAGEConv(
            hidden_channels,
            hidden_channels
        )

        self.conv3 = SAGEConv(
            hidden_channels,
            out_channels
        )

    def forward(
        self,
        x,
        edge_index
    ):

        x = self.conv1(
            x,
            edge_index
        )

        x = F.relu(x)

        x = F.dropout(
            x,
            p=0.3,
            training=self.training
        )

        x = self.conv2(
            x,
            edge_index
        )

        x = F.relu(x)

        x = F.dropout(
            x,
            p=0.3,
            training=self.training
        )

        x = self.conv3(
            x,
            edge_index
        )

        return x

# ------------------------------------------------
# INITIALIZE MODEL
# ------------------------------------------------

print("\n=== INITIALIZING MODEL ===\n")

model = GraphSAGE(
    in_channels=embeddings.shape[1]
)

optimizer = torch.optim.Adam(
    model.parameters(),
    lr=0.003,
    weight_decay=5e-4
)

# Strong fraud balancing

class_weights = torch.tensor([
    1.0,
    400.0
])

criterion = torch.nn.CrossEntropyLoss(
    weight=class_weights
)

print(model)

# ------------------------------------------------
# TRAIN MODEL
# ------------------------------------------------

print("\n=== TRAINING GRAPH SAGE ===\n")

model.train()

for epoch in range(15000):

    optimizer.zero_grad()

    out = model(
        data.x,
        data.edge_index
    )

    loss = criterion(

        out[data.train_mask],

        data.y[data.train_mask]
    )

    loss.backward()

    optimizer.step()

    if epoch % 100 == 0:

        print(
            f"Epoch {epoch:03d} | Loss = {loss.item():.4f}"
        )

print("\nTraining complete")

# ------------------------------------------------
# EVALUATION
# ------------------------------------------------

print("\n=== MODEL EVALUATION ===\n")

model.eval()

with torch.no_grad():

    logits = model(
        data.x,
        data.edge_index
    )

    probabilities = torch.softmax(
        logits,
        dim=1
    )[:,1]

    # LOWER THRESHOLD
    # More sensitive fraud detection

    predictions = (
        probabilities > 0.10
    ).long()

    y_true = data.y[
        data.test_mask
    ].cpu().numpy()

    y_pred = predictions[
        data.test_mask
    ].cpu().numpy()

    precision = precision_score(
        y_true,
        y_pred,
        zero_division=0
    )

    recall = recall_score(
        y_true,
        y_pred,
        zero_division=0
    )

    f1 = f1_score(
        y_true,
        y_pred,
        zero_division=0
    )

    cm = confusion_matrix(
        y_true,
        y_pred
    )

    print("=" * 50)

    print(f"Precision : {precision:.4f}")
    print(f"Recall    : {recall:.4f}")
    print(f"F1 Score  : {f1:.4f}")

    print("=" * 50)

    print("\nConfusion Matrix:\n")

    print(cm)

    print("\nFraud Predictions Count:\n")

    print(
        (y_pred == 1).sum()
    )

# ------------------------------------------------
# SAVE MODEL
# ------------------------------------------------

torch.save(
    model.state_dict(),
    "ml/sage_model.pt"
)

print("\nModel saved successfully")

# ------------------------------------------------
# COMPUTE FRAUD PROBABILITIES
# ------------------------------------------------

print("\n=== COMPUTING FRAUD PROBABILITIES ===\n")

probabilities = probabilities.detach().numpy()

idx2id = {

    v: k

    for k, v

    in data.id2idx.items()
}

batch = [

    {
        "id": idx2id[i],
        "prob": float(probabilities[i])
    }

    for i in range(len(probabilities))
]

# ------------------------------------------------
# WRITE TO NEO4J
# ------------------------------------------------

print("\n=== WRITING fraud_prob TO NEO4J ===\n")

with driver.session() as session:

    total = len(batch)

    for i in range(0, total, 500):

        session.run("""

            UNWIND $rows AS row

            MATCH
            (a:Account {id: row.id})

            SET
            a.fraud_prob = row.prob

        """, rows=batch[i:i+500])

        if i % 5000 == 0:

            print(
                f"Written {min(i+500, total)} / {total}"
            )

print("\n=== SUCCESS ===")

driver.close()