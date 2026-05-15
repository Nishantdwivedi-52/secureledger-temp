import { useEffect, useState } from "react";

import ForceGraph2D from "react-force-graph-2d";

import axios from "axios";

export default function RingGraph() {

  const [graph, setGraph] = useState({

    nodes: [],
    links: []
  });

  // --------------------------------------
  // LOAD GRAPH
  // --------------------------------------

  useEffect(() => {

    axios

      .get(
        "http://127.0.0.1:8000/api/rings/graph"
      )

      .then((res) => {

        setGraph(res.data);

      })

      .catch((err) => {

        console.error(err);

      });

  }, []);

  // --------------------------------------
  // NODE COLORS
  // --------------------------------------

  const getNodeColor = (node) => {

    // mastermind

    if (node.is_mastermind)
      return "#A855F7";

    // high fraud

    if (node.fraud_prob > 0.7)
      return "#EF4444";

    // medium fraud

    if (node.fraud_prob > 0.4)
      return "#F59E0B";

    // low fraud

    return "#22C55E";
  };

  // --------------------------------------
  // NODE LABEL
  // --------------------------------------

  const getNodeLabel = (node) => {

    return `

ID:
${node.id}

Fraud Probability:
${(node.fraud_prob * 100).toFixed(1)}%

Ring:
${node.ring_id || "None"}

Mastermind:
${node.is_mastermind}

`;
  };

  // --------------------------------------
  // UI
  // --------------------------------------

  return (

    <div className="bg-black rounded-2xl overflow-hidden">

      <ForceGraph2D

        graphData={graph}

        width={1300}

        height={850}

        backgroundColor="#000000"

        // --------------------------------
        // NODE STYLE
        // --------------------------------

        nodeColor={getNodeColor}

        nodeLabel={getNodeLabel}

        nodeVal={(node) =>

          Math.max(
            node.fraud_prob * 35,
            5
          )
        }

        // --------------------------------
        // LINK STYLE
        // --------------------------------

        linkWidth={(link) =>

          Math.max(
            link.amount / 15000,
            0.5
          )
        }

        linkColor={() =>
          "rgba(255,255,255,0.08)"
        }

        // --------------------------------
        // ANIMATION
        // --------------------------------

        linkDirectionalParticles={1}

        linkDirectionalParticleWidth={1.5}

        // --------------------------------
        // FORCE PHYSICS
        // --------------------------------

        cooldownTicks={200}

        d3VelocityDecay={0.4}

        d3AlphaDecay={0.02}

        // --------------------------------
        // INTERACTION
        // --------------------------------

        enableNodeDrag={true}

        enableZoomInteraction={true}

        enablePanInteraction={true}

        // --------------------------------
        // CLICK ACTION
        // --------------------------------

        onNodeClick={(node) => {

          alert(

            `Investigating Account\n\n

ID:
${node.id}

Fraud Probability:
${(node.fraud_prob * 100).toFixed(2)}%

Ring:
${node.ring_id}

Mastermind:
${node.is_mastermind}

`
          );

        }}

      />

    </div>
  );
}