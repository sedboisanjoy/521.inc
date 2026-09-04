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
  type: "ttc" | "company" | "agency";
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

// §3.1 response shapes.
export interface Digest {
  companyDID: string;
  reviewers: number;
  recommendPct: number;
  openConduct: number;
  wageEvents: number;
}
export interface Violation {
  id: string;
  companyDID: string;
  company: string;
  code: string;
  reviewHash: string;
  status: string;
  outcome?: string;
  escalationReason?: string;
  corroborators?: number;
  at: string;
}
export interface WageEntry {
  credHash: string;
  workerDID?: string;
  claims: Record<string, unknown>;
  anchor?: VerifyResult;
}
export interface Reconciliation {
  companyDID: string;
  disclosed: number;
  anchored: number;
  reconciled: boolean;
}
export interface MatchResult {
  predicate: string;
  count: number;
  matches: string[];
}

// §3.8 agency accountability shapes.
export interface AgencyDigest {
  agencyDID: string;
  placements: number;
  distinctEmployers: number;
  contradictions: number;
  upheldDisputes: number;
  corroborationPct: number;
  score: number;
  rated: boolean;
}
export interface AgencyLicenceRow {
  agencyDID: string;
  legalName: string;
  status: string;
  credHash: string;
  digest: AgencyDigest;
}
export interface AppRecord {
  id: string;
  employerDID: string;
  employer: string;
  agencyDID: string;
  agency: string;
  workerDID: string;
  workerName: string;
  orderRef?: string;
  attestedRefs: string[];
  asserted: Record<string, unknown>;
  assertedHash: string;
  appHash: string;
  contradiction: boolean;
  contradictionNote?: string;
  status: string;
  at: string;
}
export interface Allegation {
  id: string;
  applicationId: string;
  agencyDID: string;
  agency: string;
  employerDID: string;
  claim: string;
  detail: string;
  allegationHash: string;
  status: string; // open | responded | upheld | dismissed | uncontested
  responseDeadline: number;
  respondedAt?: string;
  responseHash?: string;
  regulatorOK: boolean;
  observerOK: boolean;
  outcome?: string;
  at: string;
}

