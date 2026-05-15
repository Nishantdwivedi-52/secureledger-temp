# run_pipeline.py
import sys
import time
import torch
import numpy as np

def step(name, fn):
    print(f'\n[{name}] Starting...')
    t = time.time()
    fn()
    print(f'[{name}] Done in {time.time()-t:.1f}s')

def main():
    from ingestion.ingest import run as ingest
    from ml.build_pyg_graph import run as build_graph
    from ml.embeddings import train_node2vec
    from ml.anomaly import compute_anomaly_scores, write_scores_to_neo4j
    from ml.propagation import propagate
    
    from ml.gnnn import train_gnn 
    from ml.ring_detection import run_ring_detection
    from ml.evidence import generate_all_evidence

    step('1. Ingest CSV',       ingest)
    step('2. Build PyG graph',  build_graph)
    step('3. Train Node2Vec',   lambda: train_node2vec(torch.load('ml/graph.pt')))
    step('4. Anomaly scores',   compute_anomaly_scores)
    step('5. Write scores',     lambda: write_scores_to_neo4j(np.load('ml/anomaly_scores.npy'), torch.load('ml/graph.pt')))
    step('6. Propagation',      propagate)
    step('7. Train GraphSAGE',  train_gnn)
    step('8. Detect rings',     run_ring_detection)
    step('9. Gen evidence',     generate_all_evidence)

    print('\nPipeline complete. Start API: uvicorn api.main:app --reload')

if __name__ == '__main__':
    main()