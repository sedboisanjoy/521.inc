// Data-flow templates for the in-app visualization. Every operation the app
// performs is mapped to a canonical Hyperledger-Fabric control-flow path so a
// user can watch, on-screen, *where* the entry they just submitted goes and
// *how* it is validated (off-chain vault vs on-chain anchor → propose → endorse
// under AND(TTC,BMET) → order → block validate → commit). The mock ledger does
// not expose per-tx endorsement traces, so these are canonical templates
// interpolated with the entry's real identifiers.
import type { Activity } from "./store";
import type { WalletEntry, WorkerDir, OrgDir, ContractEntry } from "./api";

// The nodes on the flow rail. Coordinates are in the SVG user space that
// FlowViz renders (viewBox 0 0 640 380).
export type FlowActor =
  | "client" | "vault" | "ttc" | "company" | "bmet" | "orderer" | "peers" | "ledger"
  | "bank" | "ministry" | "rjsc" | "bfiu" | "agency";

export interface ActorMeta {
  label: string;
  icon: string;
  x: number;
  y: number;
  offchain?: boolean;
}

export const ACTORS: Record<FlowActor, ActorMeta> = {
  client:  { label: "CLIENT / WALLET",   icon: "box",      x: 60,  y: 190 },
  vault:   { label: "OFF-CHAIN VAULT",   icon: "eyeOff",   x: 60,  y: 330, offchain: true },
  ttc:     { label: "TRAINING PEER",     icon: "school",   x: 230, y: 58 },
  company: { label: "COMPANY PEER",      icon: "building", x: 400, y: 58 },
  bmet:    { label: "BMET PEER",         icon: "shield",   x: 590, y: 120 },
  rjsc:    { label: "RJSC PEER",         icon: "registry", x: 180, y: 130 },
  bfiu:    { label: "BFIU PEER",         icon: "aml",      x: 180, y: 250 },
  bank:    { label: "BANK PEER",         icon: "bank",     x: 420, y: 250 },
  ministry:{ label: "MINISTRY",          icon: "gavel",    x: 590, y: 250 },
  agency:  { label: "AGENCY / WALLET",   icon: "agency",   x: 60,  y: 60 },
  orderer: { label: "ORDERING SERVICE",  icon: "gear",     x: 320, y: 185 },
  peers:   { label: "ALL PEERS",         icon: "users",    x: 320, y: 320 },
  ledger:  { label: "LEDGER / STATE",    icon: "document", x: 575, y: 330 },
};

export type FlowPhase =
  | "offchain" | "propose" | "endorse" | "order" | "validate" | "commit" | "read" | "penalty";

// A single hop in the flow: the packet travels from → to, the caption explains
// what happens, phase drives the colour, onChain tags whether it touches the
// ledger, and endorser (when set) ticks the endorsement-policy checklist.
export interface FlowStep {
  from: FlowActor;
  to: FlowActor;
  label: string;
  phase: FlowPhase;
  onChain: boolean;
  endorser?: "ttc" | "bmet";
}

// A normalized description of the thing being animated. Both an activity-log
// entry and a picked record collapse into this.
export interface FlowSubject {
  kind: string;
  actor: string;
  detail?: string;
  ok: boolean;
  label: string;
}

export interface FlowPlan {
  title: string;
  subtitle?: string;
  steps: FlowStep[];
  policy?: string;
  policyActors?: ("ttc" | "bmet")[];
}

const POLICY = "AND(TTCMSP, BMETMSP)";
const POLICY_ACTORS: ("ttc" | "bmet")[] = ["ttc", "bmet"];

function short(s?: string): string {
  if (!s) return "";
  return s.length > 22 ? `${s.slice(0, 12)}…${s.slice(-8)}` : s;
}

// The canonical on-chain write path: propose to each endorsing peer, collect
// signatures under AND(TTC,BMET), order into a block, re-validate, commit.
function onChainWrite(proposeLabel: string, commitLabel: string): FlowStep[] {
  return [
    { from: "client", to: "ttc", label: proposeLabel, phase: "propose", onChain: true },
    { from: "ttc", to: "client", label: "Training-center peer simulated, validated and signed the transaction", phase: "endorse", onChain: true, endorser: "ttc" },
    { from: "client", to: "bmet", label: "Same proposal sent to the BMET peer", phase: "propose", onChain: true },
    { from: "bmet", to: "client", label: "BMET peer validated and signed — AND(TTC,BMET) policy satisfied", phase: "endorse", onChain: true, endorser: "bmet" },
    { from: "client", to: "orderer", label: "Both endorsements assembled and submitted to the ordering service", phase: "order", onChain: true },
    { from: "orderer", to: "peers", label: "Orderer cut a block; every peer re-checked the policy and MVCC read-conflicts", phase: "validate", onChain: true },
    { from: "peers", to: "ledger", label: commitLabel, phase: "commit", onChain: true },
  ];
}

