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

export const api = {
  registerWorker: (b: { name: string; nid: string; address: string }) =>
    req<{ workerId: string; did: string }>("POST", "/api/workers", b),

  issueCredential: (b: {
    schemaId: string;
    issuerDID: string;
    subjectDID: string;
    claims: Record<string, unknown>;
    expiry?: string;
  }) => req<{ credHash: string }>("POST", "/api/credentials", b),

  verify: (credHash: string) => req<VerifyResult>("GET", `/api/verify/${credHash}`),

  revoke: (b: { credHash: string; reasonCode: string }) =>
    req<{ status: string; credHash: string }>("POST", "/api/revoke", b),

  corroborate: (b: { credHash: string; sourceDID: string; evidenceHash: string }) =>
    req<{ status: string }>("POST", "/api/corroborate", b),

  disclose: (b: {
    credHash: string;
    attribute: string;
    op: string;
    value: number;
    verifierDID: string;
  }) => req<{ predicate: string; result: boolean; consentHash: string }>("POST", "/api/disclose", b),

  updateStanding: (b: { agencyDID: string; delta: number; evidenceHash: string }) =>
    req<{ agencyDID: string; score: number }>("POST", "/api/agency-standing", b),

  getStanding: (did: string) =>
    req<{ agencyDID: string; score: number }>("GET", `/api/agency-standing/${did}`),

  wallet: (subjectDID: string) => req<WalletEntry[]>("GET", `/api/wallet/${subjectDID}`),
};
