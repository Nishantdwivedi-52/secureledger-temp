/**
 * Investigator.jsx
 * ----------------
 * Deep-dive fraud intelligence page.
 * Fully styled for Light Theme (Premium Banking UI).
 */

import { useEffect, useState } from "react";
import { api } from "../api";
import Timeline            from "../components/Timeline";
import RingGraph           from "../components/RingGraph";
import LiveAlertBanner     from "../components/LiveAlertBanner";
import ExplainabilityPanel from "../components/ExplainabilityPanel";
import Navbar              from "../components/Navbar";
import FundFlowTracer      from "../components/FundFlowTracer";

// ─── small helpers ─────────────────────────────────────────────────────────────

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: "#FFFFFF",
      border: "1px solid #E2E8F0",
      borderLeft: `4px solid ${color}`,
      borderRadius: 14,
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      overflow: "hidden"
    }}>
      <div style={{
        padding: "24px",
      }}>
        <div style={{ color: "#64748B", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      </div>
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
  const [flowAccount, setFlowAccount] = useState(null);

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

    // Read URL query params
    const params = new URLSearchParams(window.location.search);
    const acc = params.get("account");
    if (acc) {
      setFlowAccount(acc);
      // set explain target to have dummy info so panel can open if needed
      setExplainTarget({ id: acc, fraud_prob: 0.85, anomaly_score: 0.85 });
    }
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
    <div style={{ minHeight: "100vh", background: "#FFFFFF", color: "#0F172A" }}>
      <Navbar />
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "40px 48px" }}>
        
        {/* Header and Stats */}
        <div style={{ overflow: "visible", marginBottom: 8 }}>
          <h1 style={{
            display: "inline-block",
            fontSize: 42,
            fontWeight: 800,
            background: "linear-gradient(135deg, #01B8AA, #0EA5E9)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            padding: "8px 10px",
            margin: "-8px 0 10px -10px",
            lineHeight: 1.3,
          }}>
            SecureLedger AI
          </h1>
        </div>

        <LiveAlertBanner />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20, marginBottom: 48, marginTop: 32 }}>
          <StatCard label="Fraud Rings"         value={stats.total_rings ?? 0}         color="#FD625E" />
          
          {/* FIXED: Uses the length of the table data as a bulletproof fallback */}
          <StatCard label="Masterminds"         value={stats.total_masterminds ?? stats.masterminds ?? masterminds.length ?? 0} color="#8B5CF6" />
          
          <StatCard label="Suspicious Accounts" value={stats.suspicious_accounts ?? 0} color="#F2C80F" />
          <StatCard label="Avg Ring Size"       value={stats.avg_ring_size ? Number(stats.avg_ring_size).toFixed(1) : "—"} color="#01B8AA" />
        </div>

        {/* Masterminds Table */}
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, padding: "28px 32px", marginBottom: 48, boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div style={{ width: 20, height: 20, background: "#F2C80F", borderRadius: "50%" }} />
            <h2 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Top Masterminds</h2>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
                  {["Account", "Ring", "Score", "Prob", "Members", "Actions"].map(h => (
                    <th key={h} style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748B", padding: "14px 20px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {masterminds.map((m, idx) => {
                  const prob = m.fraud_prob ?? 0;
                  const scoreColor = prob > 0.7 ? "#FD625E" : prob > 0.4 ? "#F2C80F" : "#01B8AA";
                  return (
                    <tr 
                      key={idx} 
                      onClick={() => { setExplainTarget(m); setFlowAccount(m.id); }} 
                      style={{ cursor: "pointer", borderBottom: "1px solid #E2E8F0", transition: "background 0.2s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ padding: "18px 20px", fontFamily: "monospace", color: "#0F172A", fontWeight: 600, fontSize: 14 }}>{m.id?.slice(0, 14)}…</td>
                      <td style={{ padding: "18px 20px" }}>
                        <span style={{ background: "#F3E8FF", color: "#8B5CF6", border: "1px solid rgba(139, 92, 246, 0.3)", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                          {m.ring_id}
                        </span>
                      </td>
                      <td style={{ padding: "18px 20px", fontWeight: 700, color: "#0F172A", fontSize: 14 }}>{(m.mastermind_score ?? 0).toFixed(3)}</td>
                      <td style={{ padding: "18px 20px", fontWeight: 700, color: scoreColor, fontSize: 14 }}>{(prob * 100).toFixed(1)}%</td>
                      <td style={{ padding: "18px 20px", color: "#64748B", fontWeight: 500 }}>{m.member_count ?? "—"}</td>
                      <td style={{ padding: "18px 20px", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                        <button 
                          onClick={() => downloadReport(m.ring_id)} 
                          style={{ 
                            marginRight: 10, background: "#FFFFFF", color: "#FD625E", border: "1px solid #FD625E", 
                            padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" 
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = "#FD625E"; e.currentTarget.style.color = "#FFFFFF"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "#FFFFFF"; e.currentTarget.style.color = "#FD625E"; }}
                        >
                          STR
                        </button>
                        <button 
                          onClick={() => loadTimeline(m.ring_id)}
                          style={{ 
                            background: "#FFFFFF", color: "#01B8AA", border: "1px solid #01B8AA", 
                            padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" 
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = "#01B8AA"; e.currentTarget.style.color = "#FFFFFF"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "#FFFFFF"; e.currentTarget.style.color = "#01B8AA"; }}
                        >
                          Timeline
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ring Graph Section */}
        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 16, padding: "28px 32px", marginBottom: 48, boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div style={{ width: 20, height: 20, background: "#8B5CF6", borderRadius: 4 }} />
            <h2 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Fraud Ring Network</h2>
          </div>
          <RingGraph />
        </div>

        {/* Fund Flow Tracer Section */}
        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 16, padding: "28px 32px", marginBottom: 48, boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div style={{ width: 20, height: 20, background: "linear-gradient(135deg, #01B8AA, #0EA5E9)", borderRadius: 4 }} />
            <h2 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Fund Flow Tracer</h2>
            <span style={{
              fontSize: 10, fontWeight: 700, color: "#01B8AA",
              background: "#F0FDFA", border: "1px solid #01B8AA",
              padding: "2px 8px", borderRadius: 6, letterSpacing: "0.05em",
            }}>TEMPORAL BFS</span>
          </div>
          <FundFlowTracer prefilledAccount={flowAccount} />
        </div>

        {/* Timeline Section */}
        {timelineData.length > 0 && (
          <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 16, padding: "28px 32px", marginBottom: 40, boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <div style={{ width: 20, height: 20, background: "#01B8AA", borderRadius: "50%" }} />
              <h2 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Transaction Timeline — {activeRingId}</h2>
            </div>
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