// Map a normalized subject to its full animated plan.
export function flowFor(s: FlowSubject): FlowPlan {
  const d = short(s.detail);
  const withHash = d ? `hash ${d}` : undefined;

  switch (s.kind) {
    case "issue": {
      if (!s.ok) {
        return {
          title: "Issue Skill Certificate — Failed",
          subtitle: s.detail,
          steps: [
            { from: "client", to: "ttc", label: "Transaction proposal sent", phase: "propose", onChain: true },
            { from: "ttc", to: "client", label: `Failed: ${s.detail || "endorsement did not match"} — nothing was committed`, phase: "endorse", onChain: false },
          ],
        };
      }
      return {
        title: "Issue Skill Certificate",
        subtitle: withHash,
        policy: POLICY,
        policyActors: POLICY_ACTORS,
        steps: [
          { from: "client", to: "vault", label: "Certificate body (trade, level, score) stored in the off-chain vault — the Golden Rule", phase: "offchain", onChain: false },
          ...onChainWrite(
            "Only the salted hash is sent as a transaction proposal to the training-center peer",
            "Certificate hash committed in a block — stored immutably"
          ),
        ],
      };
    }

    case "register":
      return {
        title: "Registration — Create DID",
        subtitle: withHash,
        policy: POLICY,
        policyActors: POLICY_ACTORS,
        steps: [
          { from: "client", to: "vault", label: "Personal data (name, NID, address) kept in the off-chain vault — only a hash goes on-chain", phase: "offchain", onChain: false },
          ...onChainWrite(
            "Proposal to register the new DID in the registry",
            "New DID committed to the ledger — now known across the network"
          ),
        ],
      };

    case "verify":
      if (s.ok) {
        return {
          title: "Verify Certificate (read-only)",
          subtitle: withHash,
          steps: [
            { from: "client", to: "ledger", label: "Verifier read the certificate status from the ledger — no new block is created", phase: "read", onChain: true },
            { from: "ledger", to: "client", label: "Result: certificate ACTIVE ✓ · issuer trust and corroboration scores returned", phase: "read", onChain: true },
          ],
        };
      }
      return {
        title: "Verify Certificate — Not Found",
        subtitle: s.detail,
        steps: [
          { from: "client", to: "ledger", label: "Verifier searched the ledger for the certificate", phase: "read", onChain: true },
          { from: "ledger", to: "client", label: "Certificate is not on the blockchain — do not trust this document", phase: "read", onChain: false },
        ],
      };

    case "revoke":
      return {
        title: "Revoke Certificate",
        subtitle: withHash,
        policy: POLICY,
        policyActors: POLICY_ACTORS,
        steps: onChainWrite(
          "Proposal to revoke the certificate",
          "Committed with status 'REVOKED' — nothing is deleted, the history remains"
        ),
      };

    case "standing":
      return {
        title: "Trust Score Update",
        subtitle: withHash,
        policy: POLICY,
        policyActors: POLICY_ACTORS,
        steps: onChainWrite(
          "Proposal to change the trust score",
          "New trust score committed to the ledger — applied to every future verification"
        ),
      };

    case "corroborate":
      return {
        title: "Add Corroboration",
        subtitle: withHash,
        policy: POLICY,
        policyActors: POLICY_ACTORS,
        steps: onChainWrite(
          "Proposal to corroborate from a registered source",
          "Corroboration score increase committed to the ledger"
        ),
      };

    case "contract":
      return {
        title: "Create Contract",
        subtitle: withHash,
        policy: POLICY,
        policyActors: POLICY_ACTORS,
        steps: [
          { from: "client", to: "vault", label: "Contract terms (position, salary, term) kept in the off-chain vault — only a hash goes on-chain", phase: "offchain", onChain: false },
          ...onChainWrite(
            "Proposal sent with the contract hash",
            "Contract hash committed — status PENDING (awaiting the worker's signature)"
          ),
        ],
      };

    case "sign":
      return {
        title: "Worker Signs the Contract",
        subtitle: withHash,
        policy: POLICY,
        policyActors: POLICY_ACTORS,
        steps: onChainWrite(
          "State-change proposal sent with the worker's signature",
          "Signature committed — status WORKER_SIGNED (awaiting company approval)"
        ),
      };

    case "approve":
      return {
        title: "Contract Final Approval",
        subtitle: withHash,
        policy: POLICY,
        policyActors: POLICY_ACTORS,
        steps: onChainWrite(
          "Proposal sent with the company's approval",
          "Approval committed — status SIGNED, contract complete and immutable"
        ),
      };

    case "disclose":
      return {
        title: "Prove Without Revealing (Selective Disclosure)",
        subtitle: withHash,
        steps: [
          { from: "client", to: "vault", label: "The wallet only checked the predicate (e.g. level ≥ 3) — the real value was never revealed", phase: "offchain", onChain: false },
          { from: "client", to: "ledger", label: "Certificate status checked on the ledger (read)", phase: "read", onChain: true },
          { from: "client", to: "company", label: "Only the true/false result and a consent receipt were shared with the company", phase: "offchain", onChain: false },
        ],
      };

    case "post":
      return {
        title: "Job Posting (off-chain marketplace)",
        subtitle: s.detail,
        steps: [
          { from: "client", to: "vault", label: "Job posting stored in the browser — this is marketplace data, it does not go on-chain", phase: "offchain", onChain: false },
        ],
      };

    case "apply":
      return {
        title: "Job Application (off-chain marketplace)",
        subtitle: s.detail,
        steps: [
          { from: "client", to: "vault", label: "Application and the presented certificate hash stored in the browser (off-chain)", phase: "offchain", onChain: false },
          { from: "vault", to: "company", label: "The company will later verify this certificate on the blockchain", phase: "offchain", onChain: false },
        ],
      };

    case "hire":
      return {
        title: "Hiring Decision (off-chain)",
        subtitle: s.detail,
        steps: [
          { from: "client", to: "company", label: "Applicant selected for hiring (off-chain marketplace)", phase: "offchain", onChain: false },
          { from: "company", to: "vault", label: "Next the company drafts a contract — its hash will go on the blockchain", phase: "offchain", onChain: false },
        ],
      };

    case "report":
      return {
        title: "Company Complaint (off-chain)",
        subtitle: s.detail,
        steps: [
          { from: "client", to: "bmet", label: "Complaint sent to BMET (off-chain) — BMET will lower the weight later", phase: "offchain", onChain: false },
        ],
      };

    case "employ_proof":
      return {
        title: "Employment Proof",
        subtitle: withHash,
        policy: POLICY,
        policyActors: POLICY_ACTORS,
        steps: [
          { from: "client", to: "vault", label: "Employment record (dates, role) kept off-chain", phase: "offchain", onChain: false },
          ...onChainWrite("Proposal: anchor ‘this DID worked here’", "Employment proof committed — it gates the worker's right to review"),
        ],
      };

    case "review":
      return {
        title: "Verified-Anonymous Review",
        subtitle: withHash,
        steps: [
          { from: "client", to: "vault", label: "Review text stays off-chain; only a salted hash is anchored", phase: "offchain", onChain: false },
          { from: "client", to: "peers", label: "Wallet derives a one-time nullifier = hash(linkSecret | company) and proves valid employment (ZK)", phase: "propose", onChain: true },
          { from: "peers", to: "ledger", label: "Nullifier unseen → accepted: one verified voice per employee per employer", phase: "validate", onChain: true },
          { from: "peers", to: "ledger", label: "Review hash committed; the company's transparency digest updates", phase: "commit", onChain: true },
        ],
      };

    case "wage":
      return {
        title: "Wage Event (awaiting bank)",
        subtitle: withHash,
        steps: [
          { from: "client", to: "vault", label: "Salary amount kept off-chain in the vault", phase: "offchain", onChain: false },
          { from: "client", to: "company", label: "Employer anchors the wage event", phase: "propose", onChain: true },
          { from: "company", to: "ledger", label: "Committed as PENDING_BANK — a wage record needs the bank's independent co-sign", phase: "commit", onChain: true },
        ],
      };

    case "wage_cosign":
      return {
        title: "Bank Co-signs the Wage Event",
        subtitle: withHash,
        steps: [
          { from: "client", to: "bank", label: "Bank independently corroborates the wage record (employer + bank, §6.2)", phase: "propose", onChain: true },
          { from: "bank", to: "ledger", label: "Corroboration score 1 → 2 · status CONFIRMED — now trusted income history", phase: "commit", onChain: true },
        ],
      };

    case "violation":
      return {
        title: "Violation Signal → Ministry",
        subtitle: s.detail,
        steps: [
          { from: "client", to: "ledger", label: "Corroborated violation flag read from the review", phase: "read", onChain: true },
          { from: "ledger", to: "ministry", label: "Scoped alert routed to the ministry — evidence only, no reviewer identity", phase: "penalty", onChain: true },
        ],
      };

    case "inspection":
      return {
        title: "Ministry Inspection Outcome",
        subtitle: withHash,
        policy: POLICY,
        policyActors: POLICY_ACTORS,
        steps: [
          { from: "client", to: "ledger", label: "Ministry investigates under its own legal authority", phase: "read", onChain: true },
          ...onChainWrite("Anchor the InspectionReport + a standing delta", "Outcome committed; the company's transparency score updates"),
        ],
      };

    case "endorse":
      return {
        title: "Staked Endorsement",
        subtitle: withHash,
        policy: POLICY,
        policyActors: POLICY_ACTORS,
        steps: onChainWrite("A manager stakes reputation to endorse a specific competence", "Endorsement committed; the endorser's standing rises (+2)"),
      };

    case "dispute":
      return {
        title: "Endorsement Disputed",
        subtitle: withHash,
        policy: POLICY,
        policyActors: POLICY_ACTORS,
        steps: onChainWrite("A dispute is filed against the endorsement", "Endorsement revoked; the endorser's standing is slashed (−12)"),
      };

    case "company_reg":
      return {
        title: "Company Registration (RJSC)",
        subtitle: withHash,
        steps: [
          { from: "client", to: "rjsc", label: "RJSC attests the company's legal existence", phase: "propose", onChain: true },
          { from: "rjsc", to: "ledger", label: "CompanyRegistration committed — the company is now a regulator-verified subject", phase: "commit", onChain: true },
        ],
      };

    case "ubo":
      return {
        title: "Beneficial-Ownership Proof",
        subtitle: withHash,
        steps: [
          { from: "client", to: "vault", label: "The full cap table stays off-chain — never published", phase: "offchain", onChain: false },
          { from: "client", to: "bfiu", label: "Prove ‘no owner above 25% is sanctioned/PEP’ — a threshold, not the owners", phase: "propose", onChain: true },
          { from: "bfiu", to: "ledger", label: "Threshold proof anchored; ownership stays private", phase: "commit", onChain: true },
        ],
      };

    case "procurement":
      return {
        title: "Procurement Award",
        subtitle: withHash,
        steps: [
          { from: "client", to: "rjsc", label: "Procuring entity submits the tender award + conflict-check result", phase: "propose", onChain: true },
          { from: "rjsc", to: "ledger", label: "Procurement award committed — publicly verifiable", phase: "commit", onChain: true },
        ],
      };

    case "match":
      return {
        title: "Privacy-Preserving Matching (read-only)",
        subtitle: s.detail,
        steps: [
          { from: "client", to: "ledger", label: "Employer asks ‘level-3 electrician, no conduct finding?’", phase: "read", onChain: true },
          { from: "ledger", to: "client", label: "Only the matching DIDs are returned — raw claims never leave the wallet", phase: "read", onChain: true },
        ],
      };

    case "wagebill":
      return {
        title: "Wage-Bill Disclosure",
        subtitle: s.detail,
        steps: [
          { from: "client", to: "vault", label: "Company discloses its total wage bill for reconciliation", phase: "offchain", onChain: false },
          { from: "vault", to: "ledger", label: "Reconciled against the sum of CONFIRMED wage events on the ledger", phase: "read", onChain: true },
        ],
      };

    case "licence":
      return {
        title: "Agency Licence (BMET)",
        subtitle: withHash,
        steps: [
          { from: "bmet", to: "agency", label: "BMET verifies the agency's legal existence and issues an AgencyLicence", phase: "propose", onChain: true },
          { from: "agency", to: "ledger", label: "Licence anchored — only a licensed agency may submit applications", phase: "commit", onChain: true },
        ],
      };

    case "application":
      return {
        title: "Agency-Mediated Application",
        subtitle: withHash,
        steps: [
          { from: "agency", to: "vault", label: "Asserted claims (experience, languages) — the agency's own word — kept off-chain", phase: "offchain", onChain: false },
          { from: "agency", to: "ledger", label: "Attested refs point to already-anchored credentials — auto-verified, no agency risk", phase: "read", onChain: true },
          { from: "agency", to: "company", label: "Application submitted: proven claims + asserted claims the agency STAKES its standing on", phase: "propose", onChain: true },
          { from: "company", to: "ledger", label: "Application record anchored (attested refs + assertedHash)", phase: "commit", onChain: true },
        ],
      };

    case "contradiction":
      return {
        title: "Automatic Contradiction (tier-1)",
        subtitle: s.detail,
        steps: [
          { from: "agency", to: "ledger", label: "Chaincode compares the asserted claim against the attested certificate", phase: "read", onChain: true },
          { from: "ledger", to: "agency", label: s.detail || "Asserted claim contradicts anchored data — flagged automatically, immediate standing effect", phase: "penalty", onChain: true },
        ],
      };

    case "allege":
      return {
        title: "Employer Alleges a Mismatch (tier-3)",
        subtitle: s.detail,
        steps: [
          { from: "company", to: "ledger", label: "Employer files AllegeMismatch against an asserted field", phase: "propose", onChain: true },
          { from: "ledger", to: "agency", label: "Anchored as an ALLEGATION, not a finding — 14-day response window opens, no standing effect yet", phase: "commit", onChain: true },
        ],
      };

    case "respond":
      return {
        title: "Agency Responds (within window)",
        subtitle: withHash,
        steps: [
          { from: "agency", to: "ledger", label: "Agency anchors a counter-claim inside the 14-day window", phase: "propose", onChain: true },
          { from: "ledger", to: "company", label: "Response recorded — awaiting regulator + observer resolution", phase: "commit", onChain: true },
        ],
      };

    case "resolve":
      return {
        title: "Standing Adjustment — Regulator + Observer (2-of-2)",
        subtitle: s.detail,
        steps: [
          { from: "bmet", to: "ledger", label: "Regulator (BMET) signs the outcome", phase: "endorse", onChain: true },
          { from: "ministry", to: "ledger", label: "Independent observer co-signs — 2-of-2 satisfied; no party can move standing alone", phase: "endorse", onChain: true },
          { from: "ledger", to: "agency", label: "Only on the full 2-of-2: upheld allegation slashes the agency's computed standing", phase: "penalty", onChain: true },
        ],
      };

    default:
      return {
        title: s.label || "Transaction",
        subtitle: s.detail,
        policy: POLICY,
        policyActors: POLICY_ACTORS,
        steps: onChainWrite("Transaction proposal sent", "Committed in a block — ledger updated"),
      };
  }
}

