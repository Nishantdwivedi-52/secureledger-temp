// frontend/src/components/RingCard.jsx
import { useState } from "react";
import { getEvidence } from "../utils/api";

const PATTERN_COLORS = {
  "Circular Fund Flow":   "#ef4444",
  "Mule Account Network": "#f59e0b",
  "Currency Layering":    "#8b5cf6",
  "Dormant Activation":   "#06b6d4",
};

export default function RingCard({ ring }) {
  const [str, setStr]         = useState(null);
  const [loading, setLoading] = useState(false);

  const downloadSTR = async () => {
    setLoading(true);
    const r = await getEvidence(ring.ring_id);
    const blob = new Blob([r.data.str_report], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${ring.ring_id}_STR.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setLoading(false);
  };

  return (
    <div style={{
      background: "#1e293b", border: "1px solid #334155", borderRadius: 10,
      padding: 20, marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: "#f8fafc" }}>{ring.ring_id}</span>
        <span style={{ fontSize: 12, color: "#64748b" }}>{ring.node_count} accounts</span>
      </div>

      {/* Patterns */}
      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ring.patterns.map(p => (
          <span key={p} style={{
            background: PATTERN_COLORS[p] || "#475569",
            color: "#fff", fontSize: 11, fontWeight: 600,
            padding: "2px 8px", borderRadius: 4,
          }}>{p}</span>
        ))}
      </div>

      {/* Mastermind */}
      <div style={{ marginTop: 12, padding: "10px 14px", background: "#0f172a",
                    borderRadius: 6, border: "1px solid #7c3aed" }}>
        <div style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600, marginBottom: 4 }}>
          MASTERMIND ACCOUNT
        </div>
        <div style={{ fontFamily: "monospace", color: "#c4b5fd", fontSize: 13 }}>
          {ring.mastermind}
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
          score: {ring.mastermind_score.toFixed(4)}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 24, marginTop: 12, fontSize: 12, color: "#94a3b8" }}>
        <span>💰 ${ring.total_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        <span>🕐 {ring.time_window}</span>
      </div>

      {/* STR download */}
      <button
        onClick={downloadSTR}
        disabled={loading}
        style={{
          marginTop: 14, padding: "7px 16px", borderRadius: 6, border: "none",
          background: loading ? "#334155" : "#1d4ed8", color: "#fff",
          cursor: loading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600,
        }}>
        {loading ? "Generating…" : "⬇ Download STR"}
      </button>
    </div>
  );
}
