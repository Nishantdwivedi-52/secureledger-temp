/**
 * FundFlowTracer.jsx
 * ------------------
 * Path-first money-flow tracing component.
 * Displays temporally-ordered fund flow paths with risk ranking.
 *
 * Light Theme — Premium Banking UI.
 */

import { useState, useRef, useEffect } from "react";
import { api } from "../api";

// ─── colour helpers ─────────────────────────────────────────────────────────────

function probColor(fp) {
  if (fp > 0.8) return "#FD625E";
  if (fp > 0.6) return "#F97316";
  if (fp > 0.4) return "#F2C80F";
  return "#01B8AA";
}

function riskBadge(score) {
  if (score >= 1.0) return { bg: "#FFF5F5", color: "#FD625E", border: "#FD625E", label: "CRITICAL" };
  if (score >= 0.7) return { bg: "#FFFBEB", color: "#D97706", border: "#F2C80F", label: "HIGH" };
  if (score >= 0.4) return { bg: "#F0FAFF", color: "#0284C7", border: "#8AD4EB", label: "MEDIUM" };
  return { bg: "#F0FDF9", color: "#01B8AA", border: "#01B8AA", label: "LOW" };
}

function formatAmount(amt) {
  if (amt >= 1_000_000) return `$${(amt / 1_000_000).toFixed(1)}M`;
  if (amt >= 1_000) return `$${(amt / 1_000).toFixed(1)}K`;
  return `$${amt.toFixed(2)}`;
}

function formatTimestamp(ts) {
  if (!ts) return "—";
  // Show time portion only for compactness
  const parts = ts.replace("T", " ").split(" ");
  if (parts.length >= 2) return parts[1].slice(0, 8);
  return ts.slice(0, 19);
}

// ─── Node pill component ────────────────────────────────────────────────────────

function NodePill({ node, isFirst, isLast }) {
  const fp = node.fraud_prob ?? 0;
  const color = probColor(fp);
  const truncId = (node.account || "?").length > 10
    ? (node.account.slice(0, 6) + "…" + node.account.slice(-4))
    : node.account;

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      minWidth: 90, position: "relative",
    }}>
      {/* Mastermind crown */}
      {node.is_mastermind && (
        <div style={{
          fontSize: 14, marginBottom: 2, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))",
        }}>👑</div>
      )}

      {/* Node circle */}
      <div style={{
        width: 44, height: 44, borderRadius: "50%",
        background: `linear-gradient(135deg, ${color}, ${color}dd)`,
        border: isFirst ? "3px solid #8B5CF6" : isLast ? "3px solid #0EA5E9" : `2px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 2px 8px ${color}44`,
        transition: "transform 0.2s",
      }}>
        <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>
          {(fp * 100).toFixed(0)}%
        </span>
      </div>

      {/* Account ID */}
      <div style={{
        fontFamily: "monospace", fontSize: 10, fontWeight: 600,
        color: "#0F172A", marginTop: 6, textAlign: "center",
        maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }} title={node.account}>
        {truncId}
      </div>

      {/* Ring badge */}
      {node.ring_id && (
        <div style={{
          background: "#F3E8FF", color: "#8B5CF6", border: "1px solid rgba(139,92,246,0.3)",
          padding: "1px 6px", borderRadius: 10, fontSize: 9, fontWeight: 700, marginTop: 3,
        }}>
          {node.ring_id}
        </div>
      )}
    </div>
  );
}

// ─── Edge arrow component ───────────────────────────────────────────────────────

function EdgeArrow({ tx }) {
  const isLaunder = tx.is_laundering;
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      minWidth: 80, padding: "0 4px",
    }}>
      {/* Amount */}
      <div style={{
        fontSize: 12, fontWeight: 800,
        color: isLaunder ? "#FD625E" : "#0F172A",
      }}>
        {formatAmount(tx.amount)}
      </div>

      {/* Arrow line */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0, margin: "4px 0",
      }}>
        <div style={{
          height: 2, width: 50,
          background: isLaunder
            ? "linear-gradient(90deg, #FD625E, #FD625Eaa)"
            : "linear-gradient(90deg, #CBD5E1, #94A3B8)",
        }} />
        <div style={{
          width: 0, height: 0,
          borderTop: "5px solid transparent",
          borderBottom: "5px solid transparent",
          borderLeft: `8px solid ${isLaunder ? "#FD625E" : "#94A3B8"}`,
        }} />
      </div>

      {/* Timestamp */}
      <div style={{
        fontSize: 10, color: "#64748B", fontWeight: 500,
        fontFamily: "monospace",
      }}>
        {formatTimestamp(tx.timestamp)}
      </div>

      {/* Payment format + laundering flag */}
      <div style={{ display: "flex", gap: 4, marginTop: 2, alignItems: "center" }}>
        <span style={{
          fontSize: 9, fontWeight: 700, color: "#94A3B8",
          textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          {tx.payment_format || "—"}
        </span>
        {isLaunder && (
          <span style={{
            fontSize: 9, fontWeight: 800, color: "#FD625E",
            background: "#FFF5F5", border: "1px solid #FD625E",
            padding: "0 4px", borderRadius: 4,
          }}>🚩</span>
        )}
      </div>
    </div>
  );
}

