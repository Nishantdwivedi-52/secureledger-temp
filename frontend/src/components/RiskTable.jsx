/**
 * RiskTable.jsx
 * -------------
 * Full risk assessment table with:
 *  - Full account ID + copy button
 *  - ring_id and fraud_prob columns
 *  - Colour-coded row risk levels
 *  - Loading skeleton animation
 *  - Debounced search
 *  - GraphViz panel on row click
 *  - Professional banking dashboard styling (Light theme)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import Navbar   from "../components/Navbar";
import GraphViz from "../components/GraphViz";

const API = "http://127.0.0.1:8000";

// ─── helpers ──────────────────────────────────────────────────────────────────

function rowTheme(score) {
  if (score > 0.8) return {
    bg:     "#FFF5F5", // very light coral tint
    hover:  "#FFE8E8",
    border: "#FD625E",
    badge:  { bg: "#FFF5F5", color: "#FD625E", border: "#FD625E", label: "CRITICAL" },
  };
  if (score > 0.6) return {
    bg:     "#FFFBEB", // very light yellow tint
    hover:  "#FFF3C4",
    border: "#F2C80F",
    badge:  { bg: "#FFFBEB", color: "#D97706", border: "#F2C80F", label: "HIGH"     },
  };
  if (score > 0.4) return {
    bg:     "#F0FAFF", // very light sky blue tint
    hover:  "#E0F4FB",
    border: "#8AD4EB",
    badge:  { bg: "#F0FAFF", color: "#0284C7", border: "#8AD4EB", label: "MEDIUM"  },
  };
  return {
    bg:     "#F0FDF9", // very light teal tint
    hover:  "#CCFBF1",
    border: "#01B8AA",
    badge:  { bg: "#F0FDF9", color: "#01B8AA", border: "#01B8AA", label: "LOW"     },
  };
}

// ─── skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr style={{ background: "#FFFFFF", borderBottom: "1px solid #E2E8F0" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} style={{ padding: "18px 24px" }}>
          <div style={{
            height:     14,
            borderRadius: 6,
            background: "linear-gradient(90deg,#E2E8F0 25%,#F8FAFC 50%,#E2E8F0 75%)",
            backgroundSize: "200% 100%",
            animation:  "shimmer 1.5s infinite",
            width:      i === 0 ? "40px" : i === 1 ? "80%" : i === 5 ? "40%" : "60%",
          }} />
        </td>
      ))}
    </tr>
  );
}

// ─── copy button ──────────────────────────────────────────────────────────────

function CopyBtn({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={e => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      style={{
        background:   done ? "#01B8AA" : "#F8FAFC",
        border:       `1px solid ${done ? "#01B8AA" : "#E2E8F0"}`,
        color:        done ? "#FFFFFF" : "#64748B",
        borderRadius: 6,
        padding:      "2px 8px",
        fontSize:     11,
        fontWeight:   600,
        cursor:       "pointer",
        marginLeft:   10,
        transition:   "all 0.15s",
        flexShrink:   0,
      }}
      title="Copy full ID"
    >
      {done ? "✓" : "⎘"}
    </button>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function RiskTable() {
  const [accounts,         setAccounts]         = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [searchTerm,       setSearchTerm]       = useState("");
  const [debouncedSearch,  setDebouncedSearch]  = useState("");
  const [selectedAccount,  setSelectedAccount]  = useState(null);
  const [sortCol,          setSortCol]          = useState("anomaly_score");
  const [sortDir,          setSortDir]          = useState("desc");
  const debounceRef = useRef(null);

  // ── Debounce search input ──────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => clearTimeout(debounceRef.current);
  }, [searchTerm]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    const url = debouncedSearch
      ? `${API}/api/risk/top?limit=50&search=${encodeURIComponent(debouncedSearch)}`
      : `${API}/api/risk/top?limit=50`;

    fetch(url, { headers: { "ngrok-skip-browser-warning": "true" } })
      .then(r => r.json())
      .then(d => { setAccounts(Array.isArray(d) ? d : []); })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  // ── Sort ───────────────────────────────────────────────────────────────────
  const toggleSort = useCallback((col) => {
    if (sortCol === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  }, [sortCol]);

  const sorted = [...accounts].sort((a, b) => {
    const aVal = a[sortCol] ?? 0;
    const bVal = b[sortCol] ?? 0;
    const cmp  = typeof aVal === "string"
      ? aVal.localeCompare(bVal)
      : aVal - bVal;
    return sortDir === "desc" ? -cmp : cmp;
  });

  // ── Header cell ───────────────────────────────────────────────────────────
  function SortableHeader({ col, label, width }) {
    const active = sortCol === col;
    return (
      <th
        onClick={() => toggleSort(col)}
        style={{
          padding:       "16px 24px",
          textAlign:     "left",
          fontSize:      13,
          fontWeight:    700,
          color:         active ? "#01B8AA" : "#0F172A",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          cursor:        "pointer",
          userSelect:    "none",
          whiteSpace:    "nowrap",
          width,
        }}
      >
        {label}
        <span style={{ marginLeft: 6, opacity: active ? 1 : 0.4 }}>
          {active ? (sortDir === "desc" ? "▼" : "▲") : "⇅"}
        </span>
      </th>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#FFFFFF", minHeight: "100vh", color: "#0F172A" }}>
      <Navbar />

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "40px 48px" }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <h1 style={{
            fontSize:   42,
            fontWeight: 800,
            background: "linear-gradient(90deg, #01B8AA, #0EA5E9)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor:  "transparent",
            marginBottom: 12,
            padding: "0 4px", // Prevents clipping of italic/slanted font glyphs
            marginLeft: "-4px",
            lineHeight: 1.1,
          }}>
            Risk Assessment Table
          </h1>
          <p style={{ color: "#0F172A", fontSize: 15, fontWeight: 500, margin: 0 }}>
            {loading ? "Loading accounts…" : `${sorted.length} accounts — click a row to visualise its network`}
          </p>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 32, maxWidth: 500 }}>
          <span style={{
            position: "absolute", left: 20, top: "50%",
            transform: "translateY(-50%)", fontSize: 13, pointerEvents: "none",
            color: "#0F172A", fontWeight: 700, letterSpacing: "0.05em",
          }}>SEARCH</span>
          <input
            className="risk-search-input"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onFocus={e => {
              e.currentTarget.style.boxShadow = "0 0 0 4px rgba(1,184,170,0.15)";
              e.currentTarget.style.borderColor = "#01B8AA";
            }}
            onBlur={e => {
              e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
              e.currentTarget.style.borderColor = "#E2E8F0";
            }}
            placeholder="Account ID…"
            style={{
              width:        "100%",
              boxSizing:    "border-box",
              background:   "#FFFFFF",
              border:       "1px solid #E2E8F0",
              borderRadius: 14,
              padding:      "16px 16px 16px 92px",
              color:        "#0F172A",
              fontSize:     14,
              fontWeight:   500,
              outline:      "none",
              boxShadow:    "0 1px 3px rgba(0,0,0,0.04)",
              transition:   "all 0.2s ease",
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              style={{
                position:   "absolute", right: 16, top: "50%",
                transform:  "translateY(-50%)",
                background: "#F8FAFC", border: "1px solid #E2E8F0",
                borderRadius: "50%", width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center",
                color:      "#64748B", cursor: "pointer", fontSize: 12, fontWeight: 700,
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Table */}
        <div style={{
          background:   "#FFFFFF",
          border:       "1px solid #E2E8F0",
          borderRadius: 16,
          overflow:     "hidden",
          marginBottom: 48,
          boxShadow:    "0 4px 20px rgba(0,0,0,0.03)",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
                <th style={{ padding: "16px 24px", textAlign: "left", fontSize: 13, fontWeight: 700, color: "#0F172A", letterSpacing: "0.05em", textTransform: "uppercase", width: 50 }}>#</th>
                <SortableHeader col="id"            label="Account ID"      />
                <SortableHeader col="anomaly_score" label="Anomaly Score"   />
                <SortableHeader col="fraud_prob"    label="Fraud Prob"      />
                <SortableHeader col="ring_id"       label="Ring ID"         />
                <th style={{ padding: "16px 24px", textAlign: "left", fontSize: 13, fontWeight: 700, color: "#0F172A", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  RISK LEVEL
                </th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : sorted.map((acc, i) => {
                    const theme    = rowTheme(acc.anomaly_score ?? 0);
                    const isActive = selectedAccount === acc.id;

                    return (
                      <tr
                        key={acc.id}
                        onClick={() => setSelectedAccount(isActive ? null : acc.id)}
                        style={{
                          background:   isActive ? theme.hover : theme.bg,
                          borderBottom: "1px solid #E2E8F0",
                          borderLeft:   isActive ? `4px solid #01B8AA` : `4px solid ${theme.border}`,
                          cursor:       "pointer",
                          transition:   "background 0.2s ease, border-left 0.2s ease",
                        }}
                        onMouseEnter={e => {
                          if (!isActive) e.currentTarget.style.background = theme.hover;
                        }}
                        onMouseLeave={e => {
                          if (!isActive) e.currentTarget.style.background = theme.bg;
                        }}
                      >
                        {/* Rank */}
                        <td style={{ padding: "20px 24px", color: "#64748B", fontSize: 13, fontWeight: 600 }}>
                          {i + 1}
                        </td>

                        {/* Full account ID + copy */}
                        <td style={{ padding: "20px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", maxWidth: 320 }}>
                            <span style={{
                              fontFamily:   "monospace",
                              fontSize:     14,
                              fontWeight:   600,
                              color:        "#0F172A",
                              overflow:     "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace:   "nowrap",
                            }}>
                              {acc.id}
                            </span>
                            <CopyBtn text={acc.id} />
                          </div>
                        </td>

                        {/* Anomaly score */}
                        <td style={{ padding: "20px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            {/* Mini bar */}
                            <div style={{
                              width: 60, height: 8,
                              background: "#E2E8F0",
                              borderRadius: 9999,
                              overflow: "hidden",
                            }}>
                              <div style={{
                                width:        `${Math.min((acc.anomaly_score ?? 0) * 100, 100)}%`,
                                height:       "100%",
                                background:   theme.border,
                                borderRadius: 9999,
                              }} />
                            </div>
                            <span style={{
                              fontSize:   14,
                              fontWeight: 800,
                              color:      "#0F172A",
                              fontVariantNumeric: "tabular-nums",
                            }}>
                              {(acc.anomaly_score ?? 0).toFixed(4)}
                            </span>
                          </div>
                        </td>

                        {/* Fraud probability */}
                        <td style={{ padding: "20px 24px" }}>
                          {acc.fraud_prob != null ? (
                            <span style={{
                              fontSize:   14,
                              fontWeight: 700,
                              color:      (acc.fraud_prob ?? 0) > 0.7 ? "#FD625E" : "#64748B",
                            }}>
                              {((acc.fraud_prob ?? 0) * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span style={{ color: "#64748B", fontSize: 13 }}>—</span>
                          )}
                        </td>

                        {/* Ring ID */}
                        <td style={{ padding: "20px 24px" }}>
                          {acc.ring_id ? (
                            <span style={{
                              background:   "#F8FAFC",
                              border:       "1px solid #E2E8F0",
                              color:        "#5F6B6D",
                              padding:      "4px 12px",
                              borderRadius: 9999,
                              fontSize:     11,
                              fontWeight:   700,
                            }}>
                              {acc.ring_id}
                            </span>
                          ) : (
                            <span style={{ color: "#64748B", fontSize: 13 }}>—</span>
                          )}
                        </td>

                        {/* Risk badge */}
                        <td style={{ padding: "20px 24px" }}>
                          <span style={{
                            background:   theme.badge.bg,
                            border:       `1px solid ${theme.badge.border}`,
                            color:        theme.badge.color,
                            padding:      "4px 12px",
                            borderRadius: 9999,
                            fontSize:     11,
                            fontWeight:   800,
                            letterSpacing:"0.05em",
                            display:      "inline-block",
                            minWidth:     "70px",
                            textAlign:    "center",
                          }}>
                            {theme.badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>

          {/* Empty state — Redesigned for premium banking feel */}
          {!loading && sorted.length === 0 && (
            <div style={{
              textAlign: "center",
              padding: "100px 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: "#FFFFFF",
            }}>
              <div style={{
                position: "relative",
                width: 72, height: 72,
                marginBottom: 28,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                  border: "2px dashed #CBD5E1", borderRadius: "50%",
                  animation: "spin 20s linear infinite",
                }} />
                <div style={{
                  position: "absolute", top: 10, left: 10, right: 10, bottom: 10,
                  background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "50%",
                  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{ width: 8, height: 8, background: "#94A3B8", borderRadius: "50%" }} />
                </div>
              </div>
              
              <h3 style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginBottom: 12, letterSpacing: "-0.01em" }}>
                No Active Threats Found
              </h3>
              <p style={{ fontSize: 15, color: "#64748B", maxWidth: 420, lineHeight: 1.6, margin: 0 }}>
                {searchTerm
                  ? `There are no risk records matching the account ID "${searchTerm}". Please verify the identifier and try again.`
                  : "The risk analysis engine did not detect any accounts exceeding the baseline anomaly threshold. The network is secure."}
              </p>
            </div>
          )}
        </div>

        {/* Graph panel */}
        <div style={{
          background:   "#F8FAFC",
          border:       "1px solid #E2E8F0",
          borderRadius: 16,
          padding:      "32px 40px",
          transition:   "border-color 0.3s ease, box-shadow 0.3s ease",
          boxShadow:    selectedAccount ? "0 8px 30px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.03)",
        }}>
          {selectedAccount ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div>
                  <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, color: "#0F172A", letterSpacing: "-0.01em" }}>
                    Graph Network
                  </h3>
                  <div style={{ fontFamily: "monospace", fontSize: 14, color: "#64748B", fontWeight: 600 }}>
                    Target Account: <span style={{ color: "#0F172A" }}>{selectedAccount}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAccount(null)}
                  style={{
                    background:   "#FFFFFF",
                    border:       "1px solid #E2E8F0",
                    color:        "#0F172A",
                    borderRadius: "50%",
                    width:        40, height: 40,
                    cursor:       "pointer",
                    fontSize:     16,
                    display:      "flex", alignItems: "center", justifyContent: "center",
                    fontWeight:   600,
                    boxShadow:    "0 2px 6px rgba(0,0,0,0.04)",
                    transition:   "background 0.2s, box-shadow 0.2s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.04)"}
                  title="Close Graph"
                >
                  ✕
                </button>
              </div>
              <GraphViz accountId={selectedAccount} />
            </>
          ) : (
            <div style={{
              textAlign:  "center",
              padding:    "80px 20px",
              display:    "flex",
              flexDirection: "column",
              alignItems: "center"
            }}>
              <div style={{
                width: 72, height: 72, background: "#FFFFFF",
                border: "2px solid #E2E8F0", borderRadius: "50%",
                marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.02)"
              }}>
                <div style={{ width: 12, height: 12, background: "#CBD5E1", borderRadius: "50%" }}></div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, color: "#0F172A" }}>
                Network Visualization Sandbox
              </div>
              <div style={{ fontSize: 14, color: "#64748B", maxWidth: 380, lineHeight: 1.6 }}>
                Select any account from the risk assessment table above to generate an interactive, multi-hop transaction graph.
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        .risk-search-input::placeholder {
          color: #94A3B8;
          opacity: 1;
        }
      `}</style>
    </div>
  );
}