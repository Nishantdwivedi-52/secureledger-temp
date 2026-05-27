/**
 * Dashboard.jsx
 * -------------
 * SecureLedger enterprise security dashboard.
 *
 * Features:
 *  - Animated gradient hero header
 *  - 4 stat cards from /api/stats + /api/dashboard/stats
 *  - Anomaly score distribution bar chart (pure CSS — no extra dep)
 *  - Recent high-risk accounts from /api/risk/top?limit=5
 *  - Live clock + system status bar
 */

import { useEffect, useState, useRef } from "react";
import Navbar   from "../components/Navbar";
import RiskCard from "../components/RiskCard";

const API = "http://127.0.0.1:8000";

// ════════════════════════════════════════════════════════════════════════════════
// ANOMALY DISTRIBUTION CHART
// Pure-CSS bar chart — no extra library needed.
// Buckets anomaly scores into 10 bands and renders them as animated bars.
// ════════════════════════════════════════════════════════════════════════════════

function AnomalyBarChart({ accounts }) {
  // Build 10 buckets: 0–0.1, 0.1–0.2, … 0.9–1.0
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    label: `${(i * 0.1).toFixed(1)}–${((i + 1) * 0.1).toFixed(1)}`,
    count: 0,
    band:  i,          // 0=safe … 9=critical
  }));

  accounts.forEach(acc => {
    const idx = Math.min(Math.floor((acc.anomaly_score ?? 0) * 10), 9);
    buckets[idx].count++;
  });

  const maxCount = Math.max(...buckets.map(b => b.count), 1);

  // Colour gradient: green → yellow → red
  function barColor(band) {
    if (band >= 8) return "#ef4444";
    if (band >= 6) return "#f97316";
    if (band >= 4) return "#eab308";
    return "#22c55e";
  }

  return (
    <div>
      <div style={{
        display:       "flex",
        alignItems:    "flex-end",
        gap:           8,
        height:        160,
        padding:       "0 4px",
      }}>
        {buckets.map((b, i) => (
          <div
            key={i}
            style={{
              flex:          1,
              display:       "flex",
              flexDirection: "column",
              alignItems:    "center",
              gap:           4,
              height:        "100%",
              justifyContent:"flex-end",
            }}
          >
            {/* Count label */}
            {b.count > 0 && (
              <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>
                {b.count}
              </span>
            )}
            {/* Bar */}
            <div style={{
              width:        "100%",
              height:       `${(b.count / maxCount) * 100}%`,
              minHeight:    b.count > 0 ? 4 : 0,
              background:   barColor(b.band),
              borderRadius: "4px 4px 0 0",
              boxShadow:    b.band >= 7 ? `0 0 10px ${barColor(b.band)}60` : "none",
              transition:   "height 0.8s cubic-bezier(0.34,1.56,0.64,1)",
            }} />
          </div>
        ))}
      </div>

      {/* X-axis labels */}
      <div style={{
        display: "flex",
        gap:     8,
        padding: "8px 4px 0",
      }}>
        {buckets.map((b, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <span style={{ fontSize: 8, color: "#334155", fontWeight: 600 }}>
              {(i * 0.1).toFixed(1)}
            </span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{
        display:    "flex",
        gap:        16,
        marginTop:  12,
        flexWrap:   "wrap",
      }}>
        {[
          { color: "#22c55e", label: "Low risk (0–0.4)"    },
          { color: "#eab308", label: "Medium (0.4–0.6)"    },
          { color: "#f97316", label: "High (0.6–0.8)"      },
          { color: "#ef4444", label: "Critical (0.8–1.0)"  },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width:        10,
              height:       10,
              borderRadius: 2,
              background:   color,
              boxShadow:    `0 0 6px ${color}80`,
            }} />
            <span style={{ fontSize: 11, color: "#475569" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// RECENT HIGH-RISK ACCOUNTS LIST
// ════════════════════════════════════════════════════════════════════════════════

function riskColor(score) {
  if (score > 0.8) return { bg: "#450a0a", border: "#ef4444", text: "#fca5a5", label: "CRITICAL" };
  if (score > 0.6) return { bg: "#431407", border: "#f97316", text: "#fdba74", label: "HIGH"     };
  if (score > 0.4) return { bg: "#1c1917", border: "#eab308", text: "#fde047", label: "MEDIUM"   };
  return               { bg: "#052e16", border: "#22c55e", text: "#86efac", label: "LOW"      };
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={copy}
      title="Copy account ID"
      style={{
        background:   copied ? "#14532d" : "#1e293b",
        border:       `1px solid ${copied ? "#22c55e" : "#334155"}`,
        color:        copied ? "#4ade80" : "#64748b",
        borderRadius: 6,
        padding:      "2px 8px",
        fontSize:     10,
        fontWeight:   600,
        cursor:       "pointer",
        transition:   "all 0.15s",
        marginLeft:   8,
        flexShrink:   0,
      }}
    >
      {copied ? "✓" : "⎘"}
    </button>
  );
}

function HighRiskRow({ account, rank }) {
  const theme = riskColor(account.anomaly_score ?? 0);

  return (
    <div style={{
      display:       "flex",
      alignItems:    "center",
      gap:           16,
      padding:       "14px 18px",
      background:    theme.bg,
      border:        `1px solid ${theme.border}20`,
      borderLeft:    `3px solid ${theme.border}`,
      borderRadius:  10,
      marginBottom:  8,
      transition:    "transform 0.15s",
    }}
      onMouseEnter={e => e.currentTarget.style.transform = "translateX(4px)"}
      onMouseLeave={e => e.currentTarget.style.transform = "translateX(0)"}
    >
      {/* Rank */}
      <div style={{
        width:        28,
        height:       28,
        borderRadius: "50%",
        background:   `${theme.border}20`,
        border:       `1px solid ${theme.border}`,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "center",
        fontSize:     12,
        fontWeight:   800,
        color:        theme.text,
        flexShrink:   0,
      }}>
        {rank}
      </div>

      {/* Account ID */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "#475569", marginBottom: 2 }}>ACCOUNT ID</div>
        <div style={{
          fontFamily:  "monospace",
          fontSize:    12,
          color:       "#e2e8f0",
          display:     "flex",
          alignItems:  "center",
          overflow:    "hidden",
        }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {account.id}
          </span>
          <CopyButton text={account.id} />
        </div>
      </div>

      {/* Ring ID */}
      {account.ring_id && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>RING</div>
          <span style={{
            background:   "#1e1b4b",
            border:       "1px solid #4c1d95",
            color:        "#a78bfa",
            padding:      "2px 8px",
            borderRadius: 9999,
            fontSize:     10,
            fontWeight:   600,
          }}>
            {account.ring_id}
          </span>
        </div>
      )}

      {/* Fraud prob */}
      {account.fraud_prob != null && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>FRAUD PROB</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171" }}>
            {(account.fraud_prob * 100).toFixed(1)}%
          </div>
        </div>
      )}

      {/* Score + badge */}
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <span style={{
          background:   theme.bg,
          border:       `1px solid ${theme.border}`,
          color:        theme.text,
          padding:      "3px 10px",
          borderRadius: 9999,
          fontSize:     10,
          fontWeight:   700,
          display:      "block",
          marginBottom: 4,
        }}>
          {theme.label}
        </span>
        <div style={{ fontSize: 16, fontWeight: 800, color: theme.text }}>
          {(account.anomaly_score ?? 0).toFixed(4)}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// LIVE CLOCK
// ════════════════════════════════════════════════════════════════════════════════

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {time.toUTCString().replace("GMT", "UTC")}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// SKELETON LOADER
// ════════════════════════════════════════════════════════════════════════════════

function Skeleton({ width = "100%", height = 20, radius = 6 }) {
  return (
    <div style={{
      width,
      height,
      borderRadius: radius,
      background: "linear-gradient(90deg,#1e293b 25%,#334155 50%,#1e293b 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s infinite",
    }} />
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ════════════════════════════════════════════════════════════════════════════════

export default function Dashboard() {
  const [globalStats,    setGlobalStats]    = useState(null);
  const [dashStats,      setDashStats]      = useState(null);
  const [topAccounts,    setTopAccounts]    = useState([]);
  const [allAccounts,    setAllAccounts]    = useState([]);   // for chart
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const headerRef = useRef(null);

  // ── Parallax scroll effect on header ───────────────────────────────────────
  useEffect(() => {
    const onScroll = () => {
      if (headerRef.current) {
        headerRef.current.style.backgroundPositionY = `${window.scrollY * 0.4}px`;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Data fetching ───────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);

   Promise.allSettled([
  fetch(`${API}/api/stats`, {
    headers: {
      "ngrok-skip-browser-warning": "true"
    }
  }).then(r => r.json()),

  fetch(`${API}/api/dashboard/stats`, {
    headers: {
      "ngrok-skip-browser-warning": "true"
    }
  }).then(r => r.json()),

  fetch(`${API}/api/risk/top?limit=5`, {
    headers: {
      "ngrok-skip-browser-warning": "true"
    }
  }).then(r => r.json()),

  fetch(`${API}/api/risk/top?limit=200`, {
    headers: {
      "ngrok-skip-browser-warning": "true"
    }
  }).then(r => r.json()),
]).then(([global, dash, top5, all]) => {
      if (global.status === "fulfilled") setGlobalStats(global.value);
      if (dash.status   === "fulfilled") setDashStats(dash.value);
      if (top5.status   === "fulfilled") setTopAccounts(top5.value);
      if (all.status    === "fulfilled") setAllAccounts(all.value);
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────────
  const totalAccounts  = dashStats?.total_accounts    ?? globalStats?.total_accounts ?? 0;
  const highRisk       = dashStats?.high_risk_accounts ?? 0;
  const fraudRings     = globalStats?.fraud_rings     ?? 0;
  const modelF1        = globalStats?.model_f1        ?? 0;
  const suspAmount     = globalStats?.suspicious_amount ?? 0;

  const highRiskPct    = totalAccounts > 0
    ? ((highRisk / totalAccounts) * 100).toFixed(1)
    : "0.0";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#020817", minHeight: "100vh", color: "white" }}>
      <Navbar />

      {/* ── Animated hero header ── */}
      <div
        ref={headerRef}
        style={{
          background:    "linear-gradient(135deg,#0d0221,#1a0533,#050e2b,#0d1a40)",
          backgroundSize:"400% 400%",
          animation:     "gradientShift 12s ease infinite",
          borderBottom:  "1px solid #1e293b",
          padding:       "56px 48px 48px",
          position:      "relative",
          overflow:      "hidden",
        }}
      >
        {/* Decorative glows */}
        <div style={{
          position: "absolute", top: -80, left: -80,
          width: 320, height: 320, borderRadius: "50%",
          background: "radial-gradient(circle,rgba(168,85,247,0.2),transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -60, right: 120,
          width: 240, height: 240, borderRadius: "50%",
          background: "radial-gradient(circle,rgba(236,72,153,0.15),transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Title */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 12, height: 12, borderRadius: "50%",
              background: "#22c55e",
              boxShadow: "0 0 10px #22c55e",
              animation: "pulse 2s infinite",
            }} />
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#4ade80",
              letterSpacing: "0.15em",
            }}>
              SYSTEM ACTIVE — ALL SENSORS ONLINE
            </span>
          </div>

          <h1 style={{
            fontSize:   56,
            fontWeight: 900,
            background: "linear-gradient(90deg,#a855f7,#ec4899,#ef4444,#f97316)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor:  "transparent",
            marginBottom: 10,
            lineHeight:  1.05,
          }}>
            SecureLedger AI
          </h1>

          <p style={{ color: "#64748b", fontSize: 17, maxWidth: 520 }}>
            Real-time Graph Neural Network fraud detection across{" "}
            <span style={{ color: "#a78bfa", fontWeight: 700 }}>
              {totalAccounts.toLocaleString()}
            </span>{" "}
            financial accounts
          </p>

          {/* System status bar */}
          <div style={{
            display:      "flex",
            gap:          24,
            marginTop:    24,
            flexWrap:     "wrap",
          }}>
            {[
              { label: "GNN Model",        status: "ONLINE",      color: "#22c55e" },
              { label: "Neo4j Graph DB",   status: "CONNECTED",   color: "#22c55e" },
              { label: "Risk Engine",      status: "ACTIVE",      color: "#22c55e" },
              { label: "Live Stream",      status: "BROADCASTING",color: "#a855f7" },
            ].map(({ label, status, color }) => (
              <div key={label} style={{
                display:      "flex",
                alignItems:   "center",
                gap:          8,
                background:   "rgba(255,255,255,0.04)",
                border:       `1px solid ${color}30`,
                borderRadius: 9999,
                padding:      "6px 14px",
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: color,
                  boxShadow: `0 0 6px ${color}`,
                  animation: "pulse 2s infinite",
                }} />
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color }}>{status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Timestamp */}
        <div style={{
          position:  "absolute",
          top:       20,
          right:     32,
          fontSize:  11,
          color:     "#334155",
          fontFamily:"monospace",
        }}>
          <LiveClock />
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "40px 32px" }}>

        {/* ── Error banner ── */}
        {error && (
          <div style={{
            background:   "#450a0a",
            border:       "1px solid #ef4444",
            borderRadius: 12,
            padding:      "14px 20px",
            color:        "#fca5a5",
            marginBottom: 32,
          }}>
            ⚠️ Failed to load some data: {error}
          </div>
        )}

        {/* ── Stat cards ── */}
        <div style={{ display: "flex", gap: 20, marginBottom: 40, flexWrap: "wrap" }}>
          {loading ? (
            // Skeleton state
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                flex: 1, minWidth: 200,
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 18,
                padding: "24px 28px",
              }}>
                <Skeleton width="60%" height={12} />
                <div style={{ marginTop: 16 }}>
                  <Skeleton width="80%" height={36} radius={8} />
                </div>
                <div style={{ marginTop: 12 }}>
                  <Skeleton width="50%" height={10} />
                </div>
              </div>
            ))
          ) : (
            <>
              <RiskCard
                title="Total Accounts"
                value={totalAccounts}
                type="default"
                icon="🏦"
                subtitle="Accounts in graph database"
              />
              <RiskCard
                title="High Risk Accounts"
                value={highRisk}
                type="danger"
                icon="🚨"
                trend="up"
                subtitle={`${highRiskPct}% of total accounts`}
              />
              <RiskCard
                title="Active Fraud Rings"
                value={fraudRings}
                type="warning"
                icon="🕸"
                subtitle={`$${Number(suspAmount).toLocaleString()} suspicious volume`}
              />
              <RiskCard
                title="Model F1 Score"
                value={modelF1}
                type="purple"
                icon="🤖"
                subtitle="GNN + Isolation Forest ensemble"
              />
            </>
          )}
        </div>

        {/* ── Two-column section ── */}
        <div style={{
          display:             "grid",
          gridTemplateColumns: "1fr 1fr",
          gap:                 24,
          marginBottom:        40,
        }}>

          {/* ── Anomaly distribution chart ── */}
          <div style={{
            background:   "#0a0f1e",
            border:       "1px solid #1e293b",
            borderRadius: 20,
            padding:      "28px 32px",
          }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
                Anomaly Score Distribution
              </h2>
              <p style={{ fontSize: 13, color: "#475569" }}>
                Distribution of {allAccounts.length} accounts across risk bands
              </p>
            </div>

            {loading ? (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                    <Skeleton height={`${Math.random() * 80 + 20}%`} radius={4} />
                  </div>
                ))}
              </div>
            ) : (
              <AnomalyBarChart accounts={allAccounts} />
            )}
          </div>

          {/* ── Risk breakdown mini-stats ── */}
          <div style={{
            background:   "#0a0f1e",
            border:       "1px solid #1e293b",
            borderRadius: 20,
            padding:      "28px 32px",
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>
              Risk Breakdown
            </h2>

            {[
              {
                label: "Critical (>0.8)",
                count: allAccounts.filter(a => (a.anomaly_score ?? 0) > 0.8).length,
                color: "#ef4444",
                icon:  "🔴",
              },
              {
                label: "High (0.6–0.8)",
                count: allAccounts.filter(a => (a.anomaly_score ?? 0) > 0.6 && (a.anomaly_score ?? 0) <= 0.8).length,
                color: "#f97316",
                icon:  "🟠",
              },
              {
                label: "Medium (0.4–0.6)",
                count: allAccounts.filter(a => (a.anomaly_score ?? 0) > 0.4 && (a.anomaly_score ?? 0) <= 0.6).length,
                color: "#eab308",
                icon:  "🟡",
              },
              {
                label: "Low (<0.4)",
                count: allAccounts.filter(a => (a.anomaly_score ?? 0) <= 0.4).length,
                color: "#22c55e",
                icon:  "🟢",
              },
            ].map(({ label, count, color, icon }) => {
              const pct = allAccounts.length > 0
                ? (count / allAccounts.length) * 100
                : 0;
              return (
                <div key={label} style={{ marginBottom: 20 }}>
                  <div style={{
                    display:        "flex",
                    justifyContent: "space-between",
                    marginBottom:   6,
                    alignItems:     "center",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{icon}</span>
                      <span style={{ fontSize: 13, color: "#94a3b8" }}>{label}</span>
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ fontSize: 13, color, fontWeight: 700 }}>
                        {count.toLocaleString()}
                      </span>
                      <span style={{ fontSize: 11, color: "#475569", width: 36, textAlign: "right" }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ background: "#1e293b", borderRadius: 9999, height: 8 }}>
                    <div style={{
                      width:        `${pct}%`,
                      height:       "100%",
                      background:   color,
                      borderRadius: 9999,
                      boxShadow:    `0 0 8px ${color}60`,
                      transition:   "width 1s ease",
                    }} />
                  </div>
                </div>
              );
            })}

            {/* Average score */}
            <div style={{
              marginTop:    24,
              padding:      "14px 18px",
              background:   "#0f172a",
              border:       "1px solid #1e293b",
              borderRadius: 12,
              display:      "flex",
              justifyContent: "space-between",
              alignItems:   "center",
            }}>
              <span style={{ fontSize: 13, color: "#64748b" }}>Average Anomaly Score</span>
              <span style={{
                fontSize:   22,
                fontWeight: 800,
                color:      "#a78bfa",
              }}>
                {allAccounts.length > 0
                  ? (allAccounts.reduce((s, a) => s + (a.anomaly_score ?? 0), 0) / allAccounts.length).toFixed(4)
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Recent high-risk accounts ── */}
        <div style={{
          background:   "#0a0f1e",
          border:       "1px solid #1e293b",
          borderRadius: 20,
          padding:      "28px 32px",
        }}>
          <div style={{
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "center",
            marginBottom:   24,
          }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
                🚨 Top High-Risk Accounts
              </h2>
              <p style={{ fontSize: 13, color: "#475569" }}>
                Highest anomaly scores right now
              </p>
            </div>
            <a
              href="/risk"
              style={{
                background:   "linear-gradient(135deg,#7c3aed,#db2777)",
                border:       "none",
                color:        "white",
                padding:      "10px 20px",
                borderRadius: 10,
                fontSize:     13,
                fontWeight:   600,
                textDecoration: "none",
                cursor:       "pointer",
              }}
            >
              View All →
            </a>
          </div>

          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                padding: "14px 18px",
                border: "1px solid #1e293b",
                borderRadius: 10,
                marginBottom: 8,
              }}>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <Skeleton width={28} height={28} radius={14} />
                  <div style={{ flex: 1 }}>
                    <Skeleton width="60%" height={12} />
                    <div style={{ marginTop: 6 }}>
                      <Skeleton width="30%" height={10} />
                    </div>
                  </div>
                  <Skeleton width={60} height={24} radius={9999} />
                </div>
              </div>
            ))
          ) : topAccounts.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#334155" }}>
              No high-risk accounts found.
            </div>
          ) : (
            topAccounts.map((acc, i) => (
              <HighRiskRow key={acc.id} account={acc} rank={i + 1} />
            ))
          )}
        </div>
      </div>

      {/* ── Global keyframes ── */}
      <style>{`
        @keyframes gradientShift {
          0%   { background-position: 0%   50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0%   50%; }
        }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.3; }
        }
      `}</style>
    </div>
  );
}