// ─── Single path card ───────────────────────────────────────────────────────────

function PathCard({ pathData, index }) {
  const [expanded, setExpanded] = useState(false);
  const badge = riskBadge(pathData.risk_score);

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: `1px solid ${badge.border}33`,
        borderLeft: `4px solid ${badge.border}`,
        borderRadius: 14,
        padding: "20px 24px",
        marginBottom: 16,
        boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        transition: "box-shadow 0.2s, border-color 0.2s",
        cursor: "pointer",
      }}
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.07)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.03)"}
    >
      {/* Header row */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: expanded ? 20 : 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Rank */}
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: badge.bg, border: `1px solid ${badge.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800, color: badge.color,
          }}>
            {index + 1}
          </div>

          {/* Path summary */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
                {pathData.hop_count} hop{pathData.hop_count !== 1 ? "s" : ""}
              </span>
              <span style={{
                background: badge.bg, color: badge.color,
                border: `1px solid ${badge.border}`,
                padding: "2px 8px", borderRadius: 12,
                fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
              }}>
                {badge.label}
              </span>
              {pathData.direction && (
                <span style={{
                  fontSize: 10, fontWeight: 600, color: "#94A3B8",
                  textTransform: "uppercase",
                }}>
                  {pathData.direction === "outbound" ? "▸ OUT" : "◂ IN"}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "#64748B", fontWeight: 500, marginTop: 2 }}>
              Risk: {pathData.risk_score.toFixed(4)} · Max fraud: {(pathData.max_fraud_prob * 100).toFixed(1)}%
              {pathData.total_laundering_hops > 0 && (
                <span style={{ color: "#FD625E", fontWeight: 700 }}>
                  {" "}· {pathData.total_laundering_hops} laundering hop{pathData.total_laundering_hops > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Amounts */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Total Amount
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A" }}>
            {formatAmount(pathData.total_amount)}
          </div>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>
            Terminal: {formatAmount(pathData.terminal_amount)}
          </div>
        </div>
      </div>

      {/* Expanded: full path visualization */}
      {expanded && (
        <div style={{
          overflowX: "auto",
          padding: "16px 0",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "flex-start",
            gap: 0, minWidth: "fit-content",
          }}>
            {pathData.path.map((node, ni) => (
              <div key={ni} style={{ display: "flex", alignItems: "center" }}>
                <NodePill
                  node={node}
                  isFirst={ni === 0}
                  isLast={ni === pathData.path.length - 1}
                />
                {ni < pathData.transactions.length && (
                  <EdgeArrow tx={pathData.transactions[ni]} />
                )}
              </div>
            ))}
          </div>

          {/* Detailed transaction table */}
          <div style={{
            marginTop: 16, background: "#F8FAFC",
            borderRadius: 10, border: "1px solid #E2E8F0",
            overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F1F5F9", borderBottom: "1px solid #E2E8F0" }}>
                  {["Hop", "From", "To", "Amount", "Time", "Format", "Flag"].map(h => (
                    <th key={h} style={{
                      textAlign: "left", padding: "8px 12px",
                      fontSize: 10, fontWeight: 700, color: "#64748B",
                      textTransform: "uppercase", letterSpacing: "0.04em",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pathData.transactions.map((tx, ti) => (
                  <tr key={ti} style={{
                    borderBottom: "1px solid #E2E8F0",
                    background: tx.is_laundering ? "#FFF5F5" : "transparent",
                  }}>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: "#0F172A" }}>{ti + 1}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#0F172A" }}>
                      {(tx.from || "").slice(0, 10)}…
                    </td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#0F172A" }}>
                      {(tx.to || "").slice(0, 10)}…
                    </td>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: "#0F172A" }}>
                      {formatAmount(tx.amount)}
                    </td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#64748B" }}>
                      {tx.timestamp?.slice(0, 19) || "—"}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 10, fontWeight: 600, color: "#94A3B8" }}>
                      {tx.payment_format || "—"}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      {tx.is_laundering ? (
                        <span style={{
                          background: "#FFF5F5", color: "#FD625E", border: "1px solid #FD625E",
                          padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 800,
                        }}>FLAGGED</span>
                      ) : (
                        <span style={{ color: "#01B8AA", fontWeight: 600, fontSize: 10 }}>Clean</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Loading skeleton ───────────────────────────────────────────────────────────

function PathSkeleton() {
  return (
    <div style={{
      background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 14,
      padding: "20px 24px", marginBottom: 16,
    }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          height: 14, borderRadius: 6, marginBottom: 12,
          background: "linear-gradient(90deg, #E2E8F0 25%, #F8FAFC 50%, #E2E8F0 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
          width: i === 1 ? "60%" : i === 2 ? "80%" : "40%",
        }} />
      ))}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export default function FundFlowTracer({ prefilledAccount }) {
  const [accountId, setAccountId] = useState(prefilledAccount || "");
  const [depth, setDepth]         = useState(3);
  const [direction, setDirection] = useState("outbound");
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState(null);
  const inputRef = useRef(null);

  // Sync prefilled account
  useEffect(() => {
    if (prefilledAccount && prefilledAccount !== accountId) {
      setAccountId(prefilledAccount);
    }
  }, [prefilledAccount]);

  const trace = async () => {
    if (!accountId.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const r = await api.get(`/api/account/${encodeURIComponent(accountId.trim())}/flow`, {
        params: { depth, direction, max_paths: 20 },
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      setResult(r.data);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Failed to trace fund flows.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const directions = [
    { value: "outbound", label: "▸ Outbound", desc: "Where did money go?" },
    { value: "inbound",  label: "◂ Inbound",  desc: "Where did money come from?" },
    { value: "both",     label: "◂▸ Both",     desc: "Full picture" },
  ];

  return (
    <div>
      {/* ── Controls ─────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "flex-end",
      }}>
        {/* Account ID */}
        <div style={{ flex: "1 1 280px" }}>
          <label style={{
            display: "block", fontSize: 11, fontWeight: 700,
            color: "#64748B", textTransform: "uppercase",
            letterSpacing: "0.05em", marginBottom: 6,
          }}>Account ID</label>
          <input
            ref={inputRef}
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            onKeyDown={e => e.key === "Enter" && trace()}
            placeholder="Enter account ID…"
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#FFFFFF", border: "1px solid #E2E8F0",
              borderRadius: 10, padding: "12px 16px",
              fontSize: 14, fontWeight: 500, fontFamily: "monospace",
              color: "#0F172A", outline: "none",
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
            onFocus={e => { e.target.style.borderColor = "#01B8AA"; e.target.style.boxShadow = "0 0 0 3px rgba(1,184,170,0.12)"; }}
            onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }}
          />
        </div>

        {/* Depth */}
        <div style={{ flex: "0 0 100px" }}>
          <label style={{
            display: "block", fontSize: 11, fontWeight: 700,
            color: "#64748B", textTransform: "uppercase",
            letterSpacing: "0.05em", marginBottom: 6,
          }}>Depth</label>
          <select
            value={depth}
            onChange={e => setDepth(Number(e.target.value))}
            style={{
              width: "100%", background: "#FFFFFF", border: "1px solid #E2E8F0",
              borderRadius: 10, padding: "12px 12px",
              fontSize: 14, fontWeight: 600, color: "#0F172A",
              outline: "none", cursor: "pointer",
              appearance: "auto",
            }}
          >
            {[1, 2, 3, 4, 5].map(d => (
              <option key={d} value={d}>{d} hop{d > 1 ? "s" : ""}</option>
            ))}
          </select>
        </div>

        {/* Direction toggle */}
        <div style={{ flex: "0 0 auto" }}>
          <label style={{
            display: "block", fontSize: 11, fontWeight: 700,
            color: "#64748B", textTransform: "uppercase",
            letterSpacing: "0.05em", marginBottom: 6,
          }}>Direction</label>
          <div style={{ display: "flex", gap: 0, borderRadius: 10, overflow: "hidden", border: "1px solid #E2E8F0" }}>
            {directions.map(d => (
              <button
                key={d.value}
                onClick={() => setDirection(d.value)}
                title={d.desc}
                style={{
                  padding: "12px 16px", fontSize: 13, fontWeight: 700,
                  border: "none", cursor: "pointer",
                  background: direction === d.value ? "#01B8AA" : "#FFFFFF",
                  color: direction === d.value ? "#FFFFFF" : "#64748B",
                  transition: "all 0.15s",
                  borderRight: "1px solid #E2E8F0",
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Trace button */}
        <div style={{ flex: "0 0 auto" }}>
          <label style={{
            display: "block", fontSize: 11, fontWeight: 700,
            color: "transparent", marginBottom: 6,
          }}>&nbsp;</label>
          <button
            onClick={trace}
            disabled={loading || !accountId.trim()}
            style={{
              padding: "12px 28px", fontSize: 14, fontWeight: 700,
              border: "none", borderRadius: 10, cursor: loading ? "wait" : "pointer",
              background: loading
                ? "linear-gradient(90deg, #94A3B8, #CBD5E1)"
                : "linear-gradient(135deg, #01B8AA, #0EA5E9)",
              color: "#FFFFFF",
              boxShadow: "0 2px 8px rgba(1,184,170,0.3)",
              transition: "all 0.2s",
              opacity: !accountId.trim() ? 0.5 : 1,
            }}
          >
            {loading ? "Tracing…" : "Trace Flows"}
          </button>
        </div>
      </div>

      {/* ── Error ────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          background: "#FFF5F5", border: "1px solid #FD625E", borderRadius: 12,
          padding: "16px 20px", marginBottom: 20,
          color: "#FD625E", fontWeight: 600, fontSize: 14,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────────── */}
      {loading && (
        <div>
          <PathSkeleton />
          <PathSkeleton />
          <PathSkeleton />
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────── */}
      {result && !loading && (
        <div>
          {/* Summary bar */}
          <div style={{
            display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap", alignItems: "center",
          }}>
            <div style={{
              background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10,
              padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "#0F172A",
            }}>
              <span style={{ color: "#64748B", fontWeight: 500 }}>Paths found: </span>
              <span style={{ fontWeight: 800 }}>{result.path_count}</span>
            </div>
            <div style={{
              background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10,
              padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "#0F172A",
            }}>
              <span style={{ color: "#64748B", fontWeight: 500 }}>Candidates evaluated: </span>
              <span style={{ fontWeight: 800 }}>{result.candidates_before_filter}</span>
            </div>
            <div style={{
              background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10,
              padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "#0F172A",
            }}>
              <span style={{ color: "#64748B", fontWeight: 500 }}>Depth: </span>
              <span style={{ fontWeight: 800 }}>{result.depth}</span>
            </div>
            {result.truncated && (
              <div style={{
                background: "#FFFBEB", border: "1px solid #F2C80F", borderRadius: 10,
                padding: "10px 16px", fontSize: 13, fontWeight: 700, color: "#D97706",
              }}>
                ⚠ Results truncated — increase max_paths for more
              </div>
            )}
          </div>

          {/* Path cards */}
          {result.paths.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "60px 20px",
              background: "#F8FAFC", borderRadius: 14,
              border: "1px dashed #CBD5E1",
            }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>🔍</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
                No Temporally Valid Paths Found
              </div>
              <div style={{ fontSize: 14, color: "#64748B", maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
                {result.candidates_before_filter > 0
                  ? `${result.candidates_before_filter} candidate path${result.candidates_before_filter > 1 ? "s were" : " was"} evaluated, but none satisfied temporal ordering (t₁ ≤ t₂ ≤ t₃).`
                  : "No transaction paths exist from this account at the specified depth."
                }
              </div>
            </div>
          ) : (
            result.paths.map((p, i) => (
              <PathCard key={i} pathData={p} index={i} />
            ))
          )}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {!result && !loading && !error && (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          background: "#F8FAFC", borderRadius: 14,
          border: "1px dashed #CBD5E1",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "#FFFFFF", border: "2px solid #E2E8F0",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}>
            <div style={{ fontSize: 24 }}>🔎</div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
            Temporal Fund Flow Tracer
          </div>
          <div style={{ fontSize: 14, color: "#64748B", maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>
            Enter an account ID and trace how money flows through the transaction network.
            Paths are temporally validated (t₁ ≤ t₂ ≤ t₃) and ranked by risk score.
          </div>
        </div>
      )}
    </div>
  );
}
