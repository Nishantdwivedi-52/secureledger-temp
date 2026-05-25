/**
 * GraphViz.jsx
 * ------------
 * 2-hop account network visualisation with:
 *  - Rich hover tooltip showing full account details
 *  - Legend overlay
 *  - Graceful empty state
 *  - Laundering edge highlighting with particles
 *  - Centre node highlighted differently
 */

import { useEffect, useState, useCallback, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import axios from "axios";

const API =
"https://lesser-grandkid-oxymoron.ngrok-free.dev";

// ─── colour helpers ────────────────────────────────────────────────────────────

function nodeColor(node) {
  if (node.isCenter)      return "#a855f7";   // purple — the selected account
  if (node.fraud_prob > 0.8) return "#ef4444";
  if (node.fraud_prob > 0.6) return "#f97316";
  if (node.fraud_prob > 0.4) return "#eab308";
  return "#22c55e";
}

// ─── tooltip component ─────────────────────────────────────────────────────────

function NodeTooltip({ node, position }) {
  if (!node) return null;

  return (
    <div style={{
      position:     "fixed",
      left:         position.x + 16,
      top:          position.y - 8,
      background:   "rgba(9,11,28,0.97)",
      border:       `1px solid ${nodeColor(node)}`,
      borderRadius: 12,
      padding:      "14px 18px",
      zIndex:       1000,
      pointerEvents:"none",
      minWidth:     220,
      boxShadow:    `0 0 20px ${nodeColor(node)}40`,
    }}>
      {/* Header */}
      <div style={{
        fontSize:     10,
        fontWeight:   700,
        color:        nodeColor(node),
        letterSpacing:"0.1em",
        marginBottom: 10,
      }}>
        {node.isCenter ? "🎯 INVESTIGATED ACCOUNT" : node.is_mastermind ? "👑 MASTERMIND" : "🔍 ACCOUNT"}
      </div>

      {/* Fields */}
      {[
        { label: "Account ID",   value: node.id,                                    mono: true  },
        { label: "Fraud Prob",   value: `${((node.fraud_prob  ?? 0) * 100).toFixed(2)}%`, color: node.fraud_prob  > 0.7 ? "#f87171" : "#94a3b8" },
        { label: "Risk Score",   value: `${((node.risk_score  ?? 0) * 100).toFixed(2)}%`                                                         },
        { label: "Community",    value: node.community    ?? "—"                                                                                  },
        { label: "Ring ID",      value: node.ring_id      ?? "—",    color: "#a78bfa"                                                            },
      ].map(({ label, value, mono, color }) => (
        <div key={label} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: "#475569", marginBottom: 2 }}>{label}</div>
          <div style={{
            fontSize:    12,
            fontWeight:  600,
            fontFamily:  mono ? "monospace" : "inherit",
            color:       color ?? "#e2e8f0",
            wordBreak:   "break-all",
          }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── legend ───────────────────────────────────────────────────────────────────

function GraphLegend() {
  return (
    <div style={{
      position:   "absolute",
      bottom:     12,
      left:       12,
      background: "rgba(9,11,28,0.9)",
      border:     "1px solid #1e293b",
      borderRadius: 10,
      padding:    "12px 14px",
      zIndex:     10,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", marginBottom: 8, letterSpacing: "0.08em" }}>
        LEGEND
      </div>
      {[
        { color: "#a855f7", label: "Investigated account" },
        { color: "#ef4444", label: "Critical risk (>80%)" },
        { color: "#f97316", label: "High risk (>60%)"     },
        { color: "#eab308", label: "Medium risk (>40%)"   },
        { color: "#22c55e", label: "Low risk"             },
      ].map(({ color, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: color, boxShadow: `0 0 6px ${color}`,
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 10, color: "#94a3b8" }}>{label}</span>
        </div>
      ))}
      <div style={{ borderTop: "1px solid #1e293b", marginTop: 8, paddingTop: 8 }}>
        {[
          { color: "#ef4444", label: "Laundering edge"  },
          { color: "#334155", label: "Normal edge"      },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 18, height: 2, background: color, borderRadius: 1 }} />
            <span style={{ fontSize: 10, color: "#94a3b8" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function GraphViz({ accountId }) {
  const [graph,        setGraph]        = useState({ nodes: [], links: [] });
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [hoveredNode,  setHoveredNode]  = useState(null);
  const [mousePos,     setMousePos]     = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // ── Track mouse for tooltip positioning ───────────────────────────────────
  useEffect(() => {
    const onMove = e => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // ── Fetch subgraph ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    setError(null);

    axios.get(
  `${API}/api/subgraph/${accountId}`,
  {
    headers: {
      "ngrok-skip-browser-warning": "true"
    }
  }
)
      .then(({ data }) => {
        const rawNodes = data.nodes || [];
        const rawLinks = data.links || data.edges || [];

        setGraph({
          nodes: rawNodes.map(n => ({
            ...n,
            id:         n.id,
            isCenter:   n.id === accountId,
            fraud_prob: n.fraud_prob  ?? n.risk_score ?? 0,
            risk_score: n.risk_score  ?? 0,
          })),
          links: rawLinks.map(l => ({
            ...l,
            source:         l.source,
            target:         l.target,
            is_laundering:  l.is_laundering ?? false,
            amount:         l.amount        ?? 0,
          })),
        });
      })
      .catch(err => {
        console.error("GraphViz fetch error:", err);
        setError("Failed to load graph data.");
      })
      .finally(() => setLoading(false));
  }, [accountId]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        height:         500,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        color:          "#475569",
        gap:            16,
      }}>
        <div style={{
          width:        48, height: 48, borderRadius: "50%",
          border:       "3px solid #334155",
          borderTop:    "3px solid #a855f7",
          animation:    "spin 0.8s linear infinite",
        }} />
        <span style={{ fontSize: 14 }}>Loading network graph…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{
        height:         500,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        color:          "#ef4444",
        gap:            12,
      }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <div style={{ fontSize: 14, color: "#fca5a5" }}>{error}</div>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (graph.nodes.length === 0) {
    return (
      <div style={{
        height:         500,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        gap:            12,
        color:          "#334155",
      }}>
        <div style={{ fontSize: 52, opacity: 0.4 }}>🕸</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#475569" }}>
          No network data found
        </div>
        <div style={{ fontSize: 13, maxWidth: 300, textAlign: "center" }}>
          This account has no transaction connections in the graph database.
        </div>
      </div>
    );
  }

  // ── Graph stats overlay ────────────────────────────────────────────────────
  const launderingEdges = graph.links.filter(l => l.is_laundering).length;

  return (
    <div ref={containerRef} style={{ position: "relative", borderRadius: 12, overflow: "hidden" }}>
      {/* Stats bar */}
      <div style={{
        position:   "absolute",
        top:        12,
        left:       12,
        zIndex:     10,
        display:    "flex",
        gap:        8,
        flexWrap:   "wrap",
      }}>
        {[
          { label: `${graph.nodes.length} nodes`,            color: "#94a3b8" },
          { label: `${graph.links.length} edges`,            color: "#94a3b8" },
          { label: `${launderingEdges} laundering`,          color: launderingEdges > 0 ? "#ef4444" : "#334155" },
        ].map(({ label, color }) => (
          <div key={label} style={{
            background:   "rgba(9,11,28,0.85)",
            border:       "1px solid #1e293b",
            borderRadius: 8,
            padding:      "4px 10px",
            fontSize:     11,
            color,
            fontWeight:   600,
          }}>
            {label}
          </div>
        ))}
      </div>

      {/* Force graph */}
      <ForceGraph2D
        graphData={graph}
        width={containerRef.current?.offsetWidth || 1100}
        height={500}
        backgroundColor="#000010"

        /* Nodes */
        nodeColor={nodeColor}
        nodeVal={n =>
          n.isCenter
            ? 30
            : Math.max((n.fraud_prob ?? 0) * 25, 5)
        }
        nodeLabel={() => ""}   // we handle tooltip ourselves
        nodeCanvasObjectMode={n => n.isCenter ? "before" : undefined}
        nodeCanvasObject={(node, ctx, scale) => {
          // Draw a glowing ring around the centre node
          ctx.beginPath();
          ctx.arc(node.x, node.y, 18 / scale, 0, 2 * Math.PI);
          ctx.strokeStyle = "#a855f7";
          ctx.lineWidth   = 2 / scale;
          ctx.shadowColor = "#a855f7";
          ctx.shadowBlur  = 15;
          ctx.stroke();
          ctx.shadowBlur  = 0;
        }}

        onNodeHover={node => setHoveredNode(node ?? null)}

        /* Links */
        linkColor={l => l.is_laundering ? "#ef4444" : "#1e293b"}
        linkWidth={l => l.is_laundering ? 2 : 1}
        linkDirectionalParticles={l => l.is_laundering ? 4 : 0}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleColor={() => "#ef4444"}

        /* Physics */
        cooldownTicks={200}
        d3VelocityDecay={0.4}
        d3AlphaDecay={0.02}

        /* Interaction */
        enableNodeDrag
        enableZoomInteraction
        enablePanInteraction
      />

      {/* Legend */}
      <GraphLegend />

      {/* Tooltip */}
      <NodeTooltip node={hoveredNode} position={mousePos} />
    </div>
  );
}