// Thin typed client over the Go backend REST API (Layer 2).
const BASE = import.meta.env.VITE_API || "";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

export interface VerifyResult {
  found: boolean;
  credHash: string;
  status: string;
  schemaId?: string;
  issuerDID?: string;
  issuerStanding: number;
  endorsers?: string[];
  corroborationScore: number;
  issuedAt?: string;
  revokedAt?: string;
  reasonCode?: string;
}

export interface WalletEntry {
  credHash: string;
  schemaId: string;
  claims: Record<string, unknown>;
  anchor: VerifyResult;
}

export interface WorkerDir {
  workerId: string;
  did: string;
  name: string;
  nidMasked: string;
  address: string;
}

export interface OrgDir {
  orgId: string;
  did: string;
  name: string;
  type: "ttc" | "company";
  email?: string;
}

export interface ContractAnchor {
  found: boolean;
  contractHash: string;
  workerDID?: string;
  employerDID?: string;
  status: string;
  createdAt?: string;
  workerSignedAt?: string;
  approvedAt?: string;
}

export interface ContractEntry {
  contractHash: string;
  workerDID: string;
  employerDID: string;
  employer: string;
  position: string;
  salary: number;
  currency: string;
  term: string;
  jobId?: string;
  anchor: ContractAnchor;
}

export interface CredentialBody {
  credHash: string;
  schemaId: string;
  issuerDID: string;
  subjectDID: string;
  claims: Record<string, unknown>;
  salt?: string;
}

export const api = {
  health: () => req<{ status: string; time: string }>("GET", "/api/health"),

  registerWorker: (b: { name: string; nid: string; address: string }) =>
    req<{ workerId: string; did: string }>("POST", "/api/workers", b),

  // Worker directory for issuers. Empty list marshals as null → coerce to [].
  listWorkers: async () => (await req<WorkerDir[] | null>("GET", "/api/workers")) ?? [],

  registerOrg: (b: { name: string; type: "ttc" | "company"; email?: string }) =>
    req<OrgDir>("POST", "/api/orgs", b),

  listOrgs: async (type?: "ttc" | "company") =>
    (await req<OrgDir[] | null>("GET", `/api/orgs${type ? `?type=${type}` : ""}`)) ?? [],

  issueCredential: (b: {
    schemaId: string;
    issuerDID: string;
    subjectDID: string;
    claims: Record<string, unknown>;
    expiry?: string;
  }) => req<{ credHash: string }>("POST", "/api/credentials", b),

  verify: (credHash: string) => req<VerifyResult>("GET", `/api/verify/${credHash}`),

  getCredential: (credHash: string) =>
    req<CredentialBody>("GET", `/api/credentials/${credHash}`),

  revoke: (b: { credHash: string; reasonCode: string }) =>
    req<{ status: string; credHash: string }>("POST", "/api/revoke", b),

  corroborate: (b: { credHash: string; sourceDID: string; evidenceHash: string }) =>
    req<{ status: string; credHash: string }>("POST", "/api/corroborate", b),

  disclose: (b: {
    credHash: string;
    attribute: string;
    op: string;
    value: number;
    verifierDID: string;
  }) =>
    req<{ predicate: string; result: boolean; consentHash: string }>(
      "POST",
      "/api/disclose",
      b
    ),

  updateStanding: (b: { agencyDID: string; delta: number; evidenceHash: string }) =>
    req<{ agencyDID: string; score: number }>("POST", "/api/agency-standing", b),

  getStanding: (did: string) =>
    req<{ agencyDID: string; score: number }>("GET", `/api/agency-standing/${did}`),

  // The backend marshals an empty wallet as JSON null — coerce to [].
  wallet: async (subjectDID: string) =>
    (await req<WalletEntry[] | null>("GET", `/api/wallet/${subjectDID}`)) ?? [],

  createContract: (b: {
    workerDID: string;
    employerDID: string;
    employer: string;
    position: string;
    salary: number;
    currency: string;
    term: string;
    jobId?: string;
  }) => req<{ contractHash: string; status: string }>("POST", "/api/contracts", b),

  signContract: (b: { contractHash: string; workerDID: string }) =>
    req<{ status: string; contractHash: string }>("POST", "/api/contracts/sign", b),

  approveContract: (b: { contractHash: string; employerDID: string }) =>
    req<{ status: string; contractHash: string }>("POST", "/api/contracts/approve", b),

  getContract: (hash: string) => req<ContractEntry>("GET", `/api/contracts/${hash}`),

  // Empty list marshals as null → coerce to [].
  listContractsBy: async (did: string) =>
    (await req<ContractEntry[] | null>("GET", `/api/contracts/by/${did}`)) ?? [],
};
