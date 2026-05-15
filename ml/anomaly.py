# ml/anomaly.py
import numpy as np
import torch
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import MinMaxScaler
from neo4j import GraphDatabase
from tqdm import tqdm  # <-- Import added here

def compute_anomaly_scores(embeddings_path='ml/embeddings.npy'):
    print("Computing anomaly scores with Isolation Forest (this takes a few seconds)...")
    emb = np.load(embeddings_path)
    model = IsolationForest(n_estimators=200, contamination=0.01, random_state=42)
    model.fit(emb)
    raw = model.score_samples(emb)
    scores = MinMaxScaler().fit_transform((-raw).reshape(-1, 1)).flatten()
    np.save('ml/anomaly_scores.npy', scores)
    print(f'Scores computed. Min={scores.min():.3f} Max={scores.max():.3f}\n')
    return scores

def write_scores_to_neo4j(scores, data):
    driver = GraphDatabase.driver('bolt://localhost:7687', auth=('neo4j','secureledger123'))
    idx2id = {v: k for k, v in data.id2idx.items()}
    batch = [{'id': idx2id[i], 'score': float(scores[i])} for i in range(len(scores))]

    with driver.session() as s:
        # Wrap the range in tqdm to show the live progress bar!
        for i in tqdm(range(0, len(batch), 500), desc="Writing Scores to Neo4j", unit="batch"):
            s.run('''
                UNWIND $rows AS row
                MATCH (a:Account {id: row.id})
                SET a.anomaly_score = row.score
            ''', rows=batch[i:i+500])
            
    print('\nScores successfully written to Neo4j')
    driver.close()

if __name__ == '__main__':
    scores = compute_anomaly_scores()
    data = torch.load('ml/graph.pt', weights_only=False)
    write_scores_to_neo4j(scores, data)