import { useEffect, useMemo, useState } from "react";
import { Animator } from "@arwes/react-animator";
import { FrameCorners } from "@arwes/react-frames";
import { Icon } from "./icons";
import { ACTORS, flowFor, type FlowActor, type FlowPhase, type FlowSubject } from "./flow";

// Bangla labels + palette for each phase (kept in sync with styles.css).
const PHASE_BN: Record<FlowPhase, string> = {
  offchain: "OFF-CHAIN",
  propose: "PROPOSE",
  endorse: "ENDORSE",
  order: "ORDER",
  validate: "VALIDATE",
  commit: "COMMIT",
  read: "READ",
  penalty: "PENALTY",
};

// The nodes we draw, in a fixed order so the rail reads top→bottom / left→right.
const RAIL: FlowActor[] = ["client", "vault", "ttc", "company", "bmet", "orderer", "peers", "ledger"];

// Light guide links so the rail reads as a network (purely decorative).
const LINKS: [FlowActor, FlowActor][] = [
  ["client", "vault"], ["client", "ttc"], ["client", "company"], ["client", "orderer"],
  ["ttc", "company"], ["company", "bmet"], ["orderer", "peers"], ["orderer", "bmet"],
  ["peers", "ledger"], ["bmet", "ledger"],
];

export function FlowViz({ subject, onClose }: { subject: FlowSubject; onClose: () => void }) {
  const plan = useMemo(() => flowFor(subject), [subject]);
  const steps = plan.steps;

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  // Packet position; anim=false snaps it to the step's origin before travelling.
  const [pkt, setPkt] = useState<{ x: number; y: number; anim: boolean }>(() => {
    const a = ACTORS[steps[0].from];
    return { x: a.x, y: a.y, anim: false };
  });

  // New subject → restart playback from the top.
  useEffect(() => {
    setIdx(0);
    setPlaying(true);
  }, [subject]);

  // Two-phase packet move: snap to `from`, then glide to `to` for the step.
  useEffect(() => {
    const step = steps[idx];
    if (!step) return;
    const from = ACTORS[step.from];
    const to = ACTORS[step.to];
    setPkt({ x: from.x, y: from.y, anim: false });
    const t = setTimeout(() => setPkt({ x: to.x, y: to.y, anim: true }), 40);
    return () => clearTimeout(t);
  }, [idx, steps]);

  // Playback clock.
  useEffect(() => {
    if (!playing || idx >= steps.length) return;
    const dur = 1500 / speed;
    const t = setTimeout(() => {
      if (idx + 1 >= steps.length) setPlaying(false);
      else setIdx((i) => i + 1);
    }, dur);
    return () => clearTimeout(t);
  }, [playing, idx, steps.length, speed]);

  const cur = steps[idx];
  const done = idx >= steps.length - 1 && !playing;

  // Which nodes light up for the current hop, and which endorsers are satisfied.
  const activeNodes = new Set<FlowActor>(cur ? [cur.from, cur.to] : []);
  const endorsed = new Set<string>();
  steps.forEach((st, i) => {
    if (st.endorser && i <= idx) endorsed.add(st.endorser);
  });
  const policyDone = plan.policyActors ? plan.policyActors.every((a) => endorsed.has(a)) : false;

  function stepTo(i: number) {
    const clamped = Math.max(0, Math.min(steps.length - 1, i));
    setPlaying(false);
    setIdx(clamped);
  }
  function replay() {
    setIdx(0);
    setPlaying(true);
  }

  return (
    <div className="flow-overlay" onClick={onClose}>
      <Animator active>
      <div className="flow-dialog" onClick={(e) => e.stopPropagation()}>
        <FrameCorners className="flow-frame" style={{ zIndex: 0 }} />
        <div className="flow-dialog-inner">
        <header className="flow-dhead">
          <div>
            <div className="flow-title">{plan.title}</div>
            {plan.subtitle && <div className="flow-subtitle mono">{plan.subtitle}</div>}
          </div>
          <button className="flow-close" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </header>

        <div className="flow-stage">
          {/* Network rail */}
          <svg className="flow-svg" viewBox="0 0 640 380" preserveAspectRatio="xMidYMid meet">
            {LINKS.map(([a, b], i) => {
              const p = ACTORS[a], q = ACTORS[b];
              return <line key={i} className="flow-link" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
            })}

            {/* Trail line for the current hop */}
            {cur && (
              <line
                className={`flow-trail phase-${cur.phase}`}
                x1={ACTORS[cur.from].x} y1={ACTORS[cur.from].y}
                x2={ACTORS[cur.to].x} y2={ACTORS[cur.to].y}
              />
            )}

            {RAIL.map((key) => {
              const a = ACTORS[key];
              const active = activeNodes.has(key);
              return (
                <g key={key} className={`flow-node ${active ? "active" : ""} ${a.offchain ? "offchain" : ""}`} transform={`translate(${a.x},${a.y})`}>
                  {active && <circle className="flow-pulse" r={30} />}
                  <circle className="flow-node-bg" r={22} />
                  <text className="flow-node-label" y={40} textAnchor="middle">{a.label}</text>
                </g>
              );
            })}

            {/* Actor icons via foreignObject so we reuse the app Icon set */}
            {RAIL.map((key) => {
              const a = ACTORS[key];
              return (
                <foreignObject key={`ic-${key}`} x={a.x - 12} y={a.y - 12} width={24} height={24} style={{ pointerEvents: "none" }}>
                  <div className={`flow-node-ico ${activeNodes.has(key) ? "active" : ""}`}>
                    <Icon name={a.icon} size={20} />
                  </div>
                </foreignObject>
              );
            })}

            {/* Travelling packet */}
            <g
              className={`flow-packet ${cur ? `phase-${cur.phase}` : ""} ${cur && !cur.onChain ? "offchain" : ""}`}
              style={{ transform: `translate(${pkt.x}px, ${pkt.y}px)`, transition: pkt.anim ? `transform ${1.0 / speed}s cubic-bezier(.5,0,.2,1)` : "none" }}
            >
              <circle r={9} />
            </g>
          </svg>

          {/* Side panel: endorsement policy + legend */}
          <aside className="flow-side">
            {plan.policy ? (
              <div className={`flow-policy ${policyDone ? "done" : ""}`}>
                <div className="flow-policy-head">
                  ENDORSEMENT POLICY
                  {policyDone && <span className="flow-policy-ok">✓ SATISFIED</span>}
                </div>
                <code className="flow-policy-code">{plan.policy}</code>
                <ul className="flow-policy-list">
                  {plan.policyActors!.map((a) => (
                    <li key={a} className={endorsed.has(a) ? "ok" : ""}>
                      <span className="flow-check">{endorsed.has(a) ? "✓" : "○"}</span>
                      <Icon name={ACTORS[a].icon} size={15} />
                      {ACTORS[a].label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flow-policy readonly">
                <div className="flow-policy-head">NO ENDORSEMENT NEEDED</div>
                <p className="flow-note">This operation is either a ledger read or off-chain — so no new block is created.</p>
              </div>
            )}

            <div className="flow-legend">
              <div className="flow-legend-row"><span className="flow-dot onchain" /> ON-CHAIN (ledger)</div>
              <div className="flow-legend-row"><span className="flow-dot offchain" /> OFF-CHAIN (vault / market)</div>
            </div>
          </aside>
        </div>

        {/* Caption */}
        <div className="flow-caption">
          {cur && (
            <>
              <span className={`flow-chip phase-${cur.phase}`}>{PHASE_BN[cur.phase]}</span>
              <span className={`flow-tag ${cur.onChain ? "onchain" : "offchain"}`}>{cur.onChain ? "ON-CHAIN" : "OFF-CHAIN"}</span>
              <span className="flow-cap-text">{cur.label}</span>
            </>
          )}
        </div>

        {/* Progress + controls */}
        <div className="flow-progress"><div className="flow-progress-bar" style={{ width: `${((idx + 1) / steps.length) * 100}%` }} /></div>
        <div className="flow-controls">
          <button onClick={() => stepTo(idx - 1)} disabled={idx === 0} title="Previous step">‹</button>
          {playing ? (
            <button className="wide" onClick={() => setPlaying(false)}>⏸ PAUSE</button>
          ) : done ? (
            <button className="wide" onClick={replay}>⟲ REPLAY</button>
          ) : (
            <button className="wide" onClick={() => setPlaying(true)}>▶ PLAY</button>
          )}
          <button onClick={() => stepTo(idx + 1)} disabled={idx >= steps.length - 1} title="Next step">›</button>
          <span className="flow-step-count">{idx + 1} / {steps.length}</span>
          <span className="flow-spacer" />
          <label className="flow-speed">
            SPEED
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
            </select>
          </label>
        </div>

        {/* Step list */}
        <ol className="flow-steps">
          {steps.map((st, i) => (
            <li
              key={i}
              className={`${i === idx ? "current" : ""} ${i < idx ? "past" : ""}`}
              onClick={() => stepTo(i)}
            >
              <span className={`flow-steps-dot phase-${st.phase}`} />
              <span className="flow-steps-lbl">{st.label}</span>
            </li>
          ))}
        </ol>
        </div>
      </div>
      </Animator>
    </div>
  );
}