// Adapter: activity-log entry → subject.
export function subjectFromActivity(a: Activity): FlowSubject {
  return { kind: a.kind, actor: a.actor, detail: a.detail, ok: a.ok, label: a.title };
}

// Adapter: a picked real record → subject. Used by the explorer / replay
// buttons to reconstruct the operation that produced a record.
export function subjectFromRecord(
  type: "cert" | "worker" | "contract" | "org",
  record: WalletEntry | WorkerDir | ContractEntry | OrgDir
): FlowSubject {
  switch (type) {
    case "cert": {
      const c = record as WalletEntry;
      return {
        kind: "issue",
        actor: "Training Center",
        detail: c.credHash,
        ok: c.anchor?.status !== "REVOKED",
        label: `Certificate · ${c.schemaId}`,
      };
    }
    case "worker": {
      const w = record as WorkerDir;
      return { kind: "register", actor: "Worker", detail: w.did, ok: true, label: `Worker registration · ${w.name}` };
    }
    case "org": {
      const o = record as OrgDir;
      return {
        kind: "register",
        actor: o.type === "ttc" ? "Training Center" : "Company",
        detail: o.did,
        ok: true,
        label: `Organization registration · ${o.name}`,
      };
    }
    case "contract": {
      const c = record as ContractEntry;
      const status = c.anchor?.status || "PENDING";
      const kind = status === "SIGNED" ? "approve" : status === "WORKER_SIGNED" ? "sign" : "contract";
      return { kind, actor: "Company", detail: c.contractHash, ok: true, label: `Contract · ${c.position}` };
    }
  }
}
