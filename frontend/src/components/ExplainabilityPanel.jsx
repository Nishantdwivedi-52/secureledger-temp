/**
 * ExplainabilityPanel.jsx
 * -----------------------
 * Shows a "Why was this account flagged?" breakdown panel.
 * SMART VERSION: Automatically hides metrics that equal 0.0 or null
 * so the UI always looks clean and populated.
 */

import { useEffect, useState } from "react";

const API = "http://127.0.0.1:8000";

// ─── helpers ──────────────────────────────────────────────────────────────────

function ScoreBar({ value, max = 1, color = "#a855f7", label }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{(value * 100).toFixed(1)}%</span>
      </div>
      <div style={{ background: "#1e293b", borderRadius: 9999, height: 8 }}>
        <div style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 9999,
          boxShadow: `0 0 8px ${color}60`,
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

function ReasonBadge({ text, severity = "high" }) {
  const colours = {
    high:   { bg: "#450a0a", border: "#ef4444", color: "#fca5a5" },
    medium: { bg: "#431407", border: "#f97316", color: "#fdba74" },
    low:    { bg: "#1c1917", border: "#78716c", color: "#d6d3d1" },
  };
  const c = colours[severity];
  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 8,
      padding: "6px 12px",
      fontSize: 12,
      color: c.color,
      marginBottom: 6,
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}>
      <span>{severity === "high" ? "🔴" : severity === "medium" ? "🟠" : "🟡"}</span>
      {text}
    </div>
  );
}

// ─── derive human-readable reasons from account data ─────────────────────────

