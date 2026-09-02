import { useEffect, useRef } from "react";
import type { FlowEvent, RunResult } from "../types";

interface Props {
  events: FlowEvent[];
  lastRun: RunResult | null;
}

const EVENT_COLORS: Record<string, string> = {
  PROPOSAL: "#3498db",
  ENDORSEMENT: "#2ecc71",
  ORDERING: "#9b59b6",
  VALIDATION: "#e67e22",
  COMMIT: "#1abc9c",
  POLICY_FAIL: "#e74c3c",
  REVOCATION: "#ff6b6b",
  CORROBORATION: "#f39c12",
  TRUST_DELTA: "#a29bfe",
  DISCLOSURE: "#00b894",
  SYSTEM_OFFLINE: "#e74c3c",
  SYSTEM_ONLINE: "#2ecc71",
  ATTACK: "#e74c3c", DEFENSE: "#2ecc71", VULNERABILITY: "#f39c12",
};

const EVENT_ICONS: Record<string, string> = {
  PROPOSAL: "📤", ENDORSEMENT: "✅", ORDERING: "🧱", VALIDATION: "🔍",
  COMMIT: "📦", POLICY_FAIL: "❌", REVOCATION: "🚫", CORROBORATION: "🤝",
  TRUST_DELTA: "⭐", DISCLOSURE: "🔐", SYSTEM_OFFLINE: "🔴", SYSTEM_ONLINE: "🟢",
  ATTACK: "🗡️", DEFENSE: "🛡️", VULNERABILITY: "❗",
};

export function TransactionFlow({ events, lastRun }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  if (!lastRun) {
    return (
      <div className="panel empty-panel">
        <h2>📊 Transaction Flow</h2>
        <p>Run a scenario to see the Fabric control flow (proposal → endorsement → ordering → commit).</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>📊 Transaction Flow — {lastRun.scenario}</h2>
        <span className={`flow-outcome ${lastRun.success ? "pass" : "fail"}`}>
          {lastRun.success ? "✓ PASSED" : "✗ FAILED"}
        </span>
      </div>

      <div className="flow-summary">
        <span>{events.length} events</span>
        <span>·</span>
        <span>{new Set(events.map((e) => e.txId)).size} transaction(s)</span>
      </div>

      <div className="flow-events" ref={scrollRef}>
        {events.map((ev, i) => (
          <div
            key={i}
            className={`flow-event ${ev.success ? "success" : "fail"} type-${ev.type}`}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="ev-type" style={{ background: EVENT_COLORS[ev.type] || "#666" }}>
              {EVENT_ICONS[ev.type] || "•"}
            </div>
            <div className="ev-body">
              <div className="ev-header">
                <span className="ev-type-label">{ev.type}</span>
                <span className="ev-seq">#{ev.seq}</span>
              </div>
              <div className="ev-message">{ev.message}</div>
              <div className="ev-meta">
                <span>{ev.from} → {ev.to}</span>
                <span>tx: {ev.txId.substring(0, 12)}</span>
              </div>
            </div>
            {/* Animated connector line */}
            {i < events.length - 1 && (
              <div className={`ev-connector ${events[i].success ? "ok" : "fail"}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}