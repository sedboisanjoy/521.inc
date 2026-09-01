import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { Topology } from "../types";

interface Props {
  topo: Topology;
  onTogglePeer: (orgDid: string, online: boolean) => void;
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: "org" | "peer" | "orderer";
  orgDid?: string;
  online: boolean;
  score: number;
  endpoint: string;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string;
  target: string;
  type: string;
}

export function NetworkTopology({ topo, onTogglePeer }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const { width, height } = containerRef.current.getBoundingClientRect();
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    // Build graph data
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    // Orderer
    nodes.push({
      id: "orderer", name: topo.orderer.name, type: "orderer",
      online: topo.orderer.online, score: 100, endpoint: topo.orderer.endpoint,
    });

    // Orgs + peers
    for (const org of topo.orgs) {
      nodes.push({
        id: org.did, name: org.name, type: "org",
        online: org.online, score: org.score, endpoint: org.endpoint,
      });
      const peer = topo.peers.find((p) => p.orgDid === org.did);
      if (peer) {
        nodes.push({
          id: peer.name, name: peer.name, type: "peer",
          orgDid: org.did, online: peer.online, score: org.score, endpoint: peer.endpoint,
        });
        links.push({ source: org.did, target: peer.name, type: "owns" });
        links.push({ source: peer.name, target: "orderer", type: "peer-orderer" });
      }
    }

    // Inter-org links (fabric gossip)
    const orgDIDs = topo.orgs.map((o) => o.did);
    for (let i = 0; i < orgDIDs.length - 1; i++) {
      links.push({ source: orgDIDs[i], target: orgDIDs[i + 1], type: "gossip" });
    }

    // Render
    const g = svg.append("g");

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 2])
      .on("zoom", (ev) => g.attr("transform", ev.transform));
    svg.call(zoom);

    // Links
    const link = g.selectAll<SVGLineElement, GraphLink>("line")
      .data(links).join("line")
      .attr("class", (d) => `link ${d.type}`)
      .attr("stroke", (d) => d.type === "gossip" ? "#444" : d.type === "owns" ? "#555" : "#666")
      .attr("stroke-width", (d) => d.type === "gossip" ? 1 : 2)
      .attr("stroke-dasharray", (d) => d.type === "gossip" ? "4,2" : null);

    // Nodes
    const node = g.selectAll<SVGCircleElement, GraphNode>("circle")
      .data(nodes).join("circle")
      .attr("r", (d) => d.type === "orderer" ? 30 : d.type === "org" ? 24 : 16)
      .attr("fill", (d) => {
        if (!d.online) return "#ff4444";
        if (d.type === "orderer") return "#9b59b6";
        if (d.type === "org") return "#2ecc71";
        return "#3498db";
      })
      .attr("stroke", (d) => !d.online ? "#cc0000" : d.type === "orderer" ? "#7d3c98" : "#1e8449")
      .attr("stroke-width", 2)
      .style("cursor", (d) => d.type === "org" ? "pointer" : "default")
      .on("click", (_ev, d) => {
        if (d.type === "org") {
          onTogglePeer(d.id, !d.online);
        }
      })
      .call(d3.drag<SVGCircleElement, GraphNode>()
        .on("start", (ev, d) => {
          if (!ev.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (ev, d) => {
          d.fx = ev.x; d.fy = ev.y;
        })
        .on("end", (ev, d) => {
          if (!ev.active) sim.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
      );

    // Labels
    const label = g.selectAll<SVGTextElement, GraphNode>("text")
      .data(nodes).join("text")
      .text((d) => d.name.length > 15 ? d.name.slice(0, 15) + "…" : d.name)
      .attr("dx", 0).attr("dy", (d) => (d.type === "orderer" ? 44 : d.type === "org" ? 36 : 28))
      .attr("text-anchor", "middle")
      .attr("fill", "#c0c0c0")
      .attr("font-size", 11);

    // Simulation
    const sim = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(50))
      .on("tick", () => {
        link.attr("x1", (d) => (d.source as unknown as GraphNode).x!)
          .attr("y1", (d) => (d.source as unknown as GraphNode).y!)
          .attr("x2", (d) => (d.target as unknown as GraphNode).x!)
          .attr("y2", (d) => (d.target as unknown as GraphNode).y!);
        node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);
        label.attr("x", (d) => d.x!).attr("y", (d) => d.y!);
      });

    return () => { sim.stop(); };
  }, [topo, onTogglePeer]);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>🔗 Fabric Network Topology</h2>
        <span className="panel-hint">
          Click an org node to toggle its peer online/offline · Drag to rearrange
        </span>
      </div>
      <div className="topology-legend">
        <span className="legend-item"><span className="legend-dot org"></span> Organisation</span>
        <span className="legend-item"><span className="legend-dot peer"></span> Peer Node</span>
        <span className="legend-item"><span className="legend-dot orderer"></span> Orderer</span>
        <span className="legend-item"><span className="legend-offline-dot"></span> Offline</span>
      </div>
      <div ref={containerRef} className="topology-svg-container">
        <svg ref={svgRef}></svg>
      </div>
      <div className="topology-info">
        <div>Channel: <code>{topo.channel}</code></div>
        <div>Policy: <code>{topo.policy}</code></div>
        <div>Peers: <strong>{topo.peers.filter((p) => p.online).length}/{topo.peers.length}</strong> online</div>
      </div>
    </div>
  );
}