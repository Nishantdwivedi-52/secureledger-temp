import { useEffect, useState } from "react";
import axios from "axios";
import Navbar from "../components/Navbar";

export default function FraudRings() {
  const [rings, setRings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hits your active Uvicorn backend to load real Louvain communities
    axios.get("http://127.0.0.1:8000/api/rings")
      .then((res) => {
        setRings(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error pulling live fraud rings:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <Navbar />

      <div style={{ padding: "30px" }}>
        <h1>Fraud Rings</h1>

        {loading ? (
          <p>Analyzing local graph network and loading rings...</p>
        ) : (
          <table border="1" cellPadding="10" style={{ borderCollapse: "collapse", color: "white" }}>
            <thead>
              <tr>
                <th>Ring ID</th>
                <th>Members</th>
                <th>Mastermind</th>
              </tr>
            </thead>

            <tbody>
              {rings.length === 0 ? (
                <tr>
                  <td colSpan="3" style={{ textAlign: "center" }}>No active fraud networks identified.</td>
                </tr>
              ) : (
                rings.map((ring) => (
                  <tr key={ring.ring_id}>
                    <td>{ring.ring_id}</td>
                    <td>{ring.nodes ? ring.nodes.length : 0}</td>
                    <td style={{ fontFamily: "monospace" }}>{ring.mastermind}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}