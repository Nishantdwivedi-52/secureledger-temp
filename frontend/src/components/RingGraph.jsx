/**
 * RingGraph.jsx
 * -------------
 * Force-directed fraud ring visualisation
 * Light Theme Edition with native rendering and stable physics.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
});

const PG_LIMIT = 60;

// ─── color palette (harmonised with GraphViz) ───────────────────────────────────

function nodeColor(node) {
  if (node.is_mastermind)   return "#8B5CF6";   // purple — the mastermind
  if (node.fraud_prob > 0.8) return "#FD625E";   // critical risk
  if (node.fraud_prob > 0.6) return "#F97316";   // high risk
  if (node.fraud_prob > 0.4) return "#F2C80F";   // medium risk
  return "#01B8AA";                              // low risk
}

// ─── merge graph data keeping D3 references intact ──────────────────────────────

function mergeGraphData(existing, incoming) {
  const nodeMap = new Map(existing.nodes.map(n => [n.id, n]));
  
  incoming.nodes.forEach(n => {
    if (nodeMap.has(n.id)) {
      // Mutate in place to preserve the exact object reference that existing links point to
      const existingNode = nodeMap.get(n.id);
      Object.assign(existingNode, n);
    } else {
      nodeMap.set(n.id, n);
    }
  });

  const linkSet = new Set(existing.links.map(l => {
    const srcId = l.source?.id ?? l.source;
    const tgtId = l.target?.id ?? l.target;
    return `${srcId}→${tgtId}`;
  }));

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

// ─── hover tooltip component (identical to GraphViz) ────────────────────────────

function NodeTooltip({ node, position }) {
  if (!node) return null;
  const prob = node.fraud_prob ?? 0;
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
        {node.is_mastermind ? (
          <><div style={{width:12,height:12,backgroundColor:"#8B5CF6",borderRadius:"50%",display:"inline-block",marginRight:8}}/> MASTERMIND</>
        ) : (
          <><div style={{width:12,height:12,backgroundColor:"#01B8AA",borderRadius:3,display:"inline-block",marginRight:8}}/> RING MEMBER</>
        )}
      </div>
      {[{ label: "ACCOUNT ID", value: node.id, mono: true }, 
        { label: "FRAUD PROB", value: `${(prob * 100).toFixed(2)}%`, color: prob > 0.7 ? "#FD625E" : "#0F172A" },
        { label: "ANOMALY SCORE", value: `${((node.anomaly_score ?? 0) * 100).toFixed(2)}%` },
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

// ─── sidebar component ─────────────────────────────────────────────────────────

function NodeSidebar({ node, onClose }) {
  if (!node) return null;
  const prob = node.fraud_prob ?? 0;
  const color = nodeColor(node);
  return (
    <div style={{ position: "absolute", top: 16, right: 16, width: 280, background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, padding: 24, zIndex: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", fontWeight: 800, color: "#0F172A", fontSize: 14 }}>
          {node.is_mastermind ? (
            <><div style={{width:14,height:14,backgroundColor:"#8B5CF6",borderRadius:"50%",display:"inline-block",marginRight:6}}/> Mastermind</>
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
      {[{ label: "ACCOUNT ID", value: node.id, mono: true }, { label: "FRAUD PROBABILITY", value: `${(prob * 100).toFixed(2)}%`, color }].map(({ label, value, mono, color: c }) => (
        <div key={label} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: mono ? "monospace" : "inherit", color: c ?? "#0F172A" }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── legend component (identical to GraphViz) ───────────────────────────────────

function GraphLegend() {
  return (
    <div style={{ position: "absolute", bottom: 16, left: 16, background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 18px", zIndex: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#0F172A", marginBottom: 10, letterSpacing: "0.05em" }}>LEGEND</div>
      {[ 
        { color: "#8B5CF6", label: "Mastermind" }, 
        { color: "#FD625E", label: "Critical risk (>80%)" }, 
        { color: "#F97316", label: "High risk (>60%)" }, 
        { color: "#F2C80F", label: "Medium risk (>40%)" }, 
        { color: "#01B8AA", label: "Low risk" } 
      ].map(({ color, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>{label}</span>
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
  
  // Interaction & mouse tracking states
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const graphRef = useRef();
  const containerRef = useRef();
  const [width, setWidth] = useState(1100);
  
  const forcesConfigured = useRef(false);

  // Mouse move listener for floating tooltip
  useEffect(() => {
    const onMove = e => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

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

  // Handle window resizing
  useEffect(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.offsetWidth);
    }
    const handleResize = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.offsetWidth);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Configure forces exactly ONCE on initial load to avoid simulation resets on state updates
  useEffect(() => {
    if (graphRef.current && graph.nodes.length > 0 && !forcesConfigured.current) {
      graphRef.current.d3Force("charge").strength(-350);
      graphRef.current.d3Force("link").distance(95);
      forcesConfigured.current = true;
    }
  }, [graph]);

  return (
    <div ref={containerRef} style={{ position: "relative", background: "#FFFFFF", borderRadius: 16, overflow: "hidden", border: "1px solid #E2E8F0" }}>
      <ForceGraph2D
        ref={graphRef}
        graphData={graph}
        width={width}
        height={500}
        backgroundColor="#F8FAFC"
        
        // Native rendering matching GraphViz in RiskTable
        nodeColor={nodeColor}
        nodeVal={node => node.is_mastermind ? 28 : Math.max((node.fraud_prob ?? 0) * 18, 8)}
        
        onNodeHover={node => setHoveredNode(node ?? null)}
        onNodeClick={node => setSelectedNode(prev => prev?.id === node.id ? null : node)}
        
        // Link lines styling (thick and highly visible)
        linkColor={link => link.is_laundering ? "rgba(253, 98, 94, 0.75)" : "rgba(148, 163, 184, 0.6)"}
        linkWidth={2}
        
        // Directional arrow settings
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={1}
        
        linkLabel={link => `Amount: ₹${Number(link.amount || 0).toLocaleString('en-IN')}`}
      />
      
      <GraphLegend />
      <NodeTooltip node={hoveredNode} position={mousePos} />
      <NodeSidebar node={selectedNode} onClose={() => setSelectedNode(null)} />
      
      {/* Pagination Load More Overlay */}
      {hasMore && (
        <button
          onClick={() => fetchPage(skip)}
          disabled={loading}
          style={{
            position: "absolute", bottom: 16, right: 16,
            background: "#FFFFFF", border: "1px solid #CBD5E1",
            color: "#0F172A", padding: "8px 16px", borderRadius: 8,
            fontSize: 12, fontWeight: 700, cursor: loading ? "wait" : "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.05)", transition: "all 0.15s",
            zIndex: 10,
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"}
          onMouseLeave={e => e.currentTarget.style.background = "#FFFFFF"}
        >
          {loading ? "Loading..." : "Load More Nodes"}
        </button>
      )}
    </div>
  );
}