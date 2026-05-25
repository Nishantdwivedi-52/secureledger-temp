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
 */

import { useState, useEffect, useCallback, useRef } from "react";
import Navbar   from "../components/Navbar";
import GraphViz from "../components/GraphViz";

const API = "http://127.0.0.1:8000";

// ─── helpers ──────────────────────────────────────────────────────────────────

function rowTheme(score) {
  if (score > 0.8) return {
    bg:     "rgba(69,10,10,0.3)",
    border: "#ef444430",
    badge:  { bg: "#7f1d1d", color: "#fca5a5", border: "#ef4444", label: "CRITICAL" },
  };
  if (score > 0.6) return {
    bg:     "rgba(67,20,7,0.3)",
    border: "#f9731630",
    badge:  { bg: "#431407", color: "#fdba74", border: "#f97316", label: "HIGH"     },
  };
  if (score > 0.4) return {
    bg:     "rgba(28,25,23,0.3)",
    border: "#eab30830",
    badge:  { bg: "#1c1917", color: "#fde047", border: "#eab308", label: "MEDIUM"  },
  };
  return {
    bg:     "rgba(5,46,22,0.2)",
    border: "#22c55e20",
    badge:  { bg: "#052e16", color: "#86efac", border: "#22c55e", label: "LOW"     },
  };
}

