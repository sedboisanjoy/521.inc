import type { Scenario, RunResult, SystemStatus, Topology, FlowEvent } from "./types";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  // Health
  health: () => req<{ status: string; backendOnline: boolean }>("GET", "/api/health"),

  // Topology
  topology: () => req<{ topology: Topology; backendOnline: boolean }>("GET", "/api/topology"),

  // Scenarios
  listScenarios: () => req<Scenario[]>("GET", "/api/scenarios"),
  runScenario: (scenarioId: string) =>
    req<RunResult>("POST", `/api/scenarios/${scenarioId}/run`),

  // Runs
  listRuns: (limit = 20) => req<RunResult[]>("GET", `/api/runs?limit=${limit}`),
  getRun: (runId: number) => req<RunResult>("GET", `/api/runs/${runId}`),
  getRunEvents: (runId: number) => req<FlowEvent[]>("GET", `/api/runs/${runId}/events`),

  // System status
  systemStatus: () => req<SystemStatus>("GET", "/api/system-status"),

  // Peer control
  setPeerOnline: (orgDID: string) =>
    req<{ status: string }>("POST", `/api/peers/${orgDID}/online`),
  setPeerOffline: (orgDID: string) =>
    req<{ status: string }>("POST", `/api/peers/${orgDID}/offline`),
};