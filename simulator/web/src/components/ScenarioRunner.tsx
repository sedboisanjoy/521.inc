import type { Scenario, RunResult } from "../types";

interface Props {
  scenarios: Scenario[];
  lastRun: RunResult | null;
  running: boolean;
  onRun: (id: string) => void;
}

const UC_LABELS: Record<number, string> = {
  0: "⚙️ Demo",
  1: "🆔 Registration",
  2: "📜 Issuance",
  3: "📋 Contract",
  4: "✅ Verification",
  5: "💰 Wage",
  6: "🚫 Revocation",
  7: "📊 Monitoring",
};

export function ScenarioRunner({ scenarios, lastRun, running, onRun }: Props) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>▶️ Scenario Runner — Whitepaper Use Cases</h2>
        <span className="panel-hint">Select a scenario to simulate the Fabric control flow</span>
      </div>

      <div className="scenario-grid">
        {scenarios.map((s) => (
          <div key={s.id} className="scenario-card">
            <div className="sc-uc-badge">{UC_LABELS[s.useCase] || `UC${s.useCase}`}</div>
            <h3>{s.name}</h3>
            <p>{s.description}</p>
            <button
              className="run-btn"
              disabled={running}
              onClick={() => onRun(s.id)}
            >
              {running ? "⏳ Running…" : "▶ Run"}
            </button>
          </div>
        ))}
      </div>

      {lastRun && (
        <div className={`last-run ${lastRun.success ? "success" : "fail"}`}>
          <h3>Last Run: {lastRun.scenario}</h3>
          <p>{lastRun.summary}</p>
          <div className="run-meta">
            <span>Events: {lastRun.events.length}</span>
            <span>Started: {new Date(lastRun.startedAt).toLocaleTimeString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}