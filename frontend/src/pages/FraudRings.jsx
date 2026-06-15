/**
 * FraudRings.jsx
 * --------------
 * Displays detected fraud rings. 
 * Fetches from /api/masterminds for clustered results.
 * Fully styled for Light Theme (Professional Banking UI).
 */

import { useEffect, useState, useMemo } from "react";
import { api } from "../api";
import Navbar from "../components/Navbar";

// ─── helpers ──────────────────────────────────────────────────────────────────

function ringSizeVariant(size) {
  if (size >= 10) return { bg: "#FFF5F5", border: "1px solid #FD625E", text: "#FD625E", label: "LARGE"  };
  if (size >= 5)  return { bg: "#FFFBEB", border: "1px solid #F2C80F", text: "#D97706", label: "MEDIUM" };
  return          { bg: "#F0FDF9", border: "1px solid #01B8AA", text: "#01B8AA", label: "SMALL"  };
}

function fraudBadgeStyle(prob) {
  if (prob >= 0.7) return { background: "#FFF5F5", color: "#FD625E", border: "1px solid #FD625E" };
  if (prob >= 0.4) return { background: "#FFFBEB", color: "#D97706", border: "1px solid #F2C80F" };
  return                  { background: "#F0FDF9", color: "#01B8AA", border: "1px solid #01B8AA" };
}

function Badge({ children, style }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "4px 12px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: "0.04em",
      ...style,
    }}>
      {children}
    </span>
  );
}

// ─── expanded ring detail panel ───────────────────────────────────────────────