export const api = {
  health: () => req<{ status: string; time: string }>("GET", "/api/health"),

  registerWorker: (b: { name: string; nid: string; address: string }) =>
    req<{ workerId: string; did: string }>("POST", "/api/workers", b),

  // Worker directory for issuers. Empty list marshals as null → coerce to [].
  listWorkers: async () => (await req<WorkerDir[] | null>("GET", "/api/workers")) ?? [],

  registerOrg: (b: { name: string; type: "ttc" | "company" | "agency"; email?: string }) =>
    req<OrgDir>("POST", "/api/orgs", b),

  listOrgs: async (type?: "ttc" | "company" | "agency") =>
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

  // ── §3.1 Surface 2: workplace transparency ──────────────────────────────
  issueEmploymentProof: (b: { employerDID: string; employer: string; workerDID: string; since?: string }) =>
    req<{ credHash: string }>("POST", "/api/employment-proofs", b),
  submitReview: (b: {
    companyDID: string; company: string; workerDID: string; linkSecret: string;
    rating: number; recommend: boolean; violationCode: string; text: string;
  }) => req<{ reviewHash: string; nullifier: string; escalated: boolean; reason: string }>("POST", "/api/reviews", b),
  companyDigest: (did: string) =>
    req<Digest>("GET", `/api/companies/${did}/digest`),

  // ── §3.1 Surface 5: enforcement ─────────────────────────────────────────
  listViolations: async (status = "open") =>
    (await req<Violation[] | null>("GET", `/api/violations?status=${status}`)) ?? [],
  recordInspection: (b: { violationId: string; companyDID: string; outcome: string; delta: number }) =>
    req<{ status: string; inspectionHash: string; score: number }>("POST", "/api/violations/inspect", b),

  // ── §3.1 Surface 4: Operations Suite (wage events) ──────────────────────
  createWageEvent: (b: { employerDID: string; employer: string; workerDID: string; amount: number; month: string; currency?: string }) =>
    req<{ credHash: string; status: string }>("POST", "/api/wage-events", b),
  cosignWageEvent: (b: { credHash: string; bankDID: string }) =>
    req<{ status: string; credHash: string }>("POST", "/api/wage-events/cosign", b),
  listWageEvents: async (did: string, as?: "issuer" | "subject") =>
    (await req<WageEntry[] | null>("GET", `/api/wage-events/by/${did}${as ? `?as=${as}` : ""}`)) ?? [],
  pendingWages: async () =>
    (await req<WageEntry[] | null>("GET", "/api/wage-events/pending")) ?? [],

  // ── §3.1 Surface 3: corporate identity ──────────────────────────────────
  registerCompanyOnChain: (b: { companyDID: string; legalName: string; regNo: string }) =>
    req<{ credHash: string }>("POST", "/api/companies", b),
  proveUBO: (did: string, b: { thresholdOk: boolean; note: string }) =>
    req<{ credHash: string; proofHash: string; thresholdOk: boolean }>("POST", `/api/companies/${did}/ubo`, b),
  discloseWageBill: (did: string, amount: number) =>
    req<{ companyDID: string; wageBillDisclosed: number }>("POST", `/api/companies/${did}/wagebill`, { amount }),
  reconciliation: (did: string) =>
    req<Reconciliation>("GET", `/api/companies/${did}/reconciliation`),
  anchorProcurement: (b: { companyDID: string; title: string; amount: number; conflictOk: boolean }) =>
    req<{ credHash: string; conflictHash: string }>("POST", "/api/procurement", b),

  // ── §3.1 Surface 1 gaps: endorsements + matching ────────────────────────
  issueEndorsement: (b: { endorserDID: string; endorser: string; workerDID: string; competence: string }) =>
    req<{ credHash: string }>("POST", "/api/endorsements", b),
  disputeEndorsement: (b: { credHash: string; endorserDID: string }) =>
    req<{ status: string; score: number }>("POST", "/api/endorsements/dispute", b),
  match: (b: { trade: string; minLevel: number; noConduct: boolean }) =>
    req<MatchResult>("POST", "/api/match", b),

  // ── §3.8 Agency accountability ──────────────────────────────────────────
  issueAgencyLicence: (b: { agencyDID: string; legalName: string; corridors?: string; validUntil?: string }) =>
    req<{ credHash: string }>("POST", "/api/agency-licences", b),
  listAgencyLicences: async () =>
    (await req<AgencyLicenceRow[] | null>("GET", "/api/agency-licences")) ?? [],
  submitApplication: (b: {
    employerDID: string; employer: string; agencyDID: string;
    workerDID: string; workerName: string; orderRef?: string;
    attestedRefs: string[]; asserted: Record<string, unknown>;
  }) => req<AppRecord>("POST", "/api/applications", b),
  applicationsByEmployer: async (did: string) =>
    (await req<AppRecord[] | null>("GET", `/api/applications/by-employer/${did}`)) ?? [],
  applicationsByAgency: async (did: string) =>
    (await req<AppRecord[] | null>("GET", `/api/applications/by-agency/${did}`)) ?? [],
  hireApplication: (id: string) =>
    req<AppRecord>("POST", `/api/applications/${id}/hire`, {}),
  allegeMismatch: (b: { applicationId: string; claim: string; detail: string }) =>
    req<Allegation>("POST", "/api/allegations", b),
  respondAllegation: (id: string, b: { agencyDID: string; counterClaim: string }) =>
    req<Allegation>("POST", `/api/allegations/${id}/respond`, b),
  endorseAllegation: (id: string, b: { by: "regulator" | "observer"; outcome?: string }) =>
    req<{ allegation: Allegation; score: number }>("POST", `/api/allegations/${id}/endorse`, b),
  closeAllegationWindow: (id: string) =>
    req<{ allegation: Allegation; score: number }>("POST", `/api/allegations/${id}/close-window`, {}),
  listAllegations: async (status = "all") =>
    (await req<Allegation[] | null>("GET", `/api/allegations?status=${status}`)) ?? [],
  allegationsByAgency: async (did: string) =>
    (await req<Allegation[] | null>("GET", `/api/allegations/by-agency/${did}`)) ?? [],
  agencyDigest: (did: string) =>
    req<AgencyDigest>("GET", `/api/agencies/${did}/standing-digest`),
};
