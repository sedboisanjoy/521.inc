import { useState, useEffect, useCallback } from "react";
import { SystemStatusBanner } from "./components/SystemStatus";
import { FlowMap } from "./components/FlowMap";
import { NetworkTopology } from "./components/NetworkTopology";
import { ScenarioRunner } from "./components/ScenarioRunner";
import { TransactionFlow } from "./components/TransactionFlow";
import { TrustDashboard } from "./components/TrustDashboard";
import { api } from "./api";
import type { SystemStatus, Topology, RunResult, Scenario } from "./types";

type Tab = "live" | "scenarios" | "flow" | "network" | "trust";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "live", label: "Live Flow", icon: "🔗" },
  { id: "scenarios", label: "Scenario Runner", icon: "▶️" },
  { id: "flow", label: "Event Timeline", icon: "📊" },
  { id: "network", label: "Static Topology", icon: "🗺️" },
  { id: "trust", label: "Trust Dashboard", icon: "⭐" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("live");
  const [sysStatus, setSysStatus] = useState<SystemStatus | null>(null);
  const [topology, setTopology] = useState<Topology | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const [events, setEvents] = useState(lastRun?.events || []);
  const [running, setRunning] = useState(false);

  // Poll system status every 2s
  useEffect(() => {
    const tick = async () => {
      try {
        const [st, topo] = await Promise.all([
          api.systemStatus(), api.topology(),
]);
        setSysStatus(st);
        setTopology(topo.topology);
      } catch {
        setSysStatus(null);
      }
    };
    tick();
    const iv = setInterval(tick, 2000);
    return () => clearInterval(iv);
  }, []);

  // Load scenarios once
  useEffect(() => {
    api.listScenarios().then(setScenarios).catch(() => {});
  }, []);

  const runScenario = useCallback(async (id: string) => {
    setRunning(true);
    try {
      const r = await api.runScenario(id);
      setLastRun(r);
      setEvents(r.events);
      // Force topology refresh
      const topo = await api.topology();
      setTopology(topo.topology);
      setTab("live"); // watch it animate across the network graph
    } catch (err) {
      alert("Failed to run scenario: " + (err as Error).message);
    } finally {
      setRunning(false);
    }
  }, []);

  const togglePeer = useCallback(async (orgDid: string, online: boolean) => {
    try {
      if (online) await api.setPeerOnline(orgDid);
      else await api.setPeerOffline(orgDid);
      const topo = await api.topology();
      setTopology(topo.topology);
    } catch (err) {
      alert("Failed to toggle peer: " + (err as Error).message);
    }
  }, []);

  return (
    <div className="app">
      <SystemStatusBanner status={sysStatus} />

      <header className="app-header">
        <h1>🛂 Employment Passport — Control Flow Simulator</h1>
        <span className="subtitle">Blockchain Olympiad Bangladesh 2026 · Team CHEATro_GUPTO</span>
      </header>

      <nav className="tab-nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {tab === "live" && topology && (
          <FlowMap topo={topology} events={events} lastRun={lastRun} scenarios={scenarios} onTogglePeer={togglePeer} />
        )}
        {tab === "network" && topology && (
          <NetworkTopology topo={topology} onTogglePeer={togglePeer} />
        )}
        {tab === "scenarios" && (
          <ScenarioRunner
            scenarios={scenarios}
            lastRun={lastRun}
            running={running}
            onRun={runScenario}
          />
        )}
        {tab === "flow" && (
          <TransactionFlow events={events} lastRun={lastRun} />
        )}
        {tab === "trust" && topology && (
          <TrustDashboard orgs={topology.orgs} />
        )}
      </main>
    </div>
  );
}