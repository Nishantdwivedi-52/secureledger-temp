/**
 * Investigator.jsx
 * ----------------
 * Deep-dive fraud intelligence page.
 */

import { useEffect, useState } from "react";
import { api } from "../api";
import Timeline            from "../components/Timeline";
import RingGraph           from "../components/RingGraph";
import LiveAlertBanner     from "../components/LiveAlertBanner";
import ExplainabilityPanel from "../components/ExplainabilityPanel";
import Navbar              from "../components/Navbar";

// ─── small helpers ─────────────────────────────────────────────────────────────

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid #1e293b",
      borderRadius: 16,
      padding: "24px 28px",
      boxShadow: "0 0 25px rgba(168,85,247,0.06)",
    }}>
      <div style={{ color: "#64748b", fontSize: 14, marginBottom: 12 }}>{label}</div>
      <div style={{ fontSize: 44, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function Investigator() {
  const [stats,          setStats]       = useState({});
  const [masterminds, setMasterminds] = useState([]);
  const [timelineData,setTimelineData]= useState([]);
  const [activeRingId,setActiveRingId]= useState(null);
  const [explainTarget, setExplainTarget] = useState(null);

  // ── API calls ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const config = { headers: { "ngrok-skip-browser-warning": "true" } };

    // Fetching stats and masterminds from the configured API
    api.get('/api/rings/stats', config)
      .then(r => setStats(r.data || {}))
      .catch(err => console.error("Stats fetch error:", err));

    api.get('/api/masterminds', config)
      .then(r => setMasterminds(r.data || []))
      .catch(err => console.error("Masterminds fetch error:", err));
  }, []);

  const downloadReport = async (ringId) => {
    try {
      const r = await api.get(`/api/report/${ringId}`, { 
        headers: { "ngrok-skip-browser-warning": "true" } 
      });
      const txt = typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 2);
      const a   = Object.assign(document.createElement("a"), {
        href:     URL.createObjectURL(new Blob([txt], { type: "text/plain" })),
        download: `${ringId}_STR_Report.txt`,
      });
      a.click();
    } catch (e) { console.error("Report download failed:", e); }
  };

  const loadTimeline = async (ringId) => {
    try {
      setActiveRingId(ringId);
      const r = await api.get(`/api/timeline/${ringId}`, { 
        headers: { "ngrok-skip-browser-warning": "true" } 
      });
      setTimelineData(r.data || []);
    } catch (e) { console.error("Timeline load failed:", e); }
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#000,#050816,#0b1120)", color: "white" }}>
      <Navbar />
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "40px 24px" }}>
        
        {/* Header and Stats */}
        <div style={{ marginBottom: 40 }}>
           <h1 style={{ fontSize: 52, fontWeight: 900, background: "linear-gradient(90deg,#a855f7,#ec4899,#ef4444)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            SecureLedger AI
           </h1>
        </div>

        <LiveAlertBanner />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20, marginBottom: 40 }}>
          <StatCard label="Fraud Rings"         value={stats.total_rings ?? 0}         color="#f87171" />
          
          {/* FIXED: Uses the length of the table data as a bulletproof fallback */}
          <StatCard label="Masterminds"         value={stats.total_masterminds ?? stats.masterminds ?? masterminds.length ?? 0} color="#c084fc" />
          
          <StatCard label="Suspicious Accounts" value={stats.suspicious_accounts ?? 0} color="#fb923c" />
          <StatCard label="Avg Ring Size"       value={stats.avg_ring_size ? Number(stats.avg_ring_size).toFixed(1) : "—"} color="#34d399" />
        </div>

        {/* Masterminds Table */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #1e293b", borderRadius: 20, padding: "28px 32px", marginBottom: 40 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 24 }}>👑 Top Masterminds</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e293b" }}>
                {["Account", "Ring", "Score", "Prob", "Members", "Actions"].map(h => (
                  <th key={h} style={{ textAlign: "left", fontSize: 11, color: "#475569" }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {masterminds.map((m, idx) => (
                <tr key={idx} onClick={() => setExplainTarget(m)} style={{ cursor: "pointer", borderBottom: "1px solid #0f172a" }}>
                  <td style={{ padding: "16px 0", fontFamily: "monospace", color: "#94a3b8" }}>{m.id?.slice(0, 14)}…</td>
                  <td style={{ padding: "16px 0" }}><span style={{ background: "#1e1b4b", color: "#a78bfa", padding: "2px 10px", borderRadius: 9999 }}>{m.ring_id}</span></td>
                  <td style={{ padding: "16px 0" }}>{(m.mastermind_score ?? 0).toFixed(3)}</td>
                  <td style={{ padding: "16px 0" }}>{((m.fraud_prob ?? 0) * 100).toFixed(1)}%</td>
                  <td style={{ padding: "16px 0" }}>{m.member_count ?? "—"}</td>
                  <td style={{ padding: "16px 0" }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => downloadReport(m.ring_id)} style={{ marginRight: 8 }}>📄 STR</button>
                    <button onClick={() => loadTimeline(m.ring_id)}>⏱ Timeline</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Ring Graph Section */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 20, padding: "24px", marginBottom: 40 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 16 }}>🕸 Fraud Ring Network</h2>
          <RingGraph />
        </div>

        {/* Timeline Section */}
        {timelineData.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>⏱ Transaction Timeline — {activeRingId}</h2>
            <Timeline transactions={timelineData} />
          </div>
        )}
      </div>

      {explainTarget && (
        <ExplainabilityPanel mastermind={explainTarget} onClose={() => setExplainTarget(null)} />
      )}
    </div>
  );
}