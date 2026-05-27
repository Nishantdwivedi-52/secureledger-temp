/**
 * FraudRings.jsx
 * --------------
 * Displays detected fraud rings. 
 * FIXED: Pointed to /api/masterminds to get the grouped clusters 
 * instead of the 40,000+ raw accounts.
 */

import { useEffect, useState, useMemo } from "react";
import { api } from "../api";
import Navbar from "../components/Navbar";

// ─── helpers ──────────────────────────────────────────────────────────────────

function ringSizeVariant(size) {
  if (size >= 10) return { bg: "#450a0a", border: "#ef4444", text: "#fca5a5", label: "LARGE"  };
  if (size >= 5)  return { bg: "#431407", border: "#f97316", text: "#fdba74", label: "MEDIUM" };
  return          { bg: "#1c1917", border: "#78716c", text: "#d6d3d1", label: "SMALL"  };
}

function fraudBadgeStyle(prob) {
  if (prob >= 0.8) return { background: "#7f1d1d", color: "#fca5a5", border: "1px solid #ef4444" };
  if (prob >= 0.5) return { background: "#431407", color: "#fdba74", border: "1px solid #f97316" };
  return                  { background: "#14532d", color: "#86efac", border: "1px solid #22c55e" };
}

function Badge({ children, style }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.05em",
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
      background: "#0f172a",
      border: "1px solid #334155",
      borderRadius: 12,
      padding: "20px 24px",
      marginTop: 8,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
        {[
          { label: "Ring ID",       value: ring.ring_id,                                      color: "#a78bfa" },
          { label: "Mastermind",    value: (ring.id || "—").slice(0, 14) + "…",               color: "#f472b6" },
          { label: "Members",       value: ring.member_count ?? 0,                            color: "#fb923c" },
          { label: "Network Score", value: (ring.mastermind_score ?? 0).toFixed(3),           color: "#f87171" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: "#1e293b",
            borderRadius: 10,
            padding: "12px 16px",
          }}>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <a
          href={`/investigator`}
          style={{
            background: "linear-gradient(135deg,#7c3aed,#db2777)",
            color: "white",
            padding: "8px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          🔍 Investigate in Investigator
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
            background: "#1e293b",
            border: "1px solid #334155",
            color: "#94a3b8",
            padding: "8px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          📄 Download STR Report
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
    // 💥 FIXED: Fetch from masterminds to get the grouped clusters, not raw nodes
    api.get('/api/masterminds')
      .then(res => { 
        setRings(res.data || []); 
        setLoading(false); 
      })
      .catch(err => { 
        console.error(err); 
        setError("Failed to load rings."); 
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
    <div style={{ minHeight: "100vh", background: "#020817", color: "white" }}>
      <Navbar />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            fontSize: 40,
            fontWeight: 800,
            background: "linear-gradient(90deg,#a855f7,#ec4899,#ef4444)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: 8,
          }}>
            Fraud Ring Intelligence
          </h1>
          <p style={{ color: "#64748b", fontSize: 16 }}>
            {rings.length} active fraud networks detected by GNN cluster analysis
          </p>
        </div>

        {/* ── Summary KPI row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 }}>
          {[
            { label: "Total Rings",      value: rings.length,                                                color: "#a78bfa" },
            { label: "Total Members",    value: rings.reduce((s,r) => s + (r.member_count ?? 0), 0),         color: "#fb923c" },
            { label: "Large Rings (10+)",value: rings.filter(r => (r.member_count ?? 0) >= 10).length,       color: "#f87171" },
            { label: "Avg Ring Size",    value: rings.length ? (rings.reduce((s,r) => s + (r.member_count ?? 0), 0) / rings.length).toFixed(1) : 0, color: "#34d399" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 14,
              padding: "20px 24px",
            }}>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Controls ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "center" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ring ID or mastermind…"
            style={{
              flex: 1,
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 10,
              padding: "10px 16px",
              color: "white",
              fontSize: 14,
              outline: "none",
            }}
          />
          {["size", "fraud_prob", "ring_id"].map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: `1px solid ${sortBy === s ? "#7c3aed" : "#334155"}`,
                background: sortBy === s ? "#4c1d95" : "#0f172a",
                color: sortBy === s ? "#c4b5fd" : "#64748b",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {s === "size" ? "Sort: Size" : s === "fraud_prob" ? "Sort: Risk" : "Sort: ID"}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 80, color: "#475569" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
            Analysing graph network and loading rings…
          </div>
        )}

        {error && (
          <div style={{
            background: "#450a0a", border: "1px solid #ef4444",
            borderRadius: 12, padding: 20, color: "#fca5a5", marginBottom: 24,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Ring rows ── */}
        {!loading && !error && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {displayedRings.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
                No fraud rings match your search.
              </div>
            )}

            {displayedRings.map(ring => {
              const size      = ring.member_count ?? 0;
              const variant   = ringSizeVariant(size);
              const fraudProb = ring.fraud_prob ?? 0;
              const score     = ring.mastermind_score ?? 0;
              const isOpen    = expandedId === ring.ring_id;

              return (
                <div key={ring.ring_id}>
                  {/* ── Clickable summary row ── */}
                  <div
                    onClick={() => setExpandedId(isOpen ? null : ring.ring_id)}
                    style={{
                      background: isOpen ? "#0f172a" : "#0a0f1e",
                      border: `1px solid ${isOpen ? "#7c3aed" : "#1e293b"}`,
                      borderRadius: isOpen ? "14px 14px 0 0" : 14,
                      padding: "18px 24px",
                      cursor: "pointer",
                      display: "grid",
                      gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1fr auto",
                      alignItems: "center",
                      gap: 16,
                      transition: "border-color 0.2s",
                    }}
                  >
                    {/* Ring ID */}
                    <div>
                      <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>RING ID</div>
                      <div style={{ fontFamily: "monospace", fontWeight: 700, color: "#e2e8f0", fontSize: 13 }}>
                        {ring.ring_id}
                      </div>
                    </div>

                    {/* Mastermind */}
                    <div>
                      <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>MASTERMIND</div>
                      <div style={{ fontFamily: "monospace", color: "#f472b6", fontSize: 12 }}>
                        {(ring.id || "—").slice(0, 18)}…
                      </div>
                    </div>

                    {/* Size badge */}
                    <div>
                      <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>SIZE</div>
                      <Badge style={{ background: variant.bg, color: variant.text, border: `1px solid ${variant.border}` }}>
                        {variant.label} · {size}
                      </Badge>
                    </div>

                    {/* Network Score */}
                    <div>
                      <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>NETWORK SCORE</div>
                      <div style={{ fontWeight: 700, color: "#f87171" }}>{score.toFixed(3)}</div>
                    </div>

                    {/* Fraud probability */}
                    <div>
                      <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>FRAUD PROB</div>
                      <Badge style={fraudBadgeStyle(fraudProb)}>
                        {(fraudProb * 100).toFixed(1)}%
                      </Badge>
                    </div>

                    {/* Risk bar */}
                    <div>
                      <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>RISK</div>
                      <div style={{ background: "#1e293b", borderRadius: 9999, height: 6, width: 80 }}>
                        <div style={{
                          background: fraudProb > 0.7 ? "#ef4444" : fraudProb > 0.4 ? "#f97316" : "#22c55e",
                          width: `${Math.min(fraudProb * 100, 100)}%`,
                          height: "100%",
                          borderRadius: 9999,
                          transition: "width 0.4s",
                        }} />
                      </div>
                    </div>

                    {/* Expand chevron */}
                    <div style={{
                      fontSize: 18,
                      color: "#475569",
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s",
                    }}>
                      ▾
                    </div>
                  </div>

                  {/* ── Expanded detail panel ── */}
                  {isOpen && <RingDetailPanel ring={ring} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}