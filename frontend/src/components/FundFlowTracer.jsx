/**
 * FundFlowTracer.jsx
 * ------------------
 * Interactive and stable money-flow path tracer.
 * Renders nodes as native colorful circles (matching the Risk Table)
 * and displays rich details on node/link hover in floating tooltips.
 *
 * Light Theme — Premium Banking UI.
 */

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { api } from "../api";

// ─── Colour and Formatting Helpers ───────────────────────────────────────────

function probColor(fp) {
  if (fp > 0.7) return "#FD625E"; // Red
  if (fp > 0.4) return "#F97316"; // Amber
  return "#10B981"; // Green
}

function riskBadge(score) {
  if (score >= 0.8) return { bg: "#FFF5F5", color: "#FD625E", border: "#FD625E", label: "CRITICAL" };
  if (score >= 0.6) return { bg: "#FFFBEB", color: "#F97316", border: "#F97316", label: "HIGH" };
  if (score >= 0.4) return { bg: "#FFFDF0", color: "#D97706", border: "#F2C80F", label: "MEDIUM" };
  return { bg: "#F0FDF9", color: "#10B981", border: "#10B981", label: "LOW" };
}

function formatRupees(amt) {
  if (amt >= 10_000_000) return `₹${(amt / 10_000_000).toFixed(2)} Cr`;
  if (amt >= 100_000) return `₹${(amt / 100_000).toFixed(2)} L`;
  if (amt >= 1_000) return `₹${(amt / 1_000).toFixed(1)} K`;
  return `₹${Number(amt).toLocaleString('en-IN')}`;
}

function formatTimestamp(ts) {
  if (!ts) return "—";
  return ts.replace("T", " ").slice(0, 19);
}

function calculateTimeDelta(currentTs, prevTs) {
  if (!currentTs || !prevTs) return "";
  
  const cleanCurrent = currentTs.includes("T") ? currentTs : currentTs.replace(" ", "T");
  const cleanPrev = prevTs.includes("T") ? prevTs : prevTs.replace(" ", "T");
  
  const current = new Date(cleanCurrent);
  const prev = new Date(cleanPrev);
  
  if (isNaN(current.getTime()) || isNaN(prev.getTime())) return "";
  
  const diffMs = current.getTime() - prev.getTime();
  if (diffMs < 0) return "0s";
  
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) {
    const remainingHours = diffHours % 24;
    return `${diffDays}d ${remainingHours}h`;
  }
  if (diffHours > 0) {
    const remainingMins = diffMins % 60;
    return `${diffHours}h ${remainingMins}m`;
  }
  if (diffMins > 0) {
    const remainingSecs = diffSecs % 60;
    return `${diffMins}m ${remainingSecs}s`;
  }
  return `${diffSecs}s`;
}

// ─── Tooltip Components ────────────────────────────────────────────────────────

