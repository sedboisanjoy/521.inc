// Types mirroring engine/models.go — kept in sync so the visualizer understands
// every structure the simulator produces.

export type OrgRole = "regulator" | "issuer" | "verifier" | "worker";

export interface Org {
  did: string;
  name: string;
  mspid: string;
  role: OrgRole;
  endpoint: string;
  online: boolean;
  score: number;
}

export interface Node {
  name: string;
  endpoint: string;
  online: boolean;
}

export interface PeerNode {
  orgDid: string;
  name: string;
  endpoint: string;
  online: boolean;
}

export interface Topology {
  orgs: Org[];
  orderer: Node;
  peers: PeerNode[];
  channel: string;
  policy: string;
}

export type EventType =
  | "PROPOSAL" | "ENDORSEMENT" | "ORDERING" | "VALIDATION" | "COMMIT"
  | "POLICY_FAIL" | "REVOCATION" | "CORROBORATION" | "TRUST_DELTA"
  | "DISCLOSURE" | "SYSTEM_OFFLINE" | "SYSTEM_ONLINE"
  | "ATTACK" | "DEFENSE" | "VULNERABILITY";

export interface FlowEvent {
  id: number;
  seq: number;
  type: EventType;
  from: string;
  to: string;
  message: string;
  txId: string;
  timestamp: string;
  success: boolean;
  details: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  useCase: number;
  fn: string;
  endpoint: string;
  adversarial: boolean;
}

export interface RunResult {
  id: number;
  scenario: string;
  startedAt: string;
  endedAt: string | null;
  success: boolean;
  events: FlowEvent[];
  topology: Topology;
  summary: string;
}

export interface SystemStatus {
  backendOnline: boolean;
  ordererOnline: boolean;
  peers: { name: string; orgDid: string; online: boolean }[];
  orgs: Org[];
  policy: string;
}