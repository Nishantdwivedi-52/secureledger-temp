/**
 * RingGraph.jsx
 * -------------
 * Force-directed fraud ring visualisation
 */

import { useEffect, useState, useCallback, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import axios from 'axios';

// FIXED: Changed 'export default' to 'export const'
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
});

const PG_LIMIT = 60;

// ─── helpers ──────────────────────────────────────────────────────────────────

function nodeColor(node) {
  if (node.is_mastermind) return "#a855f7";
  if (node.fraud_prob > 0.8) return "#ef4444";
  if (node.fraud_prob > 0.6) return "#f97316";
  if (node.fraud_prob > 0.4) return "#eab308";
  return "#22c55e";
}

function mergeGraphData(existing, incoming) {
  const nodeMap = new Map(existing.nodes.map(n => [n.id, n]));
  incoming.nodes.forEach(n => nodeMap.set(n.id, n));

  const linkSet  = new Set(existing.links.map(l => `${l.source?.id ?? l.source}→${l.target?.id ?? l.target}`));
  const newLinks = incoming.links.filter(l => {
    const key = `${l.source}→${l.target}`;
    if (linkSet.has(key)) return false;
    linkSet.add(key);
    return true;
  });

  return {
    nodes: Array.from(nodeMap.values()),
    links: [...existing.links, ...newLinks],
  };
}

// ─── components (NodeSidebar, Legend) ──────────────────────────────────────────
// [Keep your existing NodeSidebar and Legend components here...]
function NodeSidebar({ node, onClose }) {
  if (!node) return null;
  const prob = node.fraud_prob ?? 0;
  const color = nodeColor(node);
  return (
    <div style={{ position: "absolute", top: 16, right: 16, width: 280, background: "rgba(9,11,28,0.97)", border: `1px solid ${color}`, borderRadius: 16, padding: 20, zIndex: 20, boxShadow: `0 0 30px ${color}40` }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontWeight: 700, color, fontSize: 14 }}>{node.is_mastermind ? "👑 Mastermind" : "🔍 Account"}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18 }}>✕</button>
      </div>
      {[{ label: "Account ID", value: node.id, mono: true }, { label: "Fraud Probability", value: `${(prob * 100).toFixed(2)}%`, color: prob > 0.7 ? "#ef4444" : "#fb923c" }].map(({ label, value, mono, color: c }) => (
        <div key={label} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#475569" }}>{label}</div>
          <div style={{ fontSize: 13, fontWeight: 600, fontFamily: mono ? "monospace" : "inherit", color: c ?? "#e2e8f0" }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div style={{ position: "absolute", bottom: 16, left: 16, background: "rgba(9,11,28,0.9)", border: "1px solid #1e293b", borderRadius: 12, padding: "12px 16px", zIndex: 20 }}>
      {[{ color: "#a855f7", label: "Mastermind" }, { color: "#ef4444", label: "High Risk" }].map(({ color, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function RingGraph() {
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const graphRef = useRef();

  const fetchPage = useCallback(async (currentSkip) => {
    setLoading(true);
    try {
      // Use the named export 'api'
      const { data } = await api.get('/api/rings/graph', {
        params: { skip: currentSkip, limit: PG_LIMIT },
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      setGraph(prev => mergeGraphData(prev, data));
      setHasMore(data.has_more ?? false);
      setSkip(currentSkip + PG_LIMIT);
    } catch (err) {
      console.error("RingGraph fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPage(0); }, [fetchPage]);

  return (
    <div style={{ position: "relative", background: "#000", borderRadius: 16, overflow: "hidden" }}>
      <ForceGraph2D
        ref={graphRef}
        graphData={graph}
        width={1280}
        height={820}
        nodeColor={nodeColor}
        onNodeClick={node => setSelectedNode(prev => prev?.id === node.id ? null : node)}
      />
      <Legend />
      <NodeSidebar node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
}