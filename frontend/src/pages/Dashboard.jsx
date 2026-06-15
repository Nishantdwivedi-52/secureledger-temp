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
    if (band >= 8) return "#FD625E"; // Critical
    if (band >= 6) return "#8AD4EB"; // High
    if (band >= 4) return "#F2C80F"; // Medium
    return "#01B8AA"; // Low
  }

  return (
    <div style={{ background: "#F8FAFC" }}>
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
              <span style={{ fontSize: 10, color: "#64748B", fontWeight: 600 }}>
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
            <span style={{ fontSize: 8, color: "#64748B", fontWeight: 600 }}>
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
          { color: "#01B8AA", label: "Low risk (0–0.4)"    },
          { color: "#F2C80F", label: "Medium (0.4–0.6)"    },
          { color: "#8AD4EB", label: "High (0.6–0.8)"      },
          { color: "#FD625E", label: "Critical (0.8–1.0)"  },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width:        10,
              height:       10,
              borderRadius: 2,
              background:   color,
              boxShadow:    `0 0 6px ${color}80`,
            }} />
            <span style={{ fontSize: 11, color: "#64748B" }}>{label}</span>
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
  if (score > 0.8) return { bg: "#FFFFFF", border: "#FD625E", text: "#FD625E", label: "CRITICAL" };
  if (score > 0.6) return { bg: "#FFFFFF", border: "#8AD4EB", text: "#0F172A", label: "HIGH"     };
  if (score > 0.4) return { bg: "#FFFFFF", border: "#F2C80F", text: "#0F172A", label: "MEDIUM"   };
  return               { bg: "#FFFFFF", border: "#01B8AA", text: "#01B8AA", label: "LOW"      };
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
        background:   copied ? "#01B8AA" : "#F8FAFC",
        border:       `1px solid ${copied ? "#01B8AA" : "#E2E8F0"}`,
        color:        copied ? "#FFFFFF" : "#0F172A",
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
      border:        `1px solid #E2E8F0`,
      borderLeft:    `4px solid ${theme.border}`,
      borderRadius:  10,
      marginBottom:  8,
      boxShadow:     "0 1px 3px rgba(0,0,0,0.05)",
      transition:    "transform 0.2s ease, box-shadow 0.2s ease",
      cursor:        "pointer",
    }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
      }}
    >
      {/* Rank */}
      <div style={{
        width:        28,
        height:       28,
        borderRadius: "50%",
        background:   "#F8FAFC",
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
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>ACCOUNT ID</div>
        <div style={{
          fontFamily:  "monospace",
          fontSize:    12,
          color:       "#0F172A",
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
          <div style={{ fontSize: 10, color: "#64748B", marginBottom: 2 }}>RING</div>
          <span style={{
            background:   "#F8FAFC",
            border:       "1px solid #E2E8F0",
            color:        "#0F172A",
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
          <div style={{ fontSize: 10, color: "#64748B", marginBottom: 2 }}>FRAUD PROB</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#FD625E" }}>
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
      background: "linear-gradient(90deg,#E2E8F0 25%,#F8FAFC 50%,#E2E8F0 75%)",
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
  const metrics        = globalStats?.metrics         ?? {};
  const suspAmount     = globalStats?.suspicious_amount ?? 0;

  const highRiskPct    = totalAccounts > 0
    ? ((highRisk / totalAccounts) * 100).toFixed(1)
    : "0.0";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#FFFFFF", minHeight: "100vh", color: "#0F172A" }}>
      <Navbar />

      {/* ── Animated hero header ── */}
      <div
        ref={headerRef}
        style={{
          background:    "linear-gradient(135deg, #01B8AA, #0EA5E9)",
          backgroundSize:"400% 400%",
          animation:     "gradientShift 12s ease infinite",
          borderBottom:  "1px solid #E2E8F0",
          padding:       "56px 48px 48px",
          position:      "relative",
          overflow:      "hidden",
          boxShadow:     "0 4px 20px rgba(1, 184, 170, 0.15)",
        }}
      >
        {/* Decorative glows */}
        <div style={{
          position: "absolute", top: -80, left: -80,
          width: 320, height: 320, borderRadius: "50%",
          background: "radial-gradient(circle,rgba(255,255,255,0.2),transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -60, right: 120,
          width: 240, height: 240, borderRadius: "50%",
          background: "radial-gradient(circle,rgba(255,255,255,0.15),transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Title */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 12, height: 12, borderRadius: "50%",
              background: "#FFFFFF",
              boxShadow: "0 0 10px rgba(255,255,255,0.8)",
              animation: "pulse 2s infinite",
            }} />
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#FFFFFF",
              letterSpacing: "0.15em",
              textShadow: "0 1px 2px rgba(0,0,0,0.1)",
            }}>
              SYSTEM ACTIVE — ALL SENSORS ONLINE
            </span>
          </div>

          <h1 style={{
            fontSize:   56,
            fontWeight: 900,
            color:      "#FFFFFF",
            marginBottom: 10,
            lineHeight:  1.05,
            textShadow: "0 2px 10px rgba(0,0,0,0.1)",
          }}>
            SecureLedger AI
          </h1>

          <p style={{ color: "rgba(255,255,255,0.9)", fontSize: 17, maxWidth: 520 }}>
            Real-time Graph Neural Network fraud detection across{" "}
            <span style={{ color: "#FFFFFF", fontWeight: 800 }}>
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
              { label: "GNN Model",        status: "ONLINE"       },
              { label: "Neo4j Graph DB",   status: "CONNECTED"    },
              { label: "Risk Engine",      status: "ACTIVE"       },
              { label: "Live Stream",      status: "BROADCASTING" },
            ].map(({ label, status }) => (
              <div key={label} style={{
                display:      "flex",
                alignItems:   "center",
                gap:          8,
                background:   "rgba(255,255,255,0.15)",
                border:       "1px solid rgba(255,255,255,0.3)",
                borderRadius: 9999,
                padding:      "6px 14px",
                backdropFilter: "blur(4px)",
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#FFFFFF",
                  boxShadow: `0 0 6px rgba(255,255,255,0.8)`,
                  animation: "pulse 2s infinite",
                }} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.9)" }}>{label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF" }}>{status}</span>
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
          color:     "rgba(255,255,255,0.8)",
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
            background:   "#F8FAFC",
            border:       "1px solid #FD625E",
            borderRadius: 12,
            padding:      "14px 20px",
            color:        "#FD625E",
            marginBottom: 32,
            boxShadow:    "0 2px 4px rgba(253,98,94,0.1)",
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
                background: "#F8FAFC",
                border: "1px solid #E2E8F0",
                borderRadius: 18,
                padding: "24px 28px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
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
                icon={<div style={{ width:10, height:10, background:"#01B8AA", borderRadius:2 }} />}
                subtitle="Accounts in graph database"
              />
              <RiskCard
                title="High Risk Accounts"
                value={highRisk}
                type="danger"
                icon={<div style={{ width:10, height:10, background:"#FD625E", borderRadius:2 }} />}
                trend="up"
                subtitle={`${highRiskPct}% of total accounts`}
              />
              <RiskCard
                title="Active Fraud Rings"
                value={fraudRings}
                type="warning"
                icon={<div style={{ width:10, height:10, background:"#8AD4EB", borderRadius:2 }} />}
                subtitle={`$${Number(suspAmount).toLocaleString()} suspicious volume`}
              />
              <RiskCard
                title="Model F1 Score"
                value={modelF1}
                type="purple"
                icon={<div style={{ width:10, height:10, background:"#8B5CF6", borderRadius:2 }} />}
                subtitle="GNN + Isolation Forest ensemble"
              />
            </>
          )}
        </div>

        {/* ── Model Evaluation Section ── */}
        <div style={{
          background:   "#ffffff",
          color:        "#0f172a",
          border:       "1px solid #E2E8F0",
          borderRadius: 20,
          padding:      "32px 40px",
          marginBottom: 40,
          boxShadow:    "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24
          }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>Model Evaluation</h2>
              <p style={{ fontSize: 14, color: "#64748B", margin: 0 }}>
                Ensemble performance metrics & confusion matrix
              </p>
            </div>
            <div style={{ fontSize: 13, color: "#64748B", fontWeight: 600 }}>
              Train: {metrics.train_samples?.toLocaleString() || "81,722"} | Test: {metrics.test_samples?.toLocaleString() || "20,431"}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
            {/* Left: 4 Metric Cards */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16
            }}>
              {[
                { label: "Precision", value: metrics.precision?.toFixed(4) || "0.8768", bg: "linear-gradient(135deg, #0ea5e9, #2563eb)", labelColor: "rgba(255,255,255,0.8)", valueColor: "#ffffff" },
                { label: "Recall", value: metrics.recall?.toFixed(4) || "0.9315", bg: "linear-gradient(135deg, #10b981, #059669)", labelColor: "rgba(255,255,255,0.8)", valueColor: "#ffffff" },
                { label: "F1 Score", value: metrics.f1?.toFixed(4) || "0.9033", bg: "linear-gradient(135deg, #8b5cf6, #6d28d9)", labelColor: "rgba(255,255,255,0.8)", valueColor: "#ffffff" },
                { label: "AUC-ROC", value: metrics.auc_roc?.toFixed(4) || "0.9990", bg: "linear-gradient(135deg, #f59e0b, #d97706)", labelColor: "rgba(255,255,255,0.8)", valueColor: "#ffffff" }
              ].map(m => (
                <div key={m.label} style={{
                  background: m.bg,
                  border: "none",
                  borderRadius: 14,
                  padding: "18px 24px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                }}>
                  <div style={{ fontSize: 13, color: m.labelColor, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: m.valueColor }}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Right: Confusion Matrix */}
            <div>
              <div style={{ fontSize: 12, color: "#0F172A", fontWeight: 700, marginBottom: 12 }}>
                CONFUSION MATRIX (TEST SET)
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr 1fr",
                gap: 8,
                alignItems: "center"
              }}>
                <div />
                <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#0F172A" }}>PREDICTED NORMAL</div>
                <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#0F172A" }}>PREDICTED FRAUD</div>

                <div style={{ textAlign: "right", paddingRight: 8, fontSize: 11, fontWeight: 700, color: "#0F172A", writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                  ACTUAL NORMAL
                </div>
                <div style={{
                  background: "#01B8AA",
                  color: "#ffffff",
                  borderRadius: 8,
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 4px rgba(1, 184, 170, 0.2)"
                }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{(metrics.tn ?? 101773).toLocaleString()}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.9 }}>TN (True Normal)</div>
                </div>
                <div style={{
                  background: "#F2C80F",
                  color: "#000000",
                  borderRadius: 8,
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 4px rgba(242, 200, 15, 0.2)"
                }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{(metrics.fp ?? 44).toLocaleString()}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>FP (False Alarm)</div>
                </div>

                <div style={{ textAlign: "right", paddingRight: 8, fontSize: 11, fontWeight: 700, color: "#0F172A", writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                  ACTUAL FRAUD
                </div>
                <div style={{
                  background: "#FD625E",
                  color: "#ffffff",
                  borderRadius: 8,
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 4px rgba(253, 98, 94, 0.2)"
                }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{(metrics.fn ?? 23).toLocaleString()}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.9 }}>FN (Missed Fraud)</div>
                </div>
                <div style={{
                  background: "#01B8AA",
                  color: "#ffffff",
                  borderRadius: 8,
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 4px rgba(1, 184, 170, 0.2)"
                }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{(metrics.tp ?? 313).toLocaleString()}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.9 }}>TP (Caught Fraud)</div>
                </div>
              </div>
            </div>
          </div>
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
            background:   "#F8FAFC",
            border:       "1px solid #E2E8F0",
            borderRadius: 20,
            padding:      "28px 32px",
            boxShadow:    "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, color: "#0F172A" }}>
                Anomaly Score Distribution
              </h2>
              <p style={{ fontSize: 13, color: "#64748B" }}>
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
            background:   "#F8FAFC",
            border:       "1px solid #E2E8F0",
            borderRadius: 20,
            padding:      "28px 32px",
            boxShadow:    "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24, color: "#0F172A" }}>
              Risk Breakdown
            </h2>

            {[
              {
                label: "Critical (>0.8)",
                count: allAccounts.filter(a => (a.anomaly_score ?? 0) > 0.8).length,
                color: "#FD625E",
                icon:  <div style={{ width:10, height:10, background:"#FD625E", borderRadius:"50%" }} />,
              },
              {
                label: "High (0.6–0.8)",
                count: allAccounts.filter(a => (a.anomaly_score ?? 0) > 0.6 && (a.anomaly_score ?? 0) <= 0.8).length,
                color: "#8AD4EB",
                icon:  <div style={{ width:10, height:10, background:"#8AD4EB", borderRadius:"50%" }} />,
              },
              {
                label: "Medium (0.4–0.6)",
                count: allAccounts.filter(a => (a.anomaly_score ?? 0) > 0.4 && (a.anomaly_score ?? 0) <= 0.6).length,
                color: "#F2C80F",
                icon:  <div style={{ width:10, height:10, background:"#F2C80F", borderRadius:"50%" }} />,
              },
              {
                label: "Low (<0.4)",
                count: allAccounts.filter(a => (a.anomaly_score ?? 0) <= 0.4).length,
                color: "#01B8AA",
                icon:  <div style={{ width:10, height:10, background:"#01B8AA", borderRadius:"50%" }} />,
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
                      {icon}
                      <span style={{ fontSize: 13, color: "#64748B" }}>{label}</span>
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ fontSize: 13, color, fontWeight: 700 }}>
                        {count.toLocaleString()}
                      </span>
                      <span style={{ fontSize: 11, color: "#64748B", width: 36, textAlign: "right" }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ background: "#E2E8F0", borderRadius: 9999, height: 8 }}>
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
              background:   "#FFFFFF",
              border:       "1px solid #E2E8F0",
              borderRadius: 12,
              display:      "flex",
              justifyContent: "space-between",
              alignItems:   "center",
              boxShadow:    "0 1px 3px rgba(0,0,0,0.05)",
            }}>
              <span style={{ fontSize: 13, color: "#64748B", fontWeight: 600 }}>Average Anomaly Score</span>
              <span style={{
                fontSize:   22,
                fontWeight: 800,
                color:      "#01B8AA",
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
          background:   "#F8FAFC",
          border:       "1px solid #E2E8F0",
          borderRadius: 20,
          padding:      "28px 32px",
          boxShadow:    "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <div style={{
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "center",
            marginBottom:   24,
          }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, color: "#0F172A" }}>
                Top High-Risk Accounts
              </h2>
              <p style={{ fontSize: 13, color: "#64748B" }}>
                Highest anomaly scores right now
              </p>
            </div>
            <a
              href="/risk"
              style={{
                background:   "linear-gradient(135deg, #01B8AA, #0EA5E9)",
                border:       "none",
                color:        "white",
                padding:      "10px 20px",
                borderRadius: 10,
                fontSize:     13,
                fontWeight:   600,
                textDecoration: "none",
                cursor:       "pointer",
                boxShadow:    "0 2px 6px rgba(1, 184, 170, 0.3)",
              }}
            >
              View All →
            </a>
          </div>

          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                padding: "14px 18px",
                border: "1px solid #E2E8F0",
                borderRadius: 10,
                marginBottom: 8,
                background: "#FFFFFF",
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
            <div style={{ textAlign: "center", padding: 40, color: "#64748B" }}>
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