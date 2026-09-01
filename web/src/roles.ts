// The four actors in the Employment Passport network. Each logs in to its own
// portal and only sees the operations it is authorised to perform.
export type Role = "ttc" | "worker" | "employer" | "bmet";

export type Tab =
  | "dashboard" | "issuer" | "wallet" | "admin"
  | "jobs" | "applications" | "postings" | "applicants"
  | "wcontracts" | "econtracts";

export interface RoleDef {
  id: Role;
  name: string;
  short: string;
  icon: string;
  tagline: string;
  user: string; // login username (email for orgs; workers use their DID)
  pass: string; // demo password checked at sign-in
  did?: string; // fixed DID for org actors (workers get theirs at registration)
  nav: { id: Tab; label: string; icon: string; sub: string }[];
}

export const ROLES: Record<Role, RoleDef> = {
  ttc: {
    id: "ttc",
    name: "Skills Training Center",
    short: "Training Center",
    icon: "🏫",
    tagline: "Issue verified skill certificates to workers you've trained.",
    user: "registrar@ttc-dhaka.gov.bd",
    pass: "ttc-1234",
    did: "did:key:ttc-dhaka",
    nav: [{ id: "issuer", label: "Issue Certificate", icon: "✎", sub: "Certify a skill" }],
  },
  worker: {
    id: "worker",
    name: "Migrant Worker",
    short: "Worker",
    icon: "👷",
    tagline: "Hold your skill certificates, find jobs and apply.",
    user: "your DID",
    pass: "worker-1234",
    nav: [
      { id: "wallet", label: "My Certificates", icon: "▤", sub: "Skills & sharing" },
      { id: "jobs", label: "Find Jobs", icon: "🔎", sub: "Browse & apply" },
      { id: "applications", label: "My Applications", icon: "📨", sub: "Track status" },
      { id: "wcontracts", label: "My Contracts", icon: "📄", sub: "Review & sign" },
    ],
  },
  employer: {
    id: "employer",
    name: "Foreign Employer / Agency",
    short: "Company",
    icon: "🏢",
    tagline: "Post jobs and verify applicants' certificates before hiring.",
    user: "hr@saudico.com",
    pass: "emp-1234",
    did: "did:key:employer",
    nav: [
      { id: "postings", label: "Job Postings", icon: "📋", sub: "Create & manage" },
      { id: "applicants", label: "Applicants", icon: "🧑‍💼", sub: "Verify & hire" },
      { id: "econtracts", label: "Contracts", icon: "📑", sub: "Draft & approve" },
    ],
  },
  bmet: {
    id: "bmet",
    name: "BMET Regulator",
    short: "BMET",
    icon: "🏛️",
    tagline: "Govern the network: monitor activity, score trust, revoke fraud.",
    user: "admin@bmet.gov.bd",
    pass: "bmet-1234",
    did: "did:key:bmet",
    nav: [
      { id: "dashboard", label: "Overview", icon: "▧", sub: "Network activity" },
      { id: "admin", label: "Governance", icon: "⚙", sub: "Trust & revocation" },
    ],
  },
};

export const ROLE_LIST: RoleDef[] = [ROLES.ttc, ROLES.worker, ROLES.employer, ROLES.bmet];
