/**
 * GraphViz.jsx
 * ------------
 * 2-hop account network visualisation
 */

import { useEffect, useState, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import axios from 'axios';

// FIXED: Changed 'export default' to 'export const'
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
});

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
      <div style={{ fontSize: 10, fontWeight: 700, color: nodeColor(node), letterSpacing:"0.1em", marginBottom: 10 }}>
        {node.isCenter ? "🎯 INVESTIGATED ACCOUNT" : node.is_mastermind ? "👑 MASTERMIND" : "🔍 ACCOUNT"}
      </div>
      {[{ label: "Account ID", value: node.id, mono: true }, 
        { label: "Fraud Prob", value: `${((node.fraud_prob ?? 0) * 100).toFixed(2)}%`, color: node.fraud_prob > 0.7 ? "#f87171" : "#94a3b8" },
        { label: "Risk Score", value: `${((node.risk_score ?? 0) * 100).toFixed(2)}%` },
        { label: "Community", value: node.community ?? "—" },
        { label: "Ring ID", value: node.ring_id ?? "—", color: "#a78bfa" }
      ].map(({ label, value, mono, color }) => (
        <div key={label} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: "#475569", marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 12, fontWeight: 600, fontFamily: mono ? "monospace" : "inherit", color: color ?? "#e2e8f0" }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── legend ───────────────────────────────────────────────────────────────────

function GraphLegend() {
  return (
    <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(9,11,28,0.9)", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 14px", zIndex: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", marginBottom: 8, letterSpacing: "0.08em" }}>LEGEND</div>
      {[ { color: "#a855f7", label: "Investigated account" }, { color: "#ef4444", label: "Critical risk (>80%)" }, { color: "#f97316", label: "High risk (>60%)" }, { color: "#eab308", label: "Medium risk (>40%)" }, { color: "#22c55e", label: "Low risk" } ].map(({ color, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
          <span style={{ fontSize: 10, color: "#94a3b8" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function GraphViz({ accountId }) {
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  useEffect(() => {
    const onMove = e => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    // Use the named export 'api' defined at the top
    api.get(`/api/subgraph/${accountId}`, { headers: { "ngrok-skip-browser-warning": "true" } })
      .then(({ data }) => {
        setGraph({
          nodes: (data.nodes || []).map(n => ({ ...n, isCenter: n.id === accountId, fraud_prob: n.fraud_prob ?? n.risk_score ?? 0 })),
          links: (data.links || data.edges || []).map(l => ({ ...l, is_laundering: l.is_laundering ?? false })),
        });
      })
      .catch(() => setError("Failed to load graph data."))
      .finally(() => setLoading(false));
  }, [accountId]);

  if (loading) return <div>Loading network graph…</div>;
  if (error) return <div>{error}</div>;
  if (graph.nodes.length === 0) return <div>No network data found</div>;

  return (
    <div ref={containerRef} style={{ position: "relative", borderRadius: 12, overflow: "hidden" }}>
      <ForceGraph2D
        graphData={graph}
        width={containerRef.current?.offsetWidth || 1100}
        height={500}
        backgroundColor="#000010"
        nodeColor={nodeColor}
        nodeVal={n => n.isCenter ? 30 : Math.max((n.fraud_prob ?? 0) * 25, 5)}
        onNodeHover={node => setHoveredNode(node ?? null)}
      />
      <GraphLegend />
      <NodeTooltip node={hoveredNode} position={mousePos} />
    </div>
  );
}