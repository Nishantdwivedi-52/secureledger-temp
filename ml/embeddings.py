import torch
import numpy as np
from torch_geometric.nn import Node2Vec
from torch_geometric.data import Data
from tqdm import tqdm  # <-- Add this import at the top!

def train_node2vec(data: Data, dim=64, walk_len=20, num_walks=10, epochs=5):
    model = Node2Vec(
        data.edge_index,
        embedding_dim=dim,
        walk_length=walk_len,
        context_size=10,
        walks_per_node=num_walks,
        num_negative_samples=1,
        sparse=True,
    )
    loader = model.loader(batch_size=128, shuffle=True)
    optimizer = torch.optim.SparseAdam(model.parameters(), lr=0.01)

    model.train()
    for epoch in range(epochs):
        total_loss = 0
        
        # Wrap the loader in tqdm to generate the progress bar!
        pbar = tqdm(loader, desc=f'Epoch {epoch+1}/{epochs}')
        
        for pos_rw, neg_rw in pbar:
            optimizer.zero_grad()
            loss = model.loss(pos_rw, neg_rw)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            
            # This updates the progress bar with the real-time loss
            pbar.set_postfix({'batch_loss': f'{loss.item():.4f}'})
            
        print(f'-> Epoch {epoch+1} completed. Total Loss: {total_loss:.4f}\n')

    embeddings = model().detach().cpu().numpy()
    np.save('ml/embeddings.npy', embeddings)
    print(f'Saved embeddings: {embeddings.shape}')
    return embeddings

if __name__ == '__main__':
    data = torch.load('ml/graph.pt', weights_only=False)
    train_node2vec(data)