// ─── skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} style={{ padding: "16px 20px" }}>
          <div style={{
            height:     14,
            borderRadius: 6,
            background: "linear-gradient(90deg,#1e293b 25%,#334155 50%,#1e293b 75%)",
            backgroundSize: "200% 100%",
            animation:  "shimmer 1.5s infinite",
            width:      i === 0 ? "80%" : i === 4 ? "40%" : "60%",
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
        background:   done ? "#14532d" : "#0f172a",
        border:       `1px solid ${done ? "#22c55e" : "#334155"}`,
        color:        done ? "#4ade80" : "#64748b",
        borderRadius: 5,
        padding:      "1px 7px",
        fontSize:     10,
        cursor:       "pointer",
        marginLeft:   6,
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

    fetch(url)
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
          padding:       "14px 20px",
          textAlign:     "left",
          fontSize:      11,
          fontWeight:    700,
          color:         active ? "#a78bfa" : "#475569",
          letterSpacing: "0.07em",
          cursor:        "pointer",
          userSelect:    "none",
          whiteSpace:    "nowrap",
          width,
        }}
      >
        {label}
        <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3 }}>
          {active ? (sortDir === "desc" ? " ▼" : " ▲") : " ⇅"}
        </span>
      </th>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#020817", minHeight: "100vh", color: "white" }}>
      <Navbar />

      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "40px 28px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            fontSize:   36,
            fontWeight: 800,
            background: "linear-gradient(90deg,#a855f7,#ec4899)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor:  "transparent",
            marginBottom: 6,
          }}>
            Risk Assessment Table
          </h1>
          <p style={{ color: "#475569", fontSize: 14 }}>
            {loading ? "Loading accounts…" : `${sorted.length} accounts — click a row to visualise its network`}
          </p>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 28, maxWidth: 440 }}>
          <span style={{
            position: "absolute", left: 14, top: "50%",
            transform: "translateY(-50%)", fontSize: 16, pointerEvents: "none",
          }}>🔍</span>
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search account ID…"
            style={{
              width:        "100%",
              boxSizing:    "border-box",
              background:   "#0f172a",
              border:       "1px solid #334155",
              borderRadius: 12,
              padding:      "12px 16px 12px 42px",
              color:        "white",
              fontSize:     14,
              outline:      "none",
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              style={{
                position:   "absolute", right: 12, top: "50%",
                transform:  "translateY(-50%)",
                background: "none", border: "none",
                color:      "#64748b", cursor: "pointer", fontSize: 16,
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Table */}
        <div style={{
          background:   "#0a0f1e",
          border:       "1px solid #1e293b",
          borderRadius: 18,
          overflow:     "hidden",
          marginBottom: 32,
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#0f172a", borderBottom: "1px solid #1e293b" }}>
                <th style={{ padding: "14px 20px", textAlign: "left", fontSize: 11, color: "#334155", width: 40 }}>#</th>
                <SortableHeader col="id"            label="Account ID"      />
                <SortableHeader col="anomaly_score" label="Anomaly Score"   />
                <SortableHeader col="fraud_prob"    label="Fraud Prob"      />
                <SortableHeader col="ring_id"       label="Ring ID"         />
                <th style={{ padding: "14px 20px", textAlign: "left", fontSize: 11, color: "#475569", letterSpacing: "0.07em" }}>
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
                          background:   isActive ? "rgba(124,58,237,0.12)" : theme.bg,
                          borderBottom: `1px solid ${theme.border}`,
                          borderLeft:   isActive ? "3px solid #7c3aed" : "3px solid transparent",
                          cursor:       "pointer",
                          transition:   "background 0.15s, border-left 0.15s",
                        }}
                        onMouseEnter={e => {
                          if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                        }}
                        onMouseLeave={e => {
                          if (!isActive) e.currentTarget.style.background = theme.bg;
                        }}
                      >
                        {/* Rank */}
                        <td style={{ padding: "14px 20px", color: "#334155", fontSize: 12, fontWeight: 700 }}>
                          {i + 1}
                        </td>

                        {/* Full account ID + copy */}
                        <td style={{ padding: "14px 20px" }}>
                          <div style={{ display: "flex", alignItems: "center", maxWidth: 300 }}>
                            <span style={{
                              fontFamily:   "monospace",
                              fontSize:     12,
                              color:        "#e2e8f0",
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
                        <td style={{ padding: "14px 20px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {/* Mini bar */}
                            <div style={{
                              width: 50, height: 6,
                              background: "#1e293b",
                              borderRadius: 9999,
                              overflow: "hidden",
                            }}>
                              <div style={{
                                width:        `${Math.min((acc.anomaly_score ?? 0) * 100, 100)}%`,
                                height:       "100%",
                                background:   theme.badge.border,
                                borderRadius: 9999,
                              }} />
                            </div>
                            <span style={{
                              fontSize:   13,
                              fontWeight: 700,
                              color:      theme.badge.color,
                              fontVariantNumeric: "tabular-nums",
                            }}>
                              {(acc.anomaly_score ?? 0).toFixed(4)}
                            </span>
                          </div>
                        </td>

                        {/* Fraud probability */}
                        <td style={{ padding: "14px 20px" }}>
                          {acc.fraud_prob != null ? (
                            <span style={{
                              fontSize:   13,
                              fontWeight: 700,
                              color:      (acc.fraud_prob ?? 0) > 0.7 ? "#f87171" : "#94a3b8",
                            }}>
                              {((acc.fraud_prob ?? 0) * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span style={{ color: "#334155", fontSize: 12 }}>—</span>
                          )}
                        </td>

                        {/* Ring ID */}
                        <td style={{ padding: "14px 20px" }}>
                          {acc.ring_id ? (
                            <span style={{
                              background:   "#1e1b4b",
                              border:       "1px solid #4c1d95",
                              color:        "#a78bfa",
                              padding:      "2px 10px",
                              borderRadius: 9999,
                              fontSize:     10,
                              fontWeight:   600,
                            }}>
                              {acc.ring_id}
                            </span>
                          ) : (
                            <span style={{ color: "#334155", fontSize: 12 }}>—</span>
                          )}
                        </td>

                        {/* Risk badge */}
                        <td style={{ padding: "14px 20px" }}>
                          <span style={{
                            background:   theme.badge.bg,
                            border:       `1px solid ${theme.badge.border}`,
                            color:        theme.badge.color,
                            padding:      "3px 10px",
                            borderRadius: 9999,
                            fontSize:     10,
                            fontWeight:   700,
                            letterSpacing:"0.06em",
                          }}>
                            {theme.badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>

          {/* Empty state */}
          {!loading && sorted.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#334155" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
              No accounts found{searchTerm ? ` matching "${searchTerm}"` : ""}.
            </div>
          )}
        </div>

        {/* Graph panel */}
        <div style={{
          background:   "#0a0f1e",
          border:       `1px solid ${selectedAccount ? "#7c3aed50" : "#1e293b"}`,
          borderRadius: 18,
          padding:      "28px 32px",
          transition:   "border-color 0.3s",
          boxShadow:    selectedAccount ? "0 0 30px rgba(124,58,237,0.1)" : "none",
        }}>
          {selectedAccount ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
                    🕸 Network Graph
                  </h3>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: "#a78bfa" }}>
                    {selectedAccount}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAccount(null)}
                  style={{
                    background:   "#1e293b",
                    border:       "1px solid #334155",
                    color:        "#64748b",
                    borderRadius: 9999,
                    width:        32, height: 32,
                    cursor:       "pointer",
                    fontSize:     14,
                  }}
                >
                  ✕
                </button>
              </div>
              <GraphViz accountId={selectedAccount} />
            </>
          ) : (
            <div style={{
              textAlign:  "center",
              padding:    "50px 20px",
              color:      "#334155",
            }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>🕸</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#475569" }}>
                No account selected
              </div>
              <div style={{ fontSize: 13 }}>
                Click any row in the table above to visualise its 2-hop transaction network
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
      `}</style>
    </div>
  );
}