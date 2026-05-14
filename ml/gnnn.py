import os

# ------------------------------------------------
# CUDA MEMORY FIX
# ------------------------------------------------

os.environ[
    "PYTORCH_CUDA_ALLOC_CONF"
] = "expandable_segments:True"

import torch
import torch.nn.functional as F
import numpy as np
import time

from torch_geometric.nn import SAGEConv

from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix
)

from sklearn.model_selection import (
    train_test_split
)

from neo4j import GraphDatabase

# ------------------------------------------------
# GPU SETUP
# ------------------------------------------------

device = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)

print(f"\n=== USING DEVICE : {device} ===\n")

if torch.cuda.is_available():

    print(
        f"GPU : {torch.cuda.get_device_name(0)}"
    )

else:

    print("CUDA GPU NOT FOUND")
    print("Training will run on CPU")

torch.cuda.empty_cache()

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

data.x = torch.tensor(
    embeddings,
    dtype=torch.float
)

print(f"Nodes Loaded : {data.num_nodes}")
print(f"Edges Loaded : {data.num_edges}")
print(f"Embedding Shape : {embeddings.shape}")

# ------------------------------------------------
# ADD DEGREE FEATURE
# ------------------------------------------------

degree_feature = torch.bincount(
    data.edge_index[0],
    minlength=data.num_nodes
).float().unsqueeze(1)

degree_feature = (
    degree_feature
    /
    degree_feature.max()
)

data.x = torch.cat(
    [data.x, degree_feature],
    dim=1
)

print(
    f"New Feature Shape : {data.x.shape}"
)

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
# CREATE LABELS
# ------------------------------------------------

labels = torch.zeros(
    data.num_nodes,
    dtype=torch.long
)

for node_id, idx in data.id2idx.items():

    if node_id in fraud_ids:

        labels[idx] = 1

data.y = labels

fraud_count = (
    data.y == 1
).sum().item()

print(f"Total Fraud Nodes : {fraud_count}")

# ------------------------------------------------
# STRATIFIED TRAIN TEST SPLIT
# ------------------------------------------------

print("\n=== STRATIFIED SPLIT ===\n")

num_nodes = data.num_nodes

indices = np.arange(num_nodes)

labels_np = data.y.numpy()

train_idx, test_idx = train_test_split(

    indices,

    test_size=0.2,

    stratify=labels_np,

    random_state=42
)

data.train_mask = torch.zeros(
    num_nodes,
    dtype=torch.bool
)

data.test_mask = torch.zeros(
    num_nodes,
    dtype=torch.bool
)

data.train_mask[train_idx] = True

data.test_mask[test_idx] = True

print(
    f"Training Nodes : {len(train_idx)}"
)

print(
    f"Testing Nodes  : {len(test_idx)}"
)

# ------------------------------------------------
# MOVE DATA TO GPU
# ------------------------------------------------

data = data.to(device)

# ------------------------------------------------
# FOCAL LOSS
# ------------------------------------------------

class FocalLoss(torch.nn.Module):

    def __init__(
        self,
        alpha=5,
        gamma=2
    ):

        super().__init__()

        self.alpha = alpha

        self.gamma = gamma

    def forward(
        self,
        inputs,
        targets
    ):

        ce_loss = F.cross_entropy(
            inputs,
            targets,
            reduction='none'
        )

        pt = torch.exp(-ce_loss)

        focal_loss = (

            self.alpha

            *

            (1 - pt) ** self.gamma

            *

            ce_loss
        )

        return focal_loss.mean()

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
            p=0.2,
            training=self.training
        )

        x = self.conv2(
            x,
            edge_index
        )

        return x

# ------------------------------------------------
# INITIALIZE MODEL
# ------------------------------------------------

print("\n=== INITIALIZING MODEL ===\n")

model = GraphSAGE(
    in_channels=data.x.shape[1]
).to(device)

optimizer = torch.optim.AdamW(
    model.parameters(),
    lr=0.001,
    weight_decay=1e-4
)

criterion = FocalLoss(
    alpha=10,
    gamma=2
)

print(model)

# ------------------------------------------------
# EARLY STOPPING
# ------------------------------------------------

best_f1 = 0

best_threshold = 0.5

patience = 20

patience_counter = 0

best_model_path = "ml/best_sage_model.pt"

# ------------------------------------------------
# TRAINING
# ------------------------------------------------

print("\n=== TRAINING GRAPH SAGE ===\n")

epochs = 300

for epoch in range(epochs):

    start_time = time.time()

    # ---------------- TRAIN ----------------

    model.train()

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

    # ---------------- EVALUATION ----------------

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

        y_true = data.y[
            data.test_mask
        ].cpu().numpy()

        best_epoch_f1 = 0

        best_epoch_precision = 0

        best_epoch_recall = 0

        best_epoch_threshold = 0.5

        # ------------------------------------------------
        # THRESHOLD SEARCH
        # ------------------------------------------------

        for threshold in np.arange(
            0.1,
            0.95,
            0.05
        ):

            predictions = (
                probabilities > threshold
            ).long()

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

            if f1 > best_epoch_f1:

                best_epoch_f1 = f1

                best_epoch_precision = precision

                best_epoch_recall = recall

                best_epoch_threshold = threshold

        # ------------------------------------------------
        # SAVE BEST MODEL
        # ------------------------------------------------

        if best_epoch_f1 > best_f1:

            best_f1 = best_epoch_f1

            best_threshold = best_epoch_threshold

            patience_counter = 0

            torch.save(
                model.state_dict(),
                best_model_path
            )

        else:

            patience_counter += 1

    # ---------------- PRINT ----------------

    if epoch % 5 == 0:

        elapsed = time.time() - start_time

        print(
            f"Epoch {epoch:03d} | "
            f"Loss={loss.item():.4f} | "
            f"Precision={best_epoch_precision:.4f} | "
            f"Recall={best_epoch_recall:.4f} | "
            f"F1={best_epoch_f1:.4f} | "
            f"Threshold={best_epoch_threshold:.2f} | "
            f"BestF1={best_f1:.4f} | "
            f"Time={elapsed:.2f}s"
        )

    # ---------------- EARLY STOPPING ----------------

    if patience_counter >= patience:

        print("\n=== EARLY STOPPING ===")

        break

print("\n=== TRAINING COMPLETE ===")

# ------------------------------------------------
# LOAD BEST MODEL
# ------------------------------------------------

model.load_state_dict(
    torch.load(best_model_path)
)

# ------------------------------------------------
# FINAL EVALUATION
# ------------------------------------------------

print("\n=== FINAL EVALUATION ===\n")

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

    predictions = (
        probabilities > best_threshold
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

print("=" * 60)

print(f"Best Threshold : {best_threshold:.2f}")

print(f"Precision : {precision:.4f}")
print(f"Recall    : {recall:.4f}")
print(f"F1 Score  : {f1:.4f}")

print("=" * 60)

print("\nConfusion Matrix:\n")

print(cm)

print(
    f"\nFraud Predictions Count : {(y_pred == 1).sum()}"
)

# ------------------------------------------------
# SAVE METRICS
# ------------------------------------------------

with open(
    "evaluation_metrics.txt",
    "w"
) as f:

    f.write(
        "=== MODEL EVALUATION ===\n\n"
    )

    f.write(
        f"Best Threshold : {best_threshold:.2f}\n\n"
    )

    f.write(
        f"Precision : {precision:.4f}\n"
    )

    f.write(
        f"Recall    : {recall:.4f}\n"
    )

    f.write(
        f"F1 Score  : {f1:.4f}\n\n"
    )

    f.write(
        "Confusion Matrix:\n"
    )

    f.write(str(cm))

print("\n=== METRICS SAVED ===")

# ------------------------------------------------
# SAVE MODEL
# ------------------------------------------------

torch.save(
    model.state_dict(),
    "ml/sage_model.pt"
)

print("\n=== MODEL SAVED ===")

driver.close()

print("\n=== SUCCESS ===")