// The four actors in the Employment Passport network. Each logs in to its own
// portal and only sees the operations it is authorised to perform.
export type Role = "ttc" | "worker" | "employer" | "bmet";

export type Tab =
  | "dashboard" | "issuer" | "wallet" | "admin" | "reports"
  | "jobs" | "applications" | "postings" | "applicants"
  | "wcontracts" | "econtracts" | "flow";

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
    name: "Skill Training Center",
    short: "Training Center",
    icon: "school",
    tagline: "Issue verified skill certificates to trained workers.",
    user: "registrar@ttc-dhaka.gov.bd",
    pass: "ttc-1234",
    did: "did:key:ttc-dhaka",
    nav: [
      { id: "issuer", label: "Issue Certificate", icon: "certificate", sub: "Verify skills" },
      { id: "flow", label: "Data Flow", icon: "flow", sub: "Visual audit" },
    ],
  },
  worker: {
    id: "worker",
    name: "Migrant Worker",
    short: "Worker",
    icon: "worker",
    tagline: "Keep your certificates, find jobs and apply.",
    user: "your DID",
    pass: "worker-1234",
    nav: [
      { id: "wallet", label: "My Certificates", icon: "certificate", sub: "Skills and sharing" },
      { id: "jobs", label: "Find Jobs", icon: "search", sub: "Browse and apply" },
      { id: "applications", label: "My Applications", icon: "inbox", sub: "Track status" },
      { id: "wcontracts", label: "My Contracts", icon: "document", sub: "Read and sign" },
      { id: "flow", label: "Data Flow", icon: "flow", sub: "Visual audit" },
    ],
  },
  employer: {
    id: "employer",
    name: "Foreign Employer / Agency",
    short: "Company",
    icon: "building",
    tagline: "Post job listings and verify certificates before hiring.",
    user: "hr@saudico.com",
    pass: "emp-1234",
    did: "did:key:employer",
    nav: [
      { id: "postings", label: "Job Postings", icon: "clipboard", sub: "Create and manage" },
      { id: "applicants", label: "Applicants", icon: "users", sub: "Verify and hire" },
      { id: "econtracts", label: "Contracts", icon: "document", sub: "Create and approve" },
      { id: "flow", label: "Data Flow", icon: "flow", sub: "Visual audit" },
    ],
  },
  bmet: {
    id: "bmet",
    name: "BMET Regulator",
    short: "BMET",
    icon: "shield",
    tagline: "Manage the network: view activity, assign trust scores, revoke fraud.",
    user: "admin@bmet.gov.bd",
    pass: "bmet-1234",
    did: "did:key:bmet",
    nav: [
      { id: "dashboard", label: "Overview", icon: "grid", sub: "Network activity" },
      { id: "reports", label: "Complaints", icon: "alert", sub: "Against training centers" },
      { id: "admin", label: "Controls", icon: "gear", sub: "Trust and revocation" },
      { id: "flow", label: "Data Flow", icon: "flow", sub: "Visual audit" },
    ],
  },
};

export const ROLE_LIST: RoleDef[] = [ROLES.ttc, ROLES.worker, ROLES.employer, ROLES.bmet];
