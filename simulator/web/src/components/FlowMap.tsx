import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import type { Topology, FlowEvent, RunResult, Scenario } from "../types";

interface Props {
  topo: Topology;
  events: FlowEvent[];
  lastRun: RunResult | null;
  scenarios: Scenario[];
  onTogglePeer: (orgDid: string, online: boolean) => void;
}

interface GNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: "client" | "org" | "peer" | "orderer";
  orgDid?: string;
  online: boolean;
}
interface GLink extends d3.SimulationLinkDatum<GNode> {
  source: string;
  target: string;
  kind: string;
}

const EVENT_COLORS: Record<string, string> = {
  PROPOSAL: "#3498db", ENDORSEMENT: "#2ecc71", ORDERING: "#9b59b6",
  VALIDATION: "#e67e22", COMMIT: "#1abc9c", POLICY_FAIL: "#e74c3c",
  REVOCATION: "#ff6b6b", CORROBORATION: "#f39c12", TRUST_DELTA: "#a29bfe",
  DISCLOSURE: "#00b894", SYSTEM_OFFLINE: "#e74c3c", SYSTEM_ONLINE: "#2ecc71",
  ATTACK: "#e74c3c", DEFENSE: "#2ecc71", VULNERABILITY: "#f39c12",
};
const EVENT_ICONS: Record<string, string> = {
  PROPOSAL: "📤", ENDORSEMENT: "✅", ORDERING: "🧱", VALIDATION: "🔍",
  COMMIT: "📦", POLICY_FAIL: "❌", REVOCATION: "🚫", CORROBORATION: "🤝",
  TRUST_DELTA: "⭐", DISCLOSURE: "🔐", SYSTEM_OFFLINE: "🔴", SYSTEM_ONLINE: "🟢",
  ATTACK: "🗡️", DEFENSE: "🛡️", VULNERABILITY: "❗",
};

