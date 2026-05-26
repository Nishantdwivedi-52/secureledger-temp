/**
 * Investigator.jsx
 * ----------------
 * Deep-dive fraud intelligence page.
 *
 * New features:
 *  - LiveAlertBanner  — WebSocket real-time transaction alerts
 *  - ExplainabilityPanel — "Why Flagged" modal on mastermind click
 *  - Updated API URLs throughout
 *  - Richer mastermind table with member_count column
 */

import { useEffect, useState } from "react";
import axios from "axios";
import Timeline            from "../components/Timeline";
import RingGraph           from "../components/RingGraph";
import LiveAlertBanner     from "../components/LiveAlertBanner";
import ExplainabilityPanel from "../components/ExplainabilityPanel";
import Navbar              from "../components/Navbar";

const API =
"https://lesser-grandkid-oxymoron.ngrok-free.dev";

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
  const [stats,       setStats]       = useState({ total_rings: 0, masterminds: 0, suspicious_accounts: 0, avg_ring_size: 0 });
  const [masterminds, setMasterminds] = useState([]);
  const [timelineData,setTimelineData]= useState([]);
  const [activeRingId,setActiveRingId]= useState(null);

  // Explainability panel
  const [explainTarget, setExplainTarget] = useState(null);   // mastermind object

  // ── API calls ──────────────────────────────────────────────────────────────
  useEffect(() => {

  axios.get(
    `${API}/api/rings/stats`,
    {
      headers: {
        "ngrok-skip-browser-warning": "true"
      }
    }
  )
    .then(r => setStats(r.data))
    .catch(console.error);

  axios.get(
    `${API}/api/masterminds`,
    {
      headers: {
        "ngrok-skip-browser-warning": "true"
      }
    }
  )
    .then(r => setMasterminds(r.data))
    .catch(console.error);

}, []);

  const downloadReport = async (ringId) => {
    try {
      const r = await fetch(
  `${API}/api/report/${ringId}`,
  {
    headers: {
      "ngrok-skip-browser-warning": "true"
    }
  }
); 
      const txt = await r.text();
      const a   = Object.assign(document.createElement("a"), {
        href:     URL.createObjectURL(new Blob([txt], { type: "text/plain" })),
        download: `${ringId}_STR_Report.txt`,
      });
      a.click();
    } catch (e) { console.error(e); }
  };

  const loadTimeline = async (ringId) => {
    try {
      setActiveRingId(ringId);
      const r = await fetch(
  `${API}/api/timeline/${ringId}`,
  {
    headers: {
      "ngrok-skip-browser-warning": "true"
    }
  }
);
      setTimelineData(await r.json());
    } catch (e) { console.error(e); }
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#000,#050816,#0b1120)", color: "white" }}>
      <Navbar />

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "40px 24px" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{
            fontSize: 52,
            fontWeight: 900,
            background: "linear-gradient(90deg,#a855f7,#ec4899,#ef4444)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: 8,
            lineHeight: 1.1,
          }}>
            SecureLedger AI
          </h1>
          <p style={{ color: "#475569", fontSize: 18 }}>
            Enterprise Fraud Intelligence Dashboard
          </p>
        </div>

        {/* ── LIVE ALERT BANNER (WebSocket) ── */}
        <LiveAlertBanner />

        {/* ── Stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20, marginBottom: 40 }}>
          <StatCard label="Fraud Rings"          value={stats.total_rings}          color="#f87171" />
          <StatCard label="Masterminds"          value={stats.masterminds}          color="#c084fc" />
          <StatCard label="Suspicious Accounts"  value={stats.suspicious_accounts}  color="#fb923c" />
          <StatCard label="Avg Ring Size"        value={stats.avg_ring_size ?? "—"} color="#34d399" />
        </div>

        {/* ── Masterminds table ── */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid #1e293b",
          borderRadius: 20,
          padding: "28px 32px",
          marginBottom: 40,
          boxShadow: "0 0 25px rgba(168,85,247,0.06)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h2 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>
              👑 Top Masterminds
            </h2>
            <span style={{ fontSize: 12, color: "#475569" }}>
              Click a row to see explainability report
            </span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e293b" }}>
                {["Account", "Ring", "Mastermind Score", "Fraud Probability", "Ring Members", "Actions"].map(h => (
                  <th key={h} style={{
                    paddingBottom: 14,
                    textAlign: "left",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#475569",
                    letterSpacing: "0.06em",
                  }}>
                    {h.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {masterminds.map((m, idx) => (
                <tr
                  key={idx}
                  onClick={() => setExplainTarget(m)}
                  style={{
                    borderBottom: "1px solid #0f172a",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(124,58,237,0.08)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  {/* Account */}
                  <td style={{ padding: "16px 0", fontFamily: "monospace", fontSize: 12, color: "#94a3b8" }}>
                    {m.id?.slice(0, 14)}…
                  </td>

                  {/* Ring */}
                  <td style={{ padding: "16px 0" }}>
                    <span style={{
                      background: "#1e1b4b",
                      border: "1px solid #4c1d95",
                      color: "#a78bfa",
                      padding: "2px 10px",
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 600,
                    }}>
                      {m.ring_id}
                    </span>
                  </td>

                  {/* Score */}
                  <td style={{ padding: "16px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ background: "#1e293b", borderRadius: 9999, height: 6, width: 60 }}>
                        <div style={{
                          width: `${Math.min((m.mastermind_score ?? 0) * 100, 100)}%`,
                          height: "100%",
                          background: "#a855f7",
                          borderRadius: 9999,
                        }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>
                        {(m.mastermind_score ?? 0).toFixed(3)}
                      </span>
                    </div>
                  </td>

                  {/* Fraud prob */}
                  <td style={{ padding: "16px 0" }}>
                    <span style={{
                      color: (m.fraud_prob ?? 0) > 0.7 ? "#f87171" : "#fb923c",
                      fontWeight: 700,
                      fontSize: 14,
                    }}>
                      {((m.fraud_prob ?? 0) * 100).toFixed(1)}%
                    </span>
                  </td>

                  {/* Member count */}
                  <td style={{ padding: "16px 0", color: "#64748b", fontSize: 13 }}>
                    {m.member_count ?? "—"}
                  </td>

                  {/* Actions — stop propagation so row click doesn't fire */}
                  <td style={{ padding: "16px 0" }}>
                    <div style={{ display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => downloadReport(m.ring_id)}
                        style={{
                          background: "linear-gradient(135deg,#7c3aed,#db2777)",
                          border: "none",
                          color: "white",
                          padding: "7px 14px",
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        📄 STR
                      </button>
                      <button
                        onClick={() => loadTimeline(m.ring_id)}
                        style={{
                          background: "linear-gradient(135deg,#b45309,#dc2626)",
                          border: "none",
                          color: "white",
                          padding: "7px 14px",
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        ⏱ Timeline
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Ring graph ── */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(168,85,247,0.2)",
          borderRadius: 20,
          padding: "24px",
          marginBottom: 40,
          boxShadow: "0 0 40px rgba(168,85,247,0.1)",
        }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 16 }}>
            🕸 Fraud Ring Network
          </h2>
          <RingGraph />
        </div>

        {/* ── Timeline ── */}
        {timelineData.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
              ⏱ Transaction Timeline — {activeRingId}
            </h2>
            <Timeline transactions={timelineData} />
          </div>
        )}
      </div>

      {/* ── Explainability modal ── */}
      {explainTarget && (
        <ExplainabilityPanel
          mastermind={explainTarget}
          onClose={() => setExplainTarget(null)}
        />
      )}
    </div>
  );
}