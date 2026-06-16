import time
from neo4j import GraphDatabase

URI = "neo4j://localhost:7687"
AUTH = ("neo4j", "password") # Default placeholder, will use connection logic from graph_queries

import sys
import os

# Ensure we can import from the graph module
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from graph.graph_queries import _session

def test_connection():
    try:
        with _session() as session:
            result = session.run("RETURN 1")
            return result.single()[0] == 1
    except Exception as e:
        print(f"Connection failed: {e}")
        return False

if __name__ == "__main__":
    if test_connection():
        print("Neo4j is online.")
    else:
        print("Neo4j is offline. Cannot run empirical test.")