function NodeTooltip({ node, position }) {
  if (!node) return null;
  const fp = node.fraud_prob ?? 0;
  return (
    <div style={{
      position:     "fixed",
      left:         position.x + 16,
      top:          position.y - 8,
      background:   "#FFFFFF",
      border:       "1px solid #E2E8F0",
      borderRadius: 12,
      padding:      "16px 20px",
      zIndex:       1000,
      pointerEvents:"none",
      minWidth:     240,
      boxShadow:    "0 4px 16px rgba(0,0,0,0.08)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#0F172A", letterSpacing:"0.05em", marginBottom: 12, display: "flex", alignItems: "center" }}>
        <div style={{
          width: 12, height: 12,
          backgroundColor: node.index === 0 ? "#8B5CF6" : probColor(fp),
          borderRadius: "50%", display: "inline-block", marginRight: 8
        }}/>
        {node.index === 0 ? "FLOW ORIGIN" : `ROUTE NODE (HOP ${node.index})`}
      </div>
      {[
        { label: "ACCOUNT ID", value: node.id, mono: true }, 
        { label: "GNN FRAUD PROB", value: `${(fp * 100).toFixed(2)}%`, color: probColor(fp) },
        { label: "CUMULATIVE RECV", value: formatRupees(node.cumulativeAmount) },
        { label: "RING ID", value: node.ring_id ?? "—", isBadge: true }
      ].map(({ label, value, mono, color, isBadge }) => (
        <div key={label} style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 10, color: "#64748B", fontWeight: 700 }}>{label}</div>
          {isBadge && value !== "—" ? (
            <div style={{ background: "#F3E8FF", border: "1px solid rgba(139, 92, 246, 0.3)", color: "#8B5CF6", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
              {value}
            </div>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: mono ? "monospace" : "inherit", color: color ?? "#0F172A" }}>{value}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function LinkTooltip({ link, position }) {
  if (!link) return null;
  return (
    <div style={{
      position:     "fixed",
      left:         position.x + 16,
      top:          position.y - 8,
      background:   "#FFFFFF",
      border:       "1px solid #E2E8F0",
      borderRadius: 12,
      padding:      "16px 20px",
      zIndex:       1000,
      pointerEvents:"none",
      minWidth:     240,
      boxShadow:    "0 4px 16px rgba(0,0,0,0.08)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#0F172A", letterSpacing:"0.05em", marginBottom: 12, display: "flex", alignItems: "center" }}>
        <div style={{
          width: 12, height: 12,
          backgroundColor: link.is_laundering ? "#FD625E" : "#94A3B8",
          borderRadius: "50%", display: "inline-block", marginRight: 8
        }}/>
        TRANSACTION INFO
      </div>
      {[
        { label: "AMOUNT", value: formatRupees(link.amount), color: link.is_laundering ? "#FD625E" : "#0F172A" }, 
        { label: "TIMESTAMP", value: formatTimestamp(link.timestamp), mono: true },
        { label: "TIME DELTA", value: link.timeDelta || "First Hop", color: "#8B5CF6" },
        { label: "PAYMENT FORMAT", value: link.payment_format || "—" },
        { label: "LAUNDERING FLAG", value: link.is_laundering ? "⚠️ FLAGGED" : "Clean", color: link.is_laundering ? "#FD625E" : "#10B981" }
      ].map(({ label, value, mono, color }) => (
        <div key={label} style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 10, color: "#64748B", fontWeight: 700 }}>{label}</div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: mono ? "monospace" : "inherit", color: color ?? "#0F172A" }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Loading Skeleton ──────────────────────────────────────────────────────────

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

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function FundFlowTracer({ prefilledAccount }) {
  const [accountId, setAccountId] = useState(prefilledAccount || "");
  const [depth, setDepth]         = useState(3);
  const [direction, setDirection] = useState("both");
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState(null);

  // Active path and animation states
  const [selectedPathIndex, setSelectedPathIndex] = useState(0);
  const [activeHop, setActiveHop]                 = useState(-1);
  const [isPlaying, setIsPlaying]                 = useState(false);
  const [playbackSpeed, setPlaybackSpeed]         = useState(2000); // ms per hop
  
  // Tooltip tracking
  const [hoveredNode, setHoveredNode]             = useState(null);
  const [hoveredLink, setHoveredLink]             = useState(null);
  const [mousePos, setMousePos]                   = useState({ x: 0, y: 0 });

  // Width tracking for force graph responsive sizing
  const [graphWidth, setGraphWidth] = useState(700);
  const graphContainerRef = useRef(null);
  const fgRef = useRef(null);

  // Sync prefilled account
  useEffect(() => {
    if (prefilledAccount && prefilledAccount !== accountId) {
      setAccountId(prefilledAccount);
    }
  }, [prefilledAccount]);

  // Track global mouse position for tooltip positioning
  useEffect(() => {
    const onMove = e => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Window resize handler
  useEffect(() => {
    if (graphContainerRef.current) {
      setGraphWidth(graphContainerRef.current.offsetWidth);
    }
    const handleResize = () => {
      if (graphContainerRef.current) {
        setGraphWidth(graphContainerRef.current.offsetWidth);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [result]);

  const trace = async () => {
    if (!accountId.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedPathIndex(0);
    setActiveHop(-1);
    setIsPlaying(false);

    try {
      const r = await api.get(`/api/account/${encodeURIComponent(accountId.trim())}/flow`, {
        params: { depth, direction, max_paths: 20 },
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      setResult(r.data);
      if (r.data?.paths?.length > 0) {
        // Auto play the first path
        setActiveHop(0);
        setIsPlaying(true);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Failed to trace fund flows.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Timer loop for animation
  useEffect(() => {
    if (!isPlaying || !result || !result.paths || result.paths.length === 0) return;
    const path = result.paths[selectedPathIndex];
    if (!path) return;
    
    const maxHops = path.transactions.length;
    const interval = setInterval(() => {
      setActiveHop(prev => {
        if (prev >= maxHops - 1) {
          return 0; // loop back
        }
        return prev + 1;
      });
    }, playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, result, selectedPathIndex, playbackSpeed]);

  // Reset animation if path changes
  const handleSelectPath = (index) => {
    setSelectedPathIndex(index);
    setActiveHop(0);
    setIsPlaying(true);
  };

  // Memoize graph data to keep references stable so nodes don't fly on ticks
  const graphData = useMemo(() => {
    if (!result || !result.paths || result.paths.length === 0) {
      return { nodes: [], links: [] };
    }
    const pathData = result.paths[selectedPathIndex];
    if (!pathData) return { nodes: [], links: [] };

    // Format nodes
    const nodes = pathData.path.map((node, idx) => {
      let cumulativeAmount = 0;
      for (let j = 0; j < idx; j++) {
        cumulativeAmount += pathData.transactions[j]?.amount || 0;
      }

      return {
        id: node.account,
        label: node.account,
        fraud_prob: node.fraud_prob ?? 0,
        ring_id: node.ring_id,
        is_mastermind: node.is_mastermind,
        cumulativeAmount,
        index: idx,
        // Align horizontally centered and fix coordinates to prevent flying
        fx: (idx - (pathData.path.length - 1) / 2) * 230,
        fy: 0,
      };
    });

    // Format links
    const links = pathData.transactions.map((tx, idx) => {
      const timeDelta = idx > 0 
        ? calculateTimeDelta(tx.timestamp, pathData.transactions[idx - 1].timestamp)
        : "";

      return {
        source: tx.from,
        target: tx.to,
        amount: tx.amount,
        timestamp: tx.timestamp,
        timeDelta,
        is_laundering: tx.is_laundering,
        payment_format: tx.payment_format || "TRANSFER",
        hopIndex: idx,
      };
    });

    return { nodes, links };
  }, [result, selectedPathIndex]);

  // Center the camera on data load
  useEffect(() => {
    if (fgRef.current && result && result.paths?.length > 0) {
      setTimeout(() => {
        fgRef.current.zoomToFit(200, 100);
      }, 350);
    }
  }, [selectedPathIndex, result]);

  // Node Color Rule
  const getNodeColor = useCallback((node) => {
    if (node.index === 0) return "#8B5CF6"; // Flow Origin is always purple
    return probColor(node.fraud_prob);
  }, []);

  const activePath = result?.paths[selectedPathIndex];
  const activeTx = activePath?.transactions[activeHop];
  const activeNodeFrom = activePath?.path[activeHop];
  const activeNodeTo = activePath?.path[activeHop + 1];

  const directions = [
    { value: "both",     label: "◂▸ Both",     desc: "Inbound & Outbound" },
    { value: "outbound", label: "▸ Outbound", desc: "Where did money go?" },
    { value: "inbound",  label: "◂ Inbound",  desc: "Where did money come from?" },
  ];

  return (
    <div>
      {/* ── Controls Section ─────────────────────────────────────────── */}
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
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            onKeyDown={e => e.key === "Enter" && trace()}
            placeholder="Enter account ID (e.g. 3c50a53368acc4a9)…"
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

        {/* Direction Toggle */}
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
        </div>
      )}

      {/* ── Result Dashboard ─────────────────────────────────────────── */}
      {result && !loading && (
        <div>
          {/* Metadata Row */}
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
              <span style={{ color: "#64748B", fontWeight: 500 }}>Evaluated candidates: </span>
              <span style={{ fontWeight: 800 }}>{result.candidates_before_filter}</span>
            </div>
            {result.mock && (
              <div style={{
                background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 10,
                padding: "10px 16px", fontSize: 13, fontWeight: 700, color: "#D97706",
              }}>
                ℹ DEMO MOCK MODE (Neo4j Offline)
              </div>
            )}
          </div>

          {result.paths.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "60px 20px",
              background: "#F8FAFC", borderRadius: 14,
              border: "1px dashed #CBD5E1",
            }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>🔍</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
                No Flow Paths Found
              </div>
              <div style={{ fontSize: 14, color: "#64748B", maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
                No transaction paths satisfy the temporal ordering checks from/to this account.
              </div>
            </div>
          ) : (
            /* Split Screen Layout */
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(300px, 1fr) 2fr",
              gap: 24,
              alignItems: "stretch",
            }}>
              
              {/* Left Column: Ranked Paths List */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 600, overflowY: "auto", paddingRight: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 4 }}>
                  Ranked Paths ({result.paths.length})
                </div>
                {result.paths.map((p, idx) => {
                  const isSelected = idx === selectedPathIndex;
                  const badge = riskBadge(p.risk_score);
                  return (
                    <div
                      key={idx}
                      onClick={() => handleSelectPath(idx)}
                      style={{
                        background: isSelected ? "#F8FAFC" : "#FFFFFF",
                        border: isSelected ? "2px solid #8B5CF6" : `1px solid ${badge.border}33`,
                        borderLeft: isSelected ? "6px solid #8B5CF6" : `4px solid ${badge.border}`,
                        borderRadius: 12,
                        padding: "16px 18px",
                        cursor: "pointer",
                        boxShadow: isSelected ? "0 4px 12px rgba(139,92,246,0.1)" : "0 2px 6px rgba(0,0,0,0.02)",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = "#CBD5E1";
                          e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)";
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = `${badge.border}33`;
                          e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.02)";
                        }
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: "50%",
                            background: isSelected ? "#8B5CF6" : badge.bg,
                            color: isSelected ? "#FFFFFF" : badge.color,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 800,
                          }}>
                            {idx + 1}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                            {p.hop_count} Hop{p.hop_count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <span style={{
                          background: badge.bg, color: badge.color,
                          border: `1px solid ${badge.border}`,
                          padding: "1px 6px", borderRadius: 8,
                          fontSize: 9, fontWeight: 800,
                        }}>
                          {badge.label}
                        </span>
                      </div>
                      
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                        <div style={{ fontSize: 11, color: "#64748B" }}>
                          Max Prob: {(p.max_fraud_prob * 100).toFixed(1)}%
                          {p.direction && (
                            <span style={{ marginLeft: 6, fontWeight: 700, color: p.direction === "outbound" ? "#0EA5E9" : "#8B5CF6" }}>
                              {p.direction === "outbound" ? "▸ OUT" : "◂ IN"}
                            </span>
                          )}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: 10, color: "#94A3B8", display: "block" }}>Total Flow</span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{formatRupees(p.total_amount)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Visualizer Canvas & Animation Controls */}
              <div 
                ref={graphContainerRef} 
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E2E8F0",
                  borderRadius: 16,
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.01)",
                }}
              >
                
                {/* Visualizer Header with selected path info */}
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", margin: 0 }}>
                      Flow Path Chain — Rank #{selectedPathIndex + 1}
                    </h3>
                    <p style={{ fontSize: 12, color: "#64748B", margin: "4px 0 0" }}>
                      Risk Score: {activePath?.risk_score.toFixed(4)} · Total Flow: {formatRupees(activePath?.total_amount)}
                    </p>
                  </div>
                  
                  {/* Animation status bubble */}
                  {isPlaying && activeTx && (
                    <div style={{
                      background: "#F5F3FF", border: "1px solid #C4B5FD", borderRadius: 8,
                      padding: "6px 12px", display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <div style={{ width: 8, height: 8, background: "#8B5CF6", borderRadius: "50%", animation: "pulse 1.2s infinite" }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#5B21B6", fontFamily: "monospace" }}>
                        HOP {activeHop + 1}/{activePath.transactions.length} ACTIVE
                      </span>
                    </div>
                  )}
                </div>

                {/* ── Animation Control Panel ── */}
                <div style={{
                  background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12,
                  padding: "16px 20px", marginBottom: 20,
                  display: "flex", flexDirection: "column", gap: 12,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    
                    {/* Controls */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={() => { setActiveHop(0); setIsPlaying(false); }}
                        title="Reset to start"
                        style={{
                          background: "#FFFFFF", border: "1px solid #CBD5E1", borderRadius: 8,
                          width: 34, height: 34, cursor: "pointer", fontSize: 14, display: "flex",
                          alignItems: "center", justifyContent: "center", transition: "all 0.15s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "#F1F5F9"}
                        onMouseLeave={e => e.currentTarget.style.background = "#FFFFFF"}
                      >
                        ⏮
                      </button>
                      <button
                        onClick={() => {
                          setActiveHop(prev => Math.max(0, prev - 1));
                          setIsPlaying(false);
                        }}
                        disabled={activeHop <= 0}
                        title="Previous Hop"
                        style={{
                          background: "#FFFFFF", border: "1px solid #CBD5E1", borderRadius: 8,
                          width: 34, height: 34, cursor: "pointer", fontSize: 14, display: "flex",
                          alignItems: "center", justifyContent: "center", transition: "all 0.15s",
                          opacity: activeHop <= 0 ? 0.5 : 1,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "#F1F5F9"}
                        onMouseLeave={e => e.currentTarget.style.background = "#FFFFFF"}
                      >
                        ◀
                      </button>
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        title={isPlaying ? "Pause animation" : "Play animation"}
                        style={{
                          background: isPlaying ? "#F59E0B" : "#10B981",
                          border: "none", borderRadius: 8, color: "#FFFFFF",
                          padding: "0 16px", height: 34, cursor: "pointer",
                          fontSize: 12, fontWeight: 800, display: "flex",
                          alignItems: "center", gap: 6, transition: "all 0.15s",
                        }}
                      >
                        {isPlaying ? <>⏸ Pause</> : <>▶ Play</>}
                      </button>
                      <button
                        onClick={() => {
                          const maxHops = activePath?.transactions.length || 0;
                          setActiveHop(prev => Math.min(maxHops - 1, prev + 1));
                          setIsPlaying(false);
                        }}
                        disabled={activeHop >= (activePath?.transactions.length || 1) - 1}
                        title="Next Hop"
                        style={{
                          background: "#FFFFFF", border: "1px solid #CBD5E1", borderRadius: 8,
                          width: 34, height: 34, cursor: "pointer", fontSize: 14, display: "flex",
                          alignItems: "center", justifyContent: "center", transition: "all 0.15s",
                          opacity: activeHop >= (activePath?.transactions.length || 1) - 1 ? 0.5 : 1,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "#F1F5F9"}
                        onMouseLeave={e => e.currentTarget.style.background = "#FFFFFF"}
                      >
                        ▶
                      </button>
                    </div>

                    {/* Playback speed buttons */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B", marginRight: 4 }}>Speed:</span>
                      {[
                        { label: "0.5x", value: 3500 },
                        { label: "1x",   value: 2000 },
                        { label: "2x",   value: 900 },
                      ].map(sp => {
                        const isCurrent = playbackSpeed === sp.value;
                        return (
                          <button
                            key={sp.label}
                            onClick={() => setPlaybackSpeed(sp.value)}
                            style={{
                              background: isCurrent ? "#8B5CF6" : "#FFFFFF",
                              border: isCurrent ? "1px solid #8B5CF6" : "1px solid #CBD5E1",
                              color: isCurrent ? "#FFFFFF" : "#64748B",
                              padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                              cursor: "pointer", transition: "all 0.15s",
                            }}
                          >
                            {sp.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active Hop Details Description */}
                  {activeTx ? (
                    <div style={{
                      borderLeft: `4px solid ${activeTx.is_laundering ? "#FD625E" : "#8B5CF6"}`,
                      background: "#FFFFFF", padding: "10px 14px", borderRadius: "0 8px 8px 0",
                      fontSize: 12.5, color: "#0F172A", lineHeight: 1.5,
                    }}>
                      <strong>Hop {activeHop + 1}: </strong>
                      <span style={{ fontFamily: "monospace", color: "#64748B" }}>{(activeNodeFrom?.account || "").slice(0, 8)}…</span>
                      {" sent "}
                      <strong style={{ color: activeTx.is_laundering ? "#FD625E" : "#0F172A" }}>{formatRupees(activeTx.amount)}</strong>
                      {" to "}
                      <span style={{ fontFamily: "monospace", color: "#64748B" }}>{(activeNodeTo?.account || "").slice(0, 8)}…</span>
                      {" via "}<strong>{activeTx.payment_format}</strong>
                      {activeTx.timeDelta && <span> (delta: <strong style={{ color: "#8B5CF6" }}>{activeTx.timeDelta}</strong>)</span>}
                      {activeTx.is_laundering && <span style={{ marginLeft: 8, color: "#FD625E", fontWeight: 800 }}>⚠️ LAUNDERING FLAGGED</span>}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, color: "#64748B", fontStyle: "italic", textAlign: "center" }}>
                      Press Play or select a hop to view flow details and animation
                    </div>
                  )}
                </div>

                {/* ── Force Graph Visualisation Area ── */}
                <div style={{
                  background: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: 12,
                  overflow: "hidden",
                  position: "relative",
                  height: 400,
                }}>
                  <ForceGraph2D
                    ref={fgRef}
                    graphData={graphData}
                    width={graphWidth - 48} // deduct padding
                    height={400}
                    backgroundColor="#F8FAFC"
                    
                    // Native Node Circle styling (identical to RiskTable/GraphViz)
                    nodeColor={getNodeColor}
                    nodeVal={node => node.index === 0 ? 16 : 10}
                    onNodeHover={node => setHoveredNode(node ?? null)}
                    
                    // Native Link lines styling
                    linkColor={link => link.hopIndex === activeHop ? "#8B5CF6" : (link.is_laundering ? "rgba(253, 98, 94, 0.45)" : "rgba(148, 163, 184, 0.25)")}
                    linkWidth={link => link.hopIndex === activeHop ? 3.5 : 1.5}
                    onLinkHover={link => setHoveredLink(link ?? null)}

                    // Arrow settings
                    linkDirectionalArrowLength={6}
                    linkDirectionalArrowColor={link => link.hopIndex === activeHop ? "#8B5CF6" : (link.is_laundering ? "rgba(253, 98, 94, 0.6)" : "rgba(148, 163, 184, 0.4)")}
                    linkDirectionalArrowRelPos={1}
                    
                    // Particles animation
                    linkDirectionalParticles={link => (link.hopIndex === activeHop ? 6 : 0)}
                    linkDirectionalParticleWidth={4}
                    linkDirectionalParticleSpeed={0.012}
                    linkDirectionalParticleColor={link => (link.is_laundering ? "#FD625E" : "#8B5CF6")}
                    
                    // Layout forces adjustment (we want horizontal spacing)
                    cooldownTicks={60}
                    onEngineStop={() => {
                      if (fgRef.current) {
                        fgRef.current.zoomToFit(200, 100);
                      }
                    }}
                  />
                  
                  {/* Legend Overlay */}
                  <div style={{
                    position: "absolute", bottom: 12, left: 12,
                    background: "rgba(255, 255, 255, 0.9)", border: "1px solid #E2E8F0",
                    borderRadius: 8, padding: "8px 12px", zIndex: 10,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "#64748B", letterSpacing: "0.05em", marginBottom: 6 }}>GNN FRAUD RISK</div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#8B5CF6" }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#0F172A" }}>Flow Origin</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FD625E" }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#0F172A" }}>Critical (&gt;70%)</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#F97316" }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#0F172A" }}>High (&gt;40%)</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#0F172A" }}>Low</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}
        </div>
      )}

      {/* Floating Tooltips */}
      <NodeTooltip node={hoveredNode} position={mousePos} />
      <LinkTooltip link={hoveredLink} position={mousePos} />

      {/* ── Empty State ──────────────────────────────────────────────── */}
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
            Interactive Fund Flow Tracer
          </div>
          <div style={{ fontSize: 14, color: "#64748B", maxWidth: 450, margin: "0 auto", lineHeight: 1.6 }}>
            Enter an Account ID and click <strong>Trace Flows</strong> to visualize where its money went and where it came from.
            Observe the hop-by-hop money flows, GNN fraud scores, and time deltas.
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
