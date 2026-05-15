// frontend/src/components/GraphViz.jsx
import { useEffect, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import axios from 'axios'

const scoreToColor = (prob) => {
  if (prob > 0.7) return '#EF4444'
  if (prob > 0.4) return '#F59E0B'
  return '#22C55E'
}

export default function GraphViz({ accountId }) {
  const [graph, setGraph] = useState({ nodes: [], links: [] })
  
  useEffect(() => {
    if (!accountId) return
    
    axios.get(`http://127.0.0.1:8000/api/subgraph/${accountId}`)
      .then(res => {
        // 1. Print the data to the console to inspect the structure
        console.log("Backend Graph Data Payload:", res.data)

        // 2. Defensive fallbacks to prevent the .map() undefined crash
        const nodesData = res.data.nodes || []
        const edgesData = res.data.edges || res.data.links || res.data.relationships || []

        setGraph({
          nodes: nodesData.map(n => ({ 
            id: n.id, 
            color: scoreToColor(n.fraud_prob || 0), 
            val: (n.fraud_prob || 0.1) * 10 
          })),
          links: edgesData.map(e => ({ 
            source: e.source, 
            target: e.target, 
            value: e.amount_paid || 0, 
            color: e.is_laundering ? '#EF4444' : '#94A3B8' 
          }))
        })
      })
      .catch(err => {
        console.error("Graph network call failed:", err)
      })
  }, [accountId])
  
  return <ForceGraph2D graphData={graph} nodeColor={n => n.color} nodeVal={n => n.val}
    linkColor={l => l.color} linkWidth={l => Math.log(l.value + 1) / 5} width={800} height={500} />
}