function RingDetailPanel({ ring }) {
  return (
    <div style={{
      background: "#F8FAFC",
      border: "1px solid #E2E8F0",
      borderRadius: 12,
      padding: "24px",
      marginTop: 12,
      boxShadow: "inset 0 2px 8px rgba(0,0,0,0.02)",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Ring ID",       value: ring.ring_id,                                      color: "#0F172A" },
          { label: "Mastermind",    value: (ring.id || "—").slice(0, 16) + "…",               color: "#0F172A" },
          { label: "Members",       value: ring.member_count ?? 0,                            color: "#0F172A" },
          { label: "Network Score", value: (ring.mastermind_score ?? 0).toFixed(3),           color: "#0F172A" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderRadius: 10,
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}>
            <div style={{ fontSize: 12, color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <a
          href={`/investigator`}
          style={{
            background: "linear-gradient(135deg, #01B8AA, #0EA5E9)",
            color: "#FFFFFF",
            padding: "10px 24px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            boxShadow: "0 2px 6px rgba(1, 184, 170, 0.2)",
            transition: "opacity 0.2s",
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = 0.9}
          onMouseLeave={e => e.currentTarget.style.opacity = 1}
        >
          Investigate Network
        </a>
        <button
          onClick={async () => {
            try {
              const r = await api.get(`/api/report/${ring.ring_id}`);
              const txt = typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 2);
              const a = Object.assign(document.createElement("a"), {
                href: URL.createObjectURL(new Blob([txt], { type: "text/plain" })),
                download: `${ring.ring_id}_STR.txt`,
              });
              a.click();
            } catch (error) {
              console.error("Failed to download report", error);
            }
          }}
          style={{
            background: "#FFFFFF",
            border: "1px solid #E2E8F0",
            color: "#0F172A",
            padding: "10px 24px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            transition: "background 0.2s",
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"}
          onMouseLeave={e => e.currentTarget.style.background = "#FFFFFF"}
        >
          Download STR Report
        </button>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function FraudRings() {
  const [rings,      setRings]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [search,     setSearch]     = useState("");
  const [sortBy,     setSortBy]     = useState("size");

  // ── fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/api/masterminds')
      .then(res => { 
        setRings(res.data || []); 
        setLoading(false); 
      })
      .catch(err => { 
        console.error(err); 
        setError("Failed to load fraud rings. Verify the graph database is running."); 
        setLoading(false); 
      });
  }, []);

  // ── derived list ────────────────────────────────────────────────────────────
  const displayedRings = useMemo(() => {
    let list = [...rings];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.ring_id?.toLowerCase().includes(q) ||
        r.id?.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (sortBy === "size")       return (b.member_count ?? 0) - (a.member_count ?? 0);
      if (sortBy === "fraud_prob") return (b.fraud_prob ?? 0)   - (a.fraud_prob ?? 0);
      return (a.ring_id ?? "").localeCompare(b.ring_id ?? "");
    });

    return list;
  }, [rings, search, sortBy]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", color: "#0F172A" }}>
      <Navbar />

      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "40px 48px" }}>

        <div style={{ marginBottom: 36, overflow: "visible" }}>
          <h1 style={{
            display: "inline-block",
            fontSize: 42,
            fontWeight: 800,
            background: "linear-gradient(90deg, #FD625E, #F2C80F)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            padding: "20px 10px", // Massive padding prevents all clipping
            margin: "-20px 0 10px -10px", // Exact negative margin negates the padding shift
            lineHeight: 1.4, // Maximum vertical breathing room
          }}>
            Fraud Ring Intelligence
          </h1>
          <p style={{ color: "#0F172A", fontSize: 15, fontWeight: 500, margin: 0 }}>
            {rings.length} active fraud networks detected by graph community analysis
          </p>
        </div>

        {/* ── Summary KPI row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20, marginBottom: 40 }}>
          {[
            { label: "Total Rings",      value: rings.length,                                                color: "#8B5CF6" },
            { label: "Total Members",    value: rings.reduce((s,r) => s + (r.member_count ?? 0), 0),         color: "#F2C80F" },
            { label: "Large Rings (10+)",value: rings.filter(r => (r.member_count ?? 0) >= 10).length,       color: "#FD625E" },
            { label: "Avg Ring Size",    value: rings.length ? (rings.reduce((s,r) => s + (r.member_count ?? 0), 0) / rings.length).toFixed(1) : 0, color: "#01B8AA" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderLeft: `4px solid ${color}`,
              borderRadius: 14,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              overflow: "hidden", // ensures left border remains crisp
            }}>
              <div style={{
                paddingTop: "20px",
                paddingBottom: "20px",
                paddingLeft: "24px",
                paddingRight: "24px",
              }}>
                <div style={{ fontSize: 13, color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Controls ── */}
        <div style={{ display: "flex", gap: 16, marginBottom: 32, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 440 }}>
            <span style={{
              position: "absolute", left: 16, top: "50%",
              transform: "translateY(-50%)", fontSize: 13, pointerEvents: "none",
              color: "#0F172A", fontWeight: 700, letterSpacing: "0.05em"
            }}>SEARCH</span>
            <input
              className="fraud-search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ring ID or Mastermind…"
              onFocus={e => {
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(1,184,170,0.15)";
                e.currentTarget.style.borderColor = "#01B8AA";
              }}
              onBlur={e => {
                e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.02)";
                e.currentTarget.style.borderColor = "#E2E8F0";
              }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#FFFFFF",
                border: "1px solid #E2E8F0",
                borderRadius: 12,
                padding: "14px 16px 14px 84px",
                color: "#0F172A",
                fontSize: 14,
                fontWeight: 500,
                outline: "none",
                transition: "all 0.2s",
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  position: "absolute", right: 12, top: "50%",
                  transform: "translateY(-50%)",
                  background: "#F8FAFC", border: "1px solid #E2E8F0",
                  borderRadius: "50%", width: 26, height: 26,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#64748B", cursor: "pointer", fontSize: 12, fontWeight: 700,
                }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {["size", "fraud_prob", "ring_id"].map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                style={{
                  padding: "12px 20px",
                  borderRadius: 10,
                  border: `1px solid ${sortBy === s ? "#01B8AA" : "#E2E8F0"}`,
                  background: sortBy === s ? "#01B8AA" : "#F8FAFC",
                  color: sortBy === s ? "#FFFFFF" : "#64748B",
                  fontSize: 13,
                  fontWeight: sortBy === s ? 700 : 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  boxShadow: sortBy === s ? "0 2px 6px rgba(1, 184, 170, 0.2)" : "0 1px 2px rgba(0,0,0,0.02)",
                }}
              >
                {s === "size" ? "Sort by Size" : s === "fraud_prob" ? "Sort by Risk" : "Sort by ID"}
              </button>
            ))}
          </div>
        </div>

        {/* ── States ── */}
        {loading && (
          <div style={{ textAlign: "center", padding: "100px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{
              border: "3px solid #E2E8F0",
              borderTop: "3px solid #01B8AA",
              borderRadius: "50%",
              width: 32, height: 32,
              animation: "spin 1s linear infinite",
              marginBottom: 20
            }} />
            <div style={{ color: "#64748B", fontSize: 14, fontWeight: 500 }}>
              Loading fraud ring data...
            </div>
          </div>
        )}

        {error && (
          <div style={{
            background: "#FFF5F5", border: "1px solid #FD625E",
            borderRadius: 12, padding: "20px 24px", color: "#FD625E", marginBottom: 32,
            fontWeight: 600, fontSize: 15, boxShadow: "0 2px 8px rgba(253, 98, 94, 0.1)"
          }}>
            System Error: {error}
          </div>
        )}

        {/* ── Ring rows ── */}
        {!loading && !error && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {displayedRings.length === 0 && (
              <div style={{
                textAlign: "center", padding: "80px 20px", background: "#F8FAFC",
                border: "2px dashed #E2E8F0", borderRadius: 16,
                display: "flex", flexDirection: "column", alignItems: "center"
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
                  No rings match your search
                </div>
                <div style={{ color: "#64748B", fontSize: 14 }}>
                  Try adjusting your search terms or exploring the full list.
                </div>
              </div>
            )}

            {displayedRings.map(ring => {
              const size      = ring.member_count ?? 0;
              const variant   = ringSizeVariant(size);
              const fraudProb = ring.fraud_prob ?? 0;
              const score     = ring.mastermind_score ?? 0;
              const isOpen    = expandedId === ring.ring_id;
              
              const rowRiskAccent = fraudProb > 0.7 ? "#FD625E" : fraudProb > 0.4 ? "#F2C80F" : "#01B8AA";

              return (
                <div key={ring.ring_id} style={{
                  background: isOpen ? "#F8FAFC" : "#FFFFFF",
                  border: `1px solid ${isOpen ? "#01B8AA" : "#E2E8F0"}`,
                  borderLeft: `4px solid ${isOpen ? "#01B8AA" : rowRiskAccent}`,
                  borderRadius: 14,
                  boxShadow: isOpen ? "0 4px 16px rgba(0,0,0,0.06)" : "0 2px 8px rgba(0,0,0,0.02)",
                  transition: "all 0.2s ease",
                  overflow: "hidden"
                }}>
                  {/* ── Clickable summary row ── */}
                  <div
                    onClick={() => setExpandedId(isOpen ? null : ring.ring_id)}
                    style={{
                      padding: "20px 28px",
                      cursor: "pointer",
                      display: "grid",
                      gridTemplateColumns: "2fr 2fr 1.2fr 1fr 1fr 1fr auto",
                      alignItems: "center",
                      gap: 24,
                    }}
                  >
                    {/* Ring ID */}
                    <div>
                      <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 6 }}>RING ID</div>
                      <div style={{ fontFamily: "monospace", fontWeight: 700, color: "#0F172A", fontSize: 14 }}>
                        {ring.ring_id}
                      </div>
                    </div>

                    {/* Mastermind */}
                    <div>
                      <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 6 }}>MASTERMIND ID</div>
                      <div style={{ fontFamily: "monospace", color: "#0F172A", fontSize: 14, fontWeight: 500 }}>
                        {(ring.id || "—").slice(0, 16)}…
                      </div>
                    </div>

                    {/* Size badge */}
                    <div>
                      <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 6 }}>NETWORK SIZE</div>
                      <Badge style={{ background: variant.bg, color: variant.text, border: variant.border }}>
                        {variant.label} · {size}
                      </Badge>
                    </div>

                    {/* Network Score */}
                    <div>
                      <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 6 }}>RISK SCORE</div>
                      <div style={{ fontWeight: 800, color: "#0F172A", fontSize: 15 }}>{score.toFixed(3)}</div>
                    </div>

                    {/* Fraud probability */}
                    <div>
                      <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 6 }}>FRAUD PROB</div>
                      <Badge style={fraudBadgeStyle(fraudProb)}>
                        {(fraudProb * 100).toFixed(1)}%
                      </Badge>
                    </div>

                    {/* Risk bar */}
                    <div>
                      <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 8 }}>RISK LEVEL</div>
                      <div style={{ background: "#E2E8F0", borderRadius: 4, height: 6, width: "100%", maxWidth: 100 }}>
                        <div style={{
                          background: rowRiskAccent,
                          width: `${Math.min(fraudProb * 100, 100)}%`,
                          height: "100%",
                          borderRadius: 4,
                          transition: "width 0.4s ease",
                        }} />
                      </div>
                    </div>

                    {/* Expand chevron */}
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 36, height: 36,
                      borderRadius: "50%",
                      background: isOpen ? "#01B8AA" : "#FFFFFF",
                      color: isOpen ? "#FFFFFF" : "#64748B",
                      fontSize: 18,
                      fontWeight: 700,
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "all 0.2s ease",
                      border: `1px solid ${isOpen ? "#01B8AA" : "#E2E8F0"}`,
                      boxShadow: isOpen ? "0 2px 8px rgba(1, 184, 170, 0.2)" : "0 1px 3px rgba(0,0,0,0.02)"
                    }}>
                      ▾
                    </div>
                  </div>

                  {/* ── Expanded detail panel ── */}
                  <div style={{
                    maxHeight: isOpen ? 500 : 0,
                    opacity: isOpen ? 1 : 0,
                    overflow: "hidden",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    padding: isOpen ? "0 28px 28px 28px" : "0 28px"
                  }}>
                    <RingDetailPanel ring={ring} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        .fraud-search-input::placeholder {
          color: #94A3B8;
          opacity: 1;
        }
      `}</style>
    </div>
  );
}