/**
 * RingGraph.jsx
 * -------------
 * Force-directed fraud ring visualisation with:
 *  - Paginated loading (Load More) using skip/limit
 *  - Node click → rich detail sidebar instead of alert()
 *  - Legend overlay
 *  - Link colour by laundering flag
 */

import { useEffect, useState, useCallback, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import axios from "axios";

const API      = "http://127.0.0.1:8000";
const PG_LIMIT = 60;      // nodes per page — matches backend default

// ─── helpers ──────────────────────────────────────────────────────────────────

function nodeColor(node) {
  if (node.is_mastermind) return "#a855f7";
  if (node.fraud_prob > 0.8) return "#ef4444";
  if (node.fraud_prob > 0.6) return "#f97316";
  if (node.fraud_prob > 0.4) return "#eab308";
  return "#22c55e";
}

function mergeGraphData(existing, incoming) {
  // Deduplicate nodes and links when adding new pages
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

// ─── node detail sidebar ───────────────────────────────────────────────────────

function NodeSidebar({ node, onClose }) {
  if (!node) return null;

  const prob = node.fraud_prob ?? 0;
  const color = nodeColor(node);

  return (
    <div style={{
      position: "absolute",
      top: 16,
      right: 16,
      width: 280,
      background: "rgba(9,11,28,0.97)",
      border: `1px solid ${color}`,
      borderRadius: 16,
      padding: 20,
      zIndex: 20,
      boxShadow: `0 0 30px ${color}40`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontWeight: 700, color, fontSize: 14 }}>
          {node.is_mastermind ? "👑 Mastermind" : "🔍 Account"}
        </span>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: "#64748b",
          cursor: "pointer", fontSize: 18, lineHeight: 1,
        }}>✕</button>
      </div>

      {[
        { label: "Account ID",       value: node.id,                                  mono: true },
        { label: "Fraud Probability",value: `${(prob * 100).toFixed(2)}%`,            color: prob > 0.7 ? "#ef4444" : "#fb923c" },
        { label: "Anomaly Score",    value: node.anomaly_score?.toFixed(4) ?? "—"                },
        { label: "Ring ID",          value: node.ring_id ?? "—",                      color: "#a78bfa" },
        { label: "Mastermind",       value: node.is_mastermind ? "YES" : "No",        color: node.is_mastermind ? "#a855f7" : "#64748b" },
      ].map(({ label, value, mono, color: c }) => (
        <div key={label} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>{label}</div>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            fontFamily: mono ? "monospace" : "inherit",
            color: c ?? "#e2e8f0",
            wordBreak: "break-all",
          }}>
            {value}
          </div>
        </div>
      ))}

      {/* Fraud probability bar */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>RISK LEVEL</div>
        <div style={{ background: "#1e293b", borderRadius: 9999, height: 8 }}>
          <div style={{
            width: `${Math.min(prob * 100, 100)}%`,
            height: "100%",
            background: color,
            borderRadius: 9999,
            transition: "width 0.5s",
            boxShadow: `0 0 8px ${color}`,
          }} />
        </div>
      </div>
    </div>
  );
}

// ─── legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { color: "#a855f7", label: "Mastermind"    },
    { color: "#ef4444", label: "High Risk >80%"},
    { color: "#f97316", label: "Med Risk >60%" },
    { color: "#eab308", label: "Low Risk >40%" },
    { color: "#22c55e", label: "Clean"         },
  ];
  return (
    <div style={{
      position: "absolute",
      bottom: 16,
      left: 16,
      background: "rgba(9,11,28,0.9)",
      border: "1px solid #1e293b",
      borderRadius: 12,
      padding: "12px 16px",
      zIndex: 20,
    }}>
      {items.map(({ color, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function RingGraph() {
  const [graph,       setGraph]       = useState({ nodes: [], links: [] });
  const [skip,        setSkip]        = useState(0);
  const [hasMore,     setHasMore]     = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [selectedNode,setSelectedNode]= useState(null);
  const graphRef = useRef();

  // ── fetch one page ──────────────────────────────────────────────────────────
  const fetchPage = useCallback(async (currentSkip) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/rings/graph`, {
        params: { skip: currentSkip, limit: PG_LIMIT },
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

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", background: "#000", borderRadius: 16, overflow: "hidden" }}>
      <ForceGraph2D
        ref={graphRef}
        graphData={graph}
        width={1280}
        height={820}
        backgroundColor="#000010"

        /* Nodes */
        nodeColor={nodeColor}
        nodeLabel={n => `${n.id}\nFraud: ${((n.fraud_prob ?? 0) * 100).toFixed(1)}%\nRing: ${n.ring_id ?? "—"}`}
        nodeVal={n => Math.max((n.fraud_prob ?? 0) * 40, n.is_mastermind ? 25 : 6)}
        nodeCanvasObjectMode={() => "after"}
        nodeCanvasObject={(node, ctx, globalScale) => {
          // Draw mastermind crown label
          if (node.is_mastermind && globalScale > 0.8) {
            ctx.font = `${12 / globalScale}px sans-serif`;
            ctx.fillStyle = "#a855f7";
            ctx.textAlign = "center";
            ctx.fillText("👑", node.x, node.y - 14 / globalScale);
          }
        }}

        /* Links */
        linkWidth={l => Math.max((l.amount ?? 0) / 20000, 0.5)}
        linkColor={l => l.is_laundering ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.06)"}
        linkDirectionalParticles={l => l.is_laundering ? 3 : 1}
        linkDirectionalParticleWidth={l => l.is_laundering ? 2.5 : 1}
        linkDirectionalParticleColor={l => l.is_laundering ? "#ef4444" : "#ffffff"}

        /* Physics */
        cooldownTicks={250}
        d3VelocityDecay={0.35}
        d3AlphaDecay={0.015}

        /* Interaction */
        enableNodeDrag
        enableZoomInteraction
        enablePanInteraction
        onNodeClick={node => setSelectedNode(prev => prev?.id === node.id ? null : node)}
      />

      {/* Legend overlay */}
      <Legend />

      {/* Node detail sidebar */}
      <NodeSidebar node={selectedNode} onClose={() => setSelectedNode(null)} />

      {/* Graph stats */}
      <div style={{
        position: "absolute", top: 16, left: 16,
        background: "rgba(9,11,28,0.85)",
        border: "1px solid #1e293b",
        borderRadius: 10,
        padding: "8px 14px",
        fontSize: 12,
        color: "#64748b",
        zIndex: 10,
      }}>
        {graph.nodes.length} nodes · {graph.links.length} edges
      </div>

      {/* Load More */}
      {hasMore && (
        <div style={{ position: "absolute", bottom: 16, right: 16, zIndex: 20 }}>
          <button
            onClick={() => fetchPage(skip)}
            disabled={loading}
            style={{
              background: loading
                ? "#1e293b"
                : "linear-gradient(135deg,#7c3aed,#db2777)",
              border: "none",
              color: "white",
              padding: "10px 22px",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 13,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 0 20px rgba(124,58,237,0.4)",
            }}
          >
            {loading ? "Loading…" : `Load More (${graph.nodes.length} loaded)`}
          </button>
        </div>
      )}
    </div>
  );
}