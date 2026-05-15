import torch
import torch.nn.functional as F
import numpy as np
from neo4j import GraphDatabase
from torch_geometric.nn import SAGEConv

# 1. Match the exact model structure from gnnn.py
class GraphSAGE(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels=128, out_channels=2):
        super().__init__()
        self.conv1 = SAGEConv(in_channels, hidden_channels)
        self.conv2 = SAGEConv(hidden_channels, out_channels)

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, p=0.2, training=self.training)
        return self.conv2(x, edge_index)

print("\n=== LOADING DATA AND MODEL WEIGHTS ===")
data = torch.load("ml/graph.pt", weights_only=False)
embeddings = np.load("ml/embeddings.npy")
data.x = torch.tensor(embeddings, dtype=torch.float)

# Add the structural degree feature exactly like gnnn.py
degree_feature = torch.bincount(data.edge_index[0], minlength=data.num_nodes).float().unsqueeze(1)
degree_feature = degree_feature / degree_feature.max()
data.x = torch.cat([data.x, degree_feature], dim=1)

# Load the best trained weights saved from your previous run
model = GraphSAGE(in_channels=data.x.shape[1])
model.load_state_dict(torch.load("ml/best_sage_model.pt", map_location="cpu"))
model.eval()

print("\n=== GENERATING FRAUD PROBABILITIES ===")
with torch.no_grad():
    logits = model(data.x, data.edge_index)
    probabilities = torch.softmax(logits, dim=1)[:, 1].numpy()

print("\n=== WRITING SCORES TO NEO4J DATABASE ===")
driver = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "secureledger123"))
idx2id = {v: k for k, v in data.id2idx.items()}
batch = [{"id": idx2id[i], "prob": float(probabilities[i])} for i in range(len(probabilities))]

with driver.session() as session:
    for i in range(0, len(batch), 1000):
        session.run("""
            UNWIND $rows AS row
            MATCH (a:Account {id: row.id})
            SET a.fraud_prob = row.prob
        """, rows=batch[i:i+1000])

driver.close()
print("\n=== SUCCESS: fraud_prob property is now live in Neo4j! ===")