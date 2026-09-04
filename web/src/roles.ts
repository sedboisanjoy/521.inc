// The actors in the Employment Passport network. Each logs in to its own portal
// and only sees the operations it is authorised to perform. The four original
// roles are joined by Bank, Ministry, RJSC and BFIU to cover all five §3.1
// surfaces (workplace transparency, Operations Suite, enforcement, corporate).
export type Role = "ttc" | "worker" | "employer" | "bmet" | "bank" | "ministry" | "rjsc" | "bfiu" | "agency";

export type Tab =
  | "dashboard" | "issuer" | "wallet" | "admin" | "reports"
  | "jobs" | "applications" | "postings" | "applicants"
  | "wcontracts" | "econtracts" | "flow"
  // §3.1 additions
  | "wreviews"                      // worker: verified-anonymous reviews
  | "ops" | "profile" | "endorse" | "search" // employer: Ops Suite, transparency, endorse, matching
  | "bankwages" | "bankincome"      // bank
  | "enforcement"                   // ministry
  | "registry"                      // rjsc
  | "ubo"                           // bfiu
  // §3.8 agency accountability additions
  | "agsubmit" | "agstanding"       // agency: submit applications, own standing
  | "agapplicants"                  // employer: agency applications (attested vs asserted)
  | "aglicensing" | "allegations";  // bmet: license agencies, resolve allegations

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

const FLOW_TAB = { id: "flow" as Tab, label: "Data Flow", icon: "flow", sub: "Visual audit" };

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
      FLOW_TAB,
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
      { id: "wreviews", label: "Write a Review", icon: "review", sub: "Verified & anonymous" },
      FLOW_TAB,
    ],
  },
  employer: {
    id: "employer",
    name: "Foreign Employer / Agency",
    short: "Company",
    icon: "building",
    tagline: "Verify certificates, run a compliant workforce, earn a verifiable reputation.",
    user: "hr@saudico.com",
    pass: "emp-1234",
    did: "did:key:employer",
    nav: [
      { id: "postings", label: "Job Postings", icon: "clipboard", sub: "Create and manage" },
      { id: "applicants", label: "Applicants", icon: "users", sub: "Verify and hire" },
      { id: "search", label: "Find Talent", icon: "search", sub: "Private matching" },
      { id: "econtracts", label: "Contracts", icon: "document", sub: "Create and approve" },
      { id: "agapplicants", label: "Agency Applications", icon: "users", sub: "Attested vs asserted" },
      { id: "ops", label: "Operations Suite", icon: "briefcase", sub: "Onboarding & payroll" },
      { id: "endorse", label: "Endorse", icon: "endorse", sub: "Vouch for a worker" },
      { id: "profile", label: "Transparency", icon: "chart", sub: "Reviews & wage bill" },
      FLOW_TAB,
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
      { id: "aglicensing", label: "Agency Licensing", icon: "certificate", sub: "License & standing board" },
      { id: "allegations", label: "Allegations", icon: "gavel", sub: "Regulator + observer" },
      { id: "admin", label: "Controls", icon: "gear", sub: "Trust and revocation" },
      FLOW_TAB,
    ],
  },
  bank: {
    id: "bank",
    name: "Partner Bank",
    short: "Bank",
    icon: "bank",
    tagline: "Co-sign wage events and verify worker income for credit.",
    user: "ops@sonali-bank.gov.bd",
    pass: "bank-1234",
    did: "did:key:bank",
    nav: [
      { id: "bankwages", label: "Co-sign Wages", icon: "wage", sub: "Employer + bank" },
      { id: "bankincome", label: "Income Verify", icon: "chart", sub: "Predicate lookup" },
      FLOW_TAB,
    ],
  },
  ministry: {
    id: "ministry",
    name: "Ministry / DIFE",
    short: "Ministry",
    icon: "gavel",
    tagline: "Act on labour-law violations routed automatically from worker reviews.",
    user: "dife@mole.gov.bd",
    pass: "ministry-1234",
    did: "did:key:ministry",
    nav: [
      { id: "enforcement", label: "Enforcement", icon: "gavel", sub: "Violation queue" },
      FLOW_TAB,
    ],
  },
  rjsc: {
    id: "rjsc",
    name: "RJSC Registrar",
    short: "RJSC",
    icon: "registry",
    tagline: "Register companies and anchor procurement awards.",
    user: "registrar@rjsc.gov.bd",
    pass: "rjsc-1234",
    did: "did:key:rjsc",
    nav: [
      { id: "registry", label: "Company Registry", icon: "registry", sub: "Register & procurement" },
      FLOW_TAB,
    ],
  },
  bfiu: {
    id: "bfiu",
    name: "BFIU",
    short: "BFIU",
    icon: "aml",
    tagline: "Verify beneficial-ownership threshold proofs without a cap table.",
    user: "aml@bfiu.gov.bd",
    pass: "bfiu-1234",
    did: "did:key:bfiu",
    nav: [
      { id: "ubo", label: "UBO / AML", icon: "aml", sub: "Ownership proofs" },
      FLOW_TAB,
    ],
  },
  agency: {
    id: "agency",
    name: "Recruiting Agency (BAIRA)",
    short: "Agency",
    icon: "agency",
    tagline: "Submit applications on a worker's behalf — and stake your standing on every asserted claim.",
    user: "agency@baira.org.bd",
    pass: "agency-1234",
    did: "did:key:agency",
    nav: [
      { id: "agsubmit", label: "Submit Application", icon: "userPlus", sub: "Attested + asserted" },
      { id: "agstanding", label: "My Standing", icon: "chart", sub: "Computed digest" },
      FLOW_TAB,
    ],
  },
};

export const ROLE_LIST: RoleDef[] = [
  ROLES.ttc, ROLES.worker, ROLES.employer, ROLES.agency, ROLES.bmet,
  ROLES.bank, ROLES.ministry, ROLES.rjsc, ROLES.bfiu,
];
