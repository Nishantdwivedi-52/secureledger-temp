/**
 * ExplainabilityPanel.jsx
 * -----------------------
 * Shows a "Why was this account flagged?" breakdown panel.
 * Fully styled for Light Theme.
 */

import { useEffect, useState } from "react";

const API = "http://127.0.0.1:8000";

// ─── helpers ──────────────────────────────────────────────────────────────────

function ScoreBar({ value, max = 1, color = "#8B5CF6", label }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#64748B" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{(value * 100).toFixed(1)}%</span>
      </div>
      <div style={{ background: "#E2E8F0", borderRadius: 9999, height: 8, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 9999,
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

function ReasonBadge({ text, severity = "high" }) {
  const styles = {
    high:   { bg: "#FFF5F5", border: "#FD625E", color: "#FD625E", dot: "#FD625E" },
    medium: { bg: "#FFFBEB", border: "#F2C80F", color: "#D97706", dot: "#F2C80F" },
    low:    { bg: "#F0FDF9", border: "#01B8AA", color: "#01B8AA", dot: "#01B8AA" },
  };
  const s = styles[severity];
  return (
    <div style={{
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderRadius: 8,
      padding: "8px 14px",
      fontSize: 13,
      fontWeight: 600,
      color: s.color,
      marginBottom: 8,
      display: "flex",
      alignItems: "center",
      gap: 10,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot }} />
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

  const gnnScore = account?.gnn_score || account?.risk_score || 0;
  const pageRank = account?.page_rank || account?.pagerank || 0;
  const betweenness = account?.betweenness_centrality || account?.betweenness || 0;
  const community = account?.community || account?.community_id;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.4)", // Slate-900 with opacity
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
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: 20,
        width: "100%",
        maxWidth: 640,
        maxHeight: "85vh",
        overflow: "auto",
        padding: "32px 40px",
        boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
        animation: "fadeIn 0.2s ease-out",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>EXPLAINABILITY REPORT</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>
              Why Was This Account Flagged?
            </h2>
            <div style={{
              fontFamily: "monospace",
              fontSize: 14,
              color: "#64748B",
              marginTop: 6,
              fontWeight: 500
            }}>
              {mastermind.id}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "#F8FAFC",
              border: "1px solid #E2E8F0",
              color: "#64748B",
              width: 36, height: 36,
              borderRadius: "50%",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s"
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#E2E8F0"; e.currentTarget.style.color = "#0F172A"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#F8FAFC"; e.currentTarget.style.color = "#64748B"; }}
          >
            ✕
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 60, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{
              border: "3px solid #E2E8F0",
              borderTop: "3px solid #01B8AA",
              borderRadius: "50%",
              width: 32, height: 32,
              animation: "spin 1s linear infinite",
              marginBottom: 16
            }} />
            <div style={{ color: "#64748B", fontSize: 14, fontWeight: 500 }}>
              Loading profile data...
            </div>
          </div>
        )}

        {error && (
          <div style={{
            background: "#FFF5F5", border: "1px solid #FD625E",
            borderRadius: 12, padding: "16px 20px", color: "#FD625E", marginBottom: 20,
            fontWeight: 600, fontSize: 14
          }}>
            System Error: {error}
          </div>
        )}

        {account && (
          <>
            {/* Score bars */}
            <div style={{
              background: "#F8FAFC",
              border: "1px solid #E2E8F0",
              borderRadius: 14,
              padding: "24px",
              marginBottom: 24,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", letterSpacing: "0.05em", marginBottom: 16 }}>
                RISK SCORES
              </div>
              <ScoreBar
                label="Ensemble Fraud Probability"
                value={account.fraud_prob || mastermind.fraud_prob || 0}
                color="#FD625E"
              />
              
              {gnnScore > 0 && (
                <ScoreBar
                  label="GNN Fraud Score"
                  value={gnnScore}
                  color="#8B5CF6"
                />
              )}

              <ScoreBar
                label="Isolation Forest Anomaly"
                value={account.anomaly_score || account.isolation_forest || 0}
                color="#F2C80F"
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
              <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Ring Members</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#8B5CF6" }}>{mastermind.member_count || "—"}</div>
              </div>
              
              <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Transactions</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#F2C80F" }}>{account.tx_count || 0}</div>
              </div>
              
              <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Total Sent</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#FD625E" }}>${Number(account.total_sent || 0).toLocaleString()}</div>
              </div>

              {/* Advanced Graph Stats */}
              {pageRank > 0 && (
                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 20px" }}>
                  <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>PageRank</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#01B8AA" }}>{pageRank.toFixed(4)}</div>
                </div>
              )}

              {betweenness > 0 && (
                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 20px" }}>
                  <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Betweenness</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0EA5E9" }}>{betweenness.toFixed(4)}</div>
                </div>
              )}

              {community && (
                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 20px" }}>
                  <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Community</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>{community}</div>
                </div>
              )}
            </div>

            {/* Flagging reasons */}
            <div style={{
              background: "#F8FAFC",
              border: "1px solid #E2E8F0",
              borderRadius: 14,
              padding: "24px",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", letterSpacing: "0.05em", marginBottom: 16 }}>
                SUSPICIOUS PATTERNS DETECTED
              </div>
              {reasons.map((r, i) => (
                <ReasonBadge key={i} text={r.text} severity={r.severity} />
              ))}
            </div>

            {/* Mastermind-specific */}
            {(account.ring_id || mastermind.ring_id) && (
              <div style={{
                marginTop: 20,
                background: "#F8FAFC",
                border: "1px solid #E2E8F0",
                borderRadius: 14,
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}>
                <div style={{ width: 24, height: 24, background: "#F2C80F", borderRadius: "50%", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, color: "#0F172A", fontWeight: 800 }}>
                    Identified as Ring Mastermind
                  </div>
                  <div style={{ fontSize: 13, color: "#64748B", marginTop: 4, fontWeight: 500 }}>
                    Ring {account.ring_id || mastermind.ring_id} · Score {(mastermind.mastermind_score || 0).toFixed(4)}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <style>{`
          @keyframes fadeIn {
            from { opacity:0; transform:scale(0.96) translateY(10px); }
            to   { opacity:1; transform:scale(1) translateY(0); }
          }
          @keyframes spin {
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}