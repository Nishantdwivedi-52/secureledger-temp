// frontend/src/components/GraphVisualiser.jsx
import { useEffect, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { getSubgraph } from "../utils/api";

export default function GraphVisualiser({ accountId }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading]     = useState(false);
  const fgRef = useRef();

  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    getSubgraph(accountId, 2)
      .then(r => {
        const { nodes, edges } = r.data;
        setGraphData({
          nodes: nodes.map(n => ({ ...n, label: n.id })),
          links: edges.map(e => ({ source: e.source, target: e.target,
                                   amount: e.amount, laundering: e.is_laundering })),
        });
      })
      .finally(() => setLoading(false));
  }, [accountId]);

  const nodeColor = (node) => {
    if (node.fraud_prob > 0.7) return "#ef4444";
    if (node.fraud_prob > 0.4) return "#f59e0b";
    return "#22c55e";
  };

  const nodeVal = (node) => Math.max(1, node.fraud_prob * 10);

  const linkWidth = (link) => Math.max(0.5, Math.log10(link.amount + 1) * 0.3);

  const linkColor = (link) => link.laundering === 1 ? "#ef4444" : "#475569";

  if (!accountId) return (
    <p style={{ color: "#64748b", textAlign: "center", paddingTop: 40 }}>
      Enter an Account ID above to explore its transaction subgraph.
    </p>
  );

  if (loading) return <p style={{ color: "#94a3b8" }}>Loading subgraph…</p>;

  return (
    <div style={{ background: "#0f172a", borderRadius: 8, overflow: "hidden" }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeColor={nodeColor}
        nodeVal={nodeVal}
        linkWidth={linkWidth}
        linkColor={linkColor}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        nodeLabel={node => `${node.id}\nfraud_prob: ${node.fraud_prob}`}
        width={800}
        height={480}
        backgroundColor="#0f172a"
      />
      <div style={{ padding: "8px 16px", fontSize: 12, color: "#64748b", display: "flex", gap: 16 }}>
        <span>🔴 High fraud prob (&gt;0.7)</span>
        <span>🟡 Medium (0.4–0.7)</span>
        <span>🟢 Low (&lt;0.4)</span>
        <span style={{ marginLeft: "auto" }}>Node size ∝ fraud_prob · Edge thickness ∝ log(amount)</span>
      </div>
    </div>
  );
}
