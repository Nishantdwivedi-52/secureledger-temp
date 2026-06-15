/**
 * GraphViz.jsx
 * ------------
 * 2-hop account network visualisation
 * Light Theme Edition
 */

import { useEffect, useState, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
});

// ─── colour helpers ────────────────────────────────────────────────────────────

function nodeColor(node) {
  if (node.isCenter)      return "#8B5CF6";   // purple — the selected account
  if (node.fraud_prob > 0.8) return "#FD625E";
  if (node.fraud_prob > 0.6) return "#F97316";
  if (node.fraud_prob > 0.4) return "#F2C80F";
  return "#01B8AA";
}

// ─── tooltip component ─────────────────────────────────────────────────────────

function NodeTooltip({ node, position }) {
  if (!node) return null;
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
        {node.isCenter ? (
          <><div style={{width:12,height:12,backgroundColor:"#8B5CF6",borderRadius:"50%",display:"inline-block",marginRight:8}}/> INVESTIGATED ACCOUNT</>
        ) : node.is_mastermind ? (
          <><div style={{width:12,height:12,backgroundColor:"#F2C80F",borderRadius:"50%",display:"inline-block",marginRight:8}}/> MASTERMIND</>
        ) : (
          <><div style={{width:12,height:12,backgroundColor:"#01B8AA",borderRadius:3,display:"inline-block",marginRight:8}}/> ACCOUNT</>
        )}
      </div>
      {[{ label: "ACCOUNT ID", value: node.id, mono: true }, 
        { label: "FRAUD PROB", value: `${((node.fraud_prob ?? 0) * 100).toFixed(2)}%`, color: node.fraud_prob > 0.7 ? "#FD625E" : "#0F172A" },
        { label: "RISK SCORE", value: `${((node.risk_score ?? 0) * 100).toFixed(2)}%` },
        { label: "COMMUNITY", value: node.community ?? "—" },
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

// ─── legend ───────────────────────────────────────────────────────────────────

function GraphLegend() {
  return (
    <div style={{ position: "absolute", bottom: 12, left: 12, background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 18px", zIndex: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#0F172A", marginBottom: 10, letterSpacing: "0.05em" }}>LEGEND</div>
      {[ { color: "#8B5CF6", label: "Investigated account" }, { color: "#FD625E", label: "Critical risk (>80%)" }, { color: "#F97316", label: "High risk (>60%)" }, { color: "#F2C80F", label: "Medium risk (>40%)" }, { color: "#01B8AA", label: "Low risk" } ].map(({ color, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>{label}</span>
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

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 500, background: "#F8FAFC", borderRadius: 12, border: "1px solid #E2E8F0" }}>
      <div style={{ width: 32, height: 32, border: "3px solid #E2E8F0", borderTop: "3px solid #01B8AA", borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: 16 }} />
      <div style={{ color: "#64748B", fontWeight: 600, fontSize: 14 }}>Loading network graph…</div>
      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
  if (error) return <div style={{ height: 500, display: "flex", alignItems: "center", justifyContent: "center", color: "#FD625E", background: "#FFF5F5", borderRadius: 12, border: "1px solid #FD625E", fontWeight: 600 }}>System Error: {error}</div>;
  if (graph.nodes.length === 0) return <div style={{ height: 500, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B", background: "#F8FAFC", borderRadius: 12, border: "1px dashed #CBD5E1", fontWeight: 600 }}>No network data found for this account.</div>;

  return (
    <div ref={containerRef} style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid #E2E8F0" }}>
      <ForceGraph2D
        graphData={graph}
        width={containerRef.current?.offsetWidth || 1100}
        height={500}
        backgroundColor="#F8FAFC"
        nodeColor={nodeColor}
        nodeVal={n => n.isCenter ? 30 : Math.max((n.fraud_prob ?? 0) * 25, 5)}
        linkColor={() => "rgba(100, 116, 139, 0.4)"}
        linkWidth={1.5}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        onNodeHover={node => setHoveredNode(node ?? null)}
      />
      <GraphLegend />
      <NodeTooltip node={hoveredNode} position={mousePos} />
    </div>
  );
}