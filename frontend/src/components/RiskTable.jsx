// frontend/src/components/RiskTable.jsx
import { useEffect, useState } from "react";
import { getTopRisk } from "../utils/api";

const badge = (score) => {
  if (score > 0.7) return { label: "HIGH",   bg: "#ef4444" };
  if (score > 0.4) return { label: "MEDIUM", bg: "#f59e0b" };
  return               { label: "LOW",    bg: "#22c55e" };
};

export default function RiskTable() {
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTopRisk(50)
      .then(r => setRows(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "#94a3b8" }}>Loading risk table…</p>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#1e293b", color: "#94a3b8" }}>
            {["Account ID", "Bank", "Anomaly Score", "Fraud Prob", "Propagated Risk", "Risk Level"].map(h => (
              <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const b = badge(row.anomaly_score);
            return (
              <tr key={row.id}
                  style={{ background: i % 2 === 0 ? "#0f172a" : "#1e293b",
                           borderBottom: "1px solid #334155" }}>
                <td style={{ padding: "8px 14px", fontFamily: "monospace", color: "#e2e8f0" }}>{row.id}</td>
                <td style={{ padding: "8px 14px", color: "#94a3b8" }}>{row.bank}</td>
                <td style={{ padding: "8px 14px", color: "#f8fafc" }}>{row.anomaly_score.toFixed(4)}</td>
                <td style={{ padding: "8px 14px", color: "#f8fafc" }}>{row.fraud_prob.toFixed(4)}</td>
                <td style={{ padding: "8px 14px", color: "#f8fafc" }}>{row.propagated_risk.toFixed(4)}</td>
                <td style={{ padding: "8px 14px" }}>
                  <span style={{ background: b.bg, color: "#fff", borderRadius: 4,
                                 padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                    {b.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
