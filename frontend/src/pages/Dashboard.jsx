// frontend/src/pages/Dashboard.jsx
import { useEffect, useState } from "react";
import { getStats } from "../utils/api";
import RiskTable from "../components/RiskTable";
import GraphVisualiser from "../components/GraphVisualiser";

export default function Dashboard() {
  const [stats, setStats]     = useState(null);
  const [accountId, setAccountId] = useState("");
  const [query, setQuery]     = useState("");

  useEffect(() => {
    getStats().then(r => setStats(r.data)).catch(() => {});
  }, []);

  const StatCard = ({ label, value, color }) => (
    <div style={{
      background: "#1e293b", borderRadius: 10, padding: "20px 24px",
      flex: 1, minWidth: 160, border: `1px solid ${color}22`,
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value?.toLocaleString() ?? "—"}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ color: "#f8fafc", marginBottom: 20 }}>Investigation Dashboard</h2>

      {stats && (
        <div style={{ display: "flex", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
          <StatCard label="Total Accounts"       value={stats.total_accounts}       color="#38bdf8" />
          <StatCard label="Total Transactions"   value={stats.total_transactions}   color="#818cf8" />
          <StatCard label="High-Risk Accounts"   value={stats.high_fraud_accounts}  color="#f59e0b" />
          <StatCard label="Fraud Rings Detected" value={stats.fraud_rings_detected} color="#ef4444" />
        </div>
      )}

      <h3 style={{ color: "#f8fafc", marginBottom: 12 }}>Top Risk Accounts</h3>
      <RiskTable />

      <h3 style={{ color: "#f8fafc", margin: "32px 0 12px" }}>Account Subgraph Explorer</h3>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Enter account ID…"
          style={{
            flex: 1, padding: "8px 12px", borderRadius: 6,
            border: "1px solid #334155", background: "#1e293b",
            color: "#f8fafc", fontSize: 13,
          }}
          onKeyDown={e => e.key === "Enter" && setAccountId(query)}
        />
        <button
          onClick={() => setAccountId(query)}
          style={{
            padding: "8px 18px", background: "#1d4ed8", color: "#fff",
            border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600,
          }}>
          Explore
        </button>
      </div>
      <GraphVisualiser accountId={accountId} />
    </div>
  );
}