export function FlowMap({ topo, events, lastRun, scenarios, onTogglePeer }: Props) {
  const active = scenarios.find((s) => s.id === lastRun?.scenario);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const animateRef = useRef<(ev: FlowEvent, ms: number) => void>(() => {});

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Rebuild the graph only when the *structure* changes (peer up/down, policy),
  // NOT on every 2s topology poll or trust-score tick.
  const topoSig = useMemo(
    () =>
      JSON.stringify({
        policy: topo.policy,
        channel: topo.channel,
        orderer: topo.orderer.online,
        orgs: topo.orgs.map((o) => [o.did, o.online]),
        peers: topo.peers.map((p) => [p.name, p.online]),
      }),
    [topo]
  );

  // ─── Build the D3 graph once per structural change ────────────────────────
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    // Glow filter for packets/pulses.
    const defs = svg.append("defs");
    const glow = defs.append("filter").attr("id", "glow").attr("x", "-60%").attr("y", "-60%").attr("width", "220%").attr("height", "220%");
    glow.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "b");
    const merge = glow.append("feMerge");
    merge.append("feMergeNode").attr("in", "b");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    const nodes: GNode[] = [];
    const links: GLink[] = [];

    nodes.push({ id: "client", name: "Client / Wallet", type: "client", online: true, fx: 70, fy: height / 2 });
    nodes.push({ id: "orderer", name: topo.orderer.name, type: "orderer", online: topo.orderer.online });

    for (const org of topo.orgs) {
      nodes.push({ id: org.did, name: org.name, type: "org", online: org.online });
      const peer = topo.peers.find((p) => p.orgDid === org.did);
      if (peer) {
        nodes.push({ id: peer.name, name: peer.name, type: "peer", orgDid: org.did, online: peer.online });
        links.push({ source: org.did, target: peer.name, kind: "owns" });
        links.push({ source: peer.name, target: "orderer", kind: "peer-orderer" });
      }
      links.push({ source: "client", target: org.did, kind: "client" });
    }
    const dids = topo.orgs.map((o) => o.did);
    for (let i = 0; i < dids.length - 1; i++) links.push({ source: dids[i], target: dids[i + 1], kind: "gossip" });

    const g = svg.append("g");
    svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 2]).on("zoom", (e) => g.attr("transform", e.transform)));

    const link = g.append("g").selectAll<SVGLineElement, GLink>("line").data(links).join("line")
      .attr("stroke", (d) => (d.kind === "gossip" ? "#30363d" : d.kind === "client" ? "#2a3550" : "#3a4560"))
      .attr("stroke-width", (d) => (d.kind === "gossip" ? 1 : 2))
      .attr("stroke-dasharray", (d) => (d.kind === "gossip" ? "4,3" : d.kind === "client" ? "2,4" : null))
      .attr("opacity", 0.7);

    const pulseLayer = g.append("g"); // ripples (below nodes)
    const nodeG = g.append("g");
    const packetLayer = g.append("g"); // packets (above nodes)

    const node = nodeG.selectAll<SVGCircleElement, GNode>("circle").data(nodes).join("circle")
      .attr("r", (d) => (d.type === "orderer" ? 28 : d.type === "org" ? 24 : d.type === "client" ? 20 : 16))
      .attr("fill", (d) => nodeFill(d))
      .attr("stroke", (d) => (!d.online ? "#cc0000" : "#0d1117"))
      .attr("stroke-width", 3)
      .style("cursor", (d) => (d.type === "org" ? "pointer" : "default"))
      .on("click", (_e, d) => { if (d.type === "org") onTogglePeer(d.id, !d.online); })
      .call(d3.drag<SVGCircleElement, GNode>()
        .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); if (d.type !== "client") { d.fx = null; d.fy = null; } }));

    const label = nodeG.selectAll<SVGTextElement, GNode>("text").data(nodes).join("text")
      .text((d) => (d.name.length > 18 ? d.name.slice(0, 18) + "…" : d.name))
      .attr("text-anchor", "middle").attr("fill", "#8b949e").attr("font-size", 11)
      .attr("dy", (d) => (d.type === "orderer" ? 42 : d.type === "org" ? 38 : 30));

    const sim = d3.forceSimulation<GNode>(nodes)
      .force("link", d3.forceLink<GNode, GLink>(links).id((d) => d.id).distance((l) => (l.kind === "client" ? 200 : 110)))
      .force("charge", d3.forceManyBody().strength(-420))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(52))
      .on("tick", () => {
        link.attr("x1", (d) => (d.source as unknown as GNode).x!).attr("y1", (d) => (d.source as unknown as GNode).y!)
          .attr("x2", (d) => (d.target as unknown as GNode).x!).attr("y2", (d) => (d.target as unknown as GNode).y!);
        node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);
        label.attr("x", (d) => d.x!).attr("y", (d) => d.y!);
      });

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const idExists = (id: string) => byId.has(id);
    const peerByName = (raw: string) => (byId.has(raw) && byId.get(raw)!.type === "peer" ? raw : "");

    function resolve(raw: string, kind: "src" | "tgt"): string {
      const fallback = kind === "src" ? "client" : "orderer";
      if (!raw) return fallback;
      const r = raw.toLowerCase();
      if (r === "client") return "client";
      if (raw.startsWith("did:")) return idExists(raw) ? raw : fallback;
      if (r.startsWith("peer")) return peerByName(raw) || fallback;
      if (r.includes("orderer")) return "orderer";
      if (r === "worker" || r === "employer" || r === "agency") return "client";
      return "orderer"; // ledger / all peers / peers / network
    }

    function ripple(n: GNode, color: string, r0: number) {
      pulseLayer.append("circle").attr("cx", n.x!).attr("cy", n.y!).attr("r", r0)
        .attr("fill", "none").attr("stroke", color).attr("stroke-width", 3).attr("opacity", 0.9)
        .transition().duration(700).ease(d3.easeCubicOut)
        .attr("r", r0 + 34).attr("stroke-width", 0).attr("opacity", 0).remove();
    }
    function highlight(id: string, color: string) {
      node.filter((d) => d.id === id).transition().duration(180).attr("stroke", color).attr("stroke-width", 6)
        .transition().delay(500).duration(400).attr("stroke", (d) => (!d.online ? "#cc0000" : "#0d1117")).attr("stroke-width", 3);
      const n = byId.get(id);
      if (n && n.x != null) ripple(n, color, (id === "orderer" ? 28 : 24) + 4);
    }

    // The imperative animator the React playback loop calls each step.
    animateRef.current = (ev: FlowEvent, ms: number) => {
      const color = EVENT_COLORS[ev.type] || "#8b949e";
      const srcId = resolve(ev.from, "src");
      const tgtId = resolve(ev.to, "tgt");
      const s = byId.get(srcId);
      const t = byId.get(tgtId);

      if (s && t && s.x != null && t.x != null && srcId !== tgtId) {
        const dur = Math.min(900, ms * 0.8);
        const packet = packetLayer.append("circle")
          .attr("r", 8).attr("fill", color).attr("filter", "url(#glow)")
          .attr("cx", s.x!).attr("cy", s.y!).attr("opacity", 0.95);
        packet.transition().duration(dur).ease(d3.easeCubicInOut)
          .attr("cx", t.x!).attr("cy", t.y!)
          .on("end", () => { highlight(tgtId, color); packet.transition().duration(160).attr("opacity", 0).remove(); });
        highlight(srcId, color);
      } else {
        highlight(srcId, color);
        highlight(tgtId, color);
      }

      // Phase-specific extra emphasis.
      if (ev.type === "COMMIT") nodes.filter((n) => n.type === "peer").forEach((n) => n.x != null && ripple(n, "#1abc9c", 20));
      if (ev.type === "POLICY_FAIL") nodes.filter((n) => !n.online).forEach((n) => n.x != null && ripple(n, "#e74c3c", 20));
    };

    return () => { sim.stop(); animateRef.current = () => {}; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topoSig]);

  // ─── Playback loop ────────────────────────────────────────────────────────
  // A new run resets to the start and auto-plays.
  useEffect(() => {
    if (events.length) { setIdx(0); setPlaying(true); }
  }, [lastRun?.id, events.length]);

  useEffect(() => {
    if (!playing || idx >= events.length) return;
    const step = 1200 / speed;
    animateRef.current(events[idx], step);
    const t = setTimeout(() => {
      if (idx + 1 >= events.length) setPlaying(false);
      else setIdx((i) => i + 1);
    }, step);
    return () => clearTimeout(t);
  }, [playing, idx, events, speed]);

  const cur = events[idx];
  const done = events.length > 0 && idx >= events.length - 1 && !playing;

  function replay() { if (!events.length) return; setIdx(0); setPlaying(true); }
  function stepTo(i: number) {
    const clamped = Math.max(0, Math.min(events.length - 1, i));
    setPlaying(false);
    setIdx(clamped);
    if (events[clamped]) animateRef.current(events[clamped], 1200 / speed);
  }

  return (
    <div className="panel flowmap-panel">
      <div className="panel-header">
        <h2>🔗 Live Fabric Flow</h2>
        <span className="panel-hint">Click an org to drop its peer · watch endorsement travel the network</span>
      </div>

      <div className="topology-info flowmap-info">
        <div>Channel <code>{topo.channel}</code></div>
        <div>Policy <code>{topo.policy}</code></div>
        <div>Peers <strong>{topo.peers.filter((p) => p.online).length}/{topo.peers.length}</strong> online</div>
      </div>

      {active && (
        <div className="flowmap-mapping" title="Same chaincode the app at :5173 runs — this is the network view of it">
          <span className="mapping-label">app link</span>
          <code className="sc-fn">{active.fn}</code>
          <code className="sc-endpoint">{active.endpoint}</code>
        </div>
      )}

      <div ref={containerRef} className="topology-svg-container flowmap-svg">
        <svg ref={svgRef}></svg>
      </div>

      {/* Caption + controls */}
      <div className="flow-caption">
        {cur ? (
          <>
            <span className="cap-badge" style={{ background: EVENT_COLORS[cur.type] || "#666" }}>
              {EVENT_ICONS[cur.type]} {cur.type}
            </span>
            <span className="cap-msg">{cur.message}</span>
          </>
        ) : (
          <span className="cap-msg muted">▶ Run a scenario to watch the control flow animate across the network.</span>
        )}
      </div>

      {events.length > 0 && (
        <>
          <div className="flow-progress">
            <div className="flow-progress-bar" style={{ width: `${((idx + 1) / events.length) * 100}%`, background: cur ? EVENT_COLORS[cur.type] : "#1abc9c" }} />
          </div>
          <div className="flow-controls">
            <button onClick={() => stepTo(idx - 1)} disabled={idx === 0} title="Previous">‹</button>
            {playing ? (
              <button onClick={() => setPlaying(false)} title="Pause">⏸ Pause</button>
            ) : done ? (
              <button onClick={replay} title="Replay">⟲ Replay</button>
            ) : (
              <button onClick={() => setPlaying(true)} title="Play">▶ Play</button>
            )}
            <button onClick={() => stepTo(idx + 1)} disabled={idx >= events.length - 1} title="Next">›</button>
            <span className="flow-step">{idx + 1} / {events.length}</span>
            <span className="flow-spacer" />
            {lastRun && (
              <span className={`flow-outcome ${lastRun.success ? "pass" : "fail"}`}>
                {lastRun.success ? "✓ policy satisfied" : "✗ policy failed"}
              </span>
            )}
            <label className="flow-speed">
              speed
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                <option value={0.5}>0.5×</option>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
                <option value={4}>4×</option>
              </select>
            </label>
          </div>
        </>
      )}
    </div>
  );
}

function nodeFill(d: GNode): string {
  if (!d.online) return "#5b1a1a";
  if (d.type === "orderer") return "#9b59b6";
  if (d.type === "client") return "#e67e22";
  if (d.type === "org") return "#238636";
  return "#1f6feb";
}
