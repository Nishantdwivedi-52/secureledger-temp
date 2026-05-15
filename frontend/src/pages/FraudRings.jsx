// frontend/src/pages/FraudRings.jsx
import { useEffect, useState } from "react";
import { getRings } from "../utils/api";
import RingCard from "../components/RingCard";

export default function FraudRings() {
  const [rings, setRings]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRings().then(r => setRings(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "#94a3b8", padding: 24 }}>Loading fraud rings…</p>;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ color: "#f8fafc", marginBottom: 6 }}>Fraud Rings</h2>
      <p style={{ color: "#64748b", marginBottom: 24, fontSize: 13 }}>
        {rings.length} suspicious ring{rings.length !== 1 ? "s" : ""} detected via Louvain community detection.
        Mastermind ranked by 0.5 × PageRank + 0.5 × Betweenness Centrality.
      </p>
      {rings.length === 0 && (
        <p style={{ color: "#94a3b8" }}>No rings detected. Run the full ML pipeline first.</p>
      )}
      {rings.map(ring => <RingCard key={ring.ring_id} ring={ring} />)}
    </div>
  );
}
