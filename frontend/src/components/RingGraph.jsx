/**
 * RingGraph.jsx
 * -------------
 * Force-directed fraud ring visualisation
 * Light Theme Edition.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
});

const PG_LIMIT = 60;

function nodeColor(node) {
  if (node.is_mastermind) return "#8B5CF6";
  if (node.fraud_prob > 0.8) return "#FD625E";
  if (node.fraud_prob > 0.6) return "#F2C80F";
  if (node.fraud_prob > 0.4) return "#F2C80F";
  return "#01B8AA";
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

function NodeSidebar({ node, onClose }) {
  if (!node) return null;
  const prob = node.fraud_prob ?? 0;
  const color = nodeColor(node);
  return (
    <div style={{ position: "absolute", top: 16, right: 16, width: 280, background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, padding: 24, zIndex: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", fontWeight: 800, color: "#0F172A", fontSize: 14 }}>
          {node.is_mastermind ? (
            <><div style={{width:14,height:14,backgroundColor:"#F2C80F",borderRadius:"50%",display:"inline-block",marginRight:6}}/> Mastermind</>
          ) : (
            <><div style={{width:14,height:14,backgroundColor:"#01B8AA",borderRadius:4,display:"inline-block",marginRight:6}}/> Account</>
          )}
        </div>
        <button 
          onClick={onClose} 
          style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#64748B", cursor: "pointer", fontSize: 12, fontWeight: 700, width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#E2E8F0"; e.currentTarget.style.color = "#0F172A"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#F8FAFC"; e.currentTarget.style.color = "#64748B"; }}
        >✕</button>
      </div>
      {[{ label: "ACCOUNT ID", value: node.id, mono: true }, { label: "FRAUD PROBABILITY", value: `${(prob * 100).toFixed(2)}%`, color: prob > 0.7 ? "#FD625E" : (prob > 0.4 ? "#F2C80F" : "#01B8AA") }].map(({ label, value, mono, color: c }) => (
        <div key={label} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: mono ? "monospace" : "inherit", color: c ?? "#0F172A" }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div style={{ position: "absolute", bottom: 16, left: 16, background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 20px", zIndex: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
      {[{ color: "#8B5CF6", label: "Mastermind" }, { color: "#FD625E", label: "High Risk" }, { color: "#F2C80F", label: "Medium Risk" }, { color: "#01B8AA", label: "Low Risk" }].map(({ color, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: color }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

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
    <div style={{ position: "relative", background: "#FFFFFF", borderRadius: 16, overflow: "hidden" }}>
      <ForceGraph2D
        ref={graphRef}
        graphData={graph}
        width={1280}
        height={820}
        nodeColor={nodeColor}
        onNodeClick={node => setSelectedNode(prev => prev?.id === node.id ? null : node)}
        linkColor={() => "rgba(100, 116, 139, 0.4)"}
        linkWidth={1.5}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkLabel={link => 'Amount: $' + (link.amount || '0')}
      />
      <Legend />
      <NodeSidebar node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
}