"""
ml/run_pipeline.py
One-shot pipeline runner: ingest → embed → anomaly → propagate → GNN → rings.
"""

import subprocess
import sys


STAGES = [
    ("Ingest CSV → NetworkX graph",          "ml/ingest.py"),
    ("Stage A: Node2Vec embeddings",         "ml/node2vec_train.py"),
    ("Stage B: Isolation Forest scoring",    "ml/isolation_forest.py"),
    ("Stage C: Fund Flow Propagation",       "ml/propagation.py"),
    ("Stage D: GraphSAGE fraud probability", "ml/graphsage_train.py"),
    ("Ring detection + typologies",          "ml/patterns.py"),
]


def run() -> None:
    for label, script in STAGES:
        print(f"\n{'='*60}")
        print(f"  {label}")
        print(f"{'='*60}")
        result = subprocess.run([sys.executable, script])
        if result.returncode != 0:
            print(f"\n[ERROR] Stage failed: {script}")
            sys.exit(result.returncode)

    print("\n✓  Full pipeline complete. Run the API with:")
    print("   cd api && uvicorn main:app --reload --port 8000")


if __name__ == "__main__":
    run()
