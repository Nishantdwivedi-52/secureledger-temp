import torch
import numpy as np
from torch_geometric.nn import Node2Vec
from torch_geometric.data import Data
from tqdm import tqdm

def train_node2vec(data: Data,
                   dim=64,
                   walk_len=20,
                   num_walks=10,
                   epochs=5):

    # CHECK GPU
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

    print("Using device:", device)

    # move edge_index to device
    edge_index = data.edge_index.to(device)

    model = Node2Vec(
        edge_index,
        embedding_dim=dim,
        walk_length=walk_len,
        context_size=10,
        walks_per_node=num_walks,
        num_negative_samples=1,
        sparse=True,
    ).to(device)

    loader = model.loader(batch_size=128, shuffle=True)

    optimizer = torch.optim.SparseAdam(model.parameters(), lr=0.01)

    model.train()

    for epoch in range(epochs):

        total_loss = 0

        pbar = tqdm(loader, desc=f'Epoch {epoch+1}/{epochs}')

        for pos_rw, neg_rw in pbar:

            # MOVE RANDOM WALKS TO GPU
            pos_rw = pos_rw.to(device)
            neg_rw = neg_rw.to(device)

            optimizer.zero_grad()

            loss = model.loss(pos_rw, neg_rw)

            loss.backward()

            optimizer.step()

            total_loss += loss.item()

            pbar.set_postfix({
                'batch_loss': f'{loss.item():.4f}'
            })

        print(f'-> Epoch {epoch+1} completed. '
              f'Total Loss: {total_loss:.4f}\n')

    embeddings = model().detach().cpu().numpy()

    np.save('ml/embeddings.npy', embeddings)

    print(f'Saved embeddings: {embeddings.shape}')

    return embeddings


if __name__ == '__main__':

    data = torch.load('ml/graph.pt', weights_only=False)

    train_node2vec(data)