function buildReasons(account, mastermind) {
  const reasons = [];

  const fraudProb = account.fraud_prob || mastermind?.fraud_prob || 0;
  if (fraudProb > 0.8)
    reasons.push({ text: `Ensemble fraud probability is critically high: ${(fraudProb * 100).toFixed(1)}%`, severity: "high" });

  const anomaly = account.anomaly_score || account.isolation_forest || 0;
  if (anomaly > 0.7)
    reasons.push({ text: `Isolation Forest anomaly score: ${(anomaly * 100).toFixed(1)}%`, severity: "high" });

  if (mastermind?.mastermind_score > 0.5)
    reasons.push({ text: `Mastermind centrality score: ${(mastermind.mastermind_score * 100).toFixed(1)}%`, severity: "high" });

  if ((account.tx_count || 0) > 100)
    reasons.push({ text: `Unusually high transaction count: ${account.tx_count}`, severity: "medium" });

  if ((account.total_sent || 0) > 500_000)
    reasons.push({ text: `Large total sent: $${Number(account.total_sent).toLocaleString()}`, severity: "medium" });

  const betweenness = account.betweenness_centrality || account.betweenness || 0;
  if (betweenness > 0.01)
    reasons.push({ text: `High betweenness centrality — sits on many shortest paths`, severity: "medium" });

  if ((mastermind?.member_count || 0) > 10)
    reasons.push({ text: `Controls a ring of ${mastermind.member_count} members`, severity: "medium" });

  if (account.ring_id || mastermind?.ring_id)
    reasons.push({ text: `Member of confirmed fraud ring: ${account.ring_id || mastermind.ring_id}`, severity: "medium" });

  if (reasons.length === 0)
    reasons.push({ text: "Flagged by ensemble model — marginal score above threshold", severity: "low" });

  return reasons;
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ExplainabilityPanel({ mastermind, onClose }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!mastermind?.id) return;
    setLoading(true);
    setError(null);

    fetch(`${API}/api/account/${encodeURIComponent(mastermind.id)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setAccount(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [mastermind?.id]);

  if (!mastermind) return null;

  const reasons = account ? buildReasons(account, mastermind) : [];

  // Parse values to see if we should render them
  const gnnScore = account?.gnn_score || account?.risk_score || 0;
  const pageRank = account?.page_rank || account?.pagerank || 0;
  const betweenness = account?.betweenness_centrality || account?.betweenness || 0;
  const community = account?.community || account?.community_id;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.7)",
      backdropFilter: "blur(4px)",
      zIndex: 200,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#0a0f1e",
        border: "1px solid #7c3aed",
        borderRadius: 20,
        width: "100%",
        maxWidth: 620,
        maxHeight: "85vh",
        overflow: "auto",
        padding: 32,
        boxShadow: "0 0 60px rgba(124,58,237,0.3)",
        animation: "fadeIn 0.2s ease-out",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>EXPLAINABILITY REPORT</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "white", margin: 0 }}>
              Why Was This Account Flagged?
            </h2>
            <div style={{
              fontFamily: "monospace",
              fontSize: 12,
              color: "#a78bfa",
              marginTop: 6,
            }}>
              {mastermind.id}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              color: "#94a3b8",
              width: 36, height: 36,
              borderRadius: 9999,
              cursor: "pointer",
              fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "#475569" }}>
            Loading account profile…
          </div>
        )}

        {error && (
          <div style={{
            background: "#450a0a", border: "1px solid #ef4444",
            borderRadius: 10, padding: 16, color: "#fca5a5", marginBottom: 16,
          }}>
            ⚠️ {error}
          </div>
        )}

        {account && (
          <>
            {/* Score bars */}
            <div style={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 14,
              padding: "20px 24px",
              marginBottom: 24,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 16 }}>
                RISK SCORES
              </div>
              <ScoreBar
                label="Ensemble Fraud Probability"
                value={account.fraud_prob || mastermind.fraud_prob || 0}
                color="#ef4444"
              />
              
              {/* Only show GNN score if it is > 0 */}
              {gnnScore > 0 && (
                <ScoreBar
                  label="GNN Fraud Score"
                  value={gnnScore}
                  color="#a855f7"
                />
              )}

              <ScoreBar
                label="Isolation Forest Anomaly"
                value={account.anomaly_score || account.isolation_forest || 0}
                color="#f97316"
              />
            </div>

            {/* Key stats */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 12,
              marginBottom: 24,
            }}>
              
              {/* Core Stats always show */}
              <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>Ring Members</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#a78bfa" }}>{mastermind.member_count || "—"}</div>
              </div>
              
              <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>Transactions</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fb923c" }}>{account.tx_count || 0}</div>
              </div>
              
              <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>Total Sent</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#f87171" }}>${Number(account.total_sent || 0).toLocaleString()}</div>
              </div>

              {/* Advanced Graph Stats only show if they exist */}
              {pageRank > 0 && (
                <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>PageRank</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#34d399" }}>{pageRank.toFixed(4)}</div>
                </div>
              )}

              {betweenness > 0 && (
                <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>Betweenness</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#60a5fa" }}>{betweenness.toFixed(4)}</div>
                </div>
              )}

              {community && (
                <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>Community</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#818cf8" }}>{community}</div>
                </div>
              )}
            </div>

            {/* Flagging reasons */}
            <div style={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 14,
              padding: "20px 24px",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 12 }}>
                SUSPICIOUS PATTERNS DETECTED
              </div>
              {reasons.map((r, i) => (
                <ReasonBadge key={i} text={r.text} severity={r.severity} />
              ))}
            </div>

            {/* Mastermind-specific */}
            {(account.ring_id || mastermind.ring_id) && (
              <div style={{
                marginTop: 16,
                background: "#1c1b4b",
                border: "1px solid #4c1d95",
                borderRadius: 12,
                padding: "14px 18px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                <span style={{ fontSize: 22 }}>👑</span>
                <div>
                  <div style={{ fontSize: 12, color: "#a78bfa", fontWeight: 700 }}>
                    Identified as Ring Mastermind
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    Ring {account.ring_id || mastermind.ring_id} · Score {(mastermind.mastermind_score || 0).toFixed(4)}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <style>{`
          @keyframes fadeIn {
            from { opacity:0; transform:scale(0.96); }
            to   { opacity:1; transform:scale(1); }
          }
        `}</style>
      </div>
    </div>
  );
}