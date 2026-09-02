// Package engine defines the simulation models that mirror the chaincode types
// (contract/models.go) and ledger types (ledger/ledger.go). Every struct here
// corresponds 1:1 with what lives on the Fabric ledger so the simulator can
// faithfully reproduce the multi-org endorsement and trust-score lifecycle.
package engine

import "time"

// ─── Organisation (mirrors a Fabric MSP) ────────────────────────────────────

// OrgRole is a participant type in the network.
type OrgRole string

const (
	RoleRegulator OrgRole = "regulator" // BMET — worker registry, policy, revocation
	RoleIssuer    OrgRole = "issuer"    // TTC / training centre — credential issuance
	RoleVerifier  OrgRole = "verifier"  // Bank / employer — verification, corroboration
	RoleWorker    OrgRole = "worker"    // end-user with a wallet
)

// Org represents one consortium member (BMET, TTC, Bank) in the simulation.
type Org struct {
	DID      string  `json:"did"`
	Name     string  `json:"name"`
	MSPID    string  `json:"mspid"`
	Role     OrgRole `json:"role"`
	Endpoint string  `json:"endpoint"` // peer gRPC address (for topology viz)
	Online   bool    `json:"online"`
	Score    int     `json:"score"` // agency standing (0-100), mirrors AgencyStanding
}

// ─── Network topology ───────────────────────────────────────────────────────

// Topology is the full fabric-network snapshot the visualizer renders.
type Topology struct {
	Orgs      []Org          `json:"orgs"`
	Orderer   Node           `json:"orderer"`
	Peers     []PeerNode     `json:"peers"`
	Channel   string         `json:"channel"`
	Policy    string         `json:"policy"` // endorsement policy string, e.g. AND(TTCMSP,BMETMSP)
}

// Node is the ordering-service node.
type Node struct {
	Name     string `json:"name"`
	Endpoint string `json:"endpoint"`
	Online   bool   `json:"online"`
}

// PeerNode is one Fabric peer that hosts the ledger.
type PeerNode struct {
	OrgDID   string `json:"orgDid"`
	Name     string `json:"name"`
	Endpoint string `json:"endpoint"`
	Online   bool   `json:"online"`
}

// ─── Simulation event log (the "control flow" trace) ────────────────────────

// EventType categorises every step so the visualizer can colour/animate it.
type EventType string

const (
	EvtProposal      EventType = "PROPOSAL"      // client sends tx proposal to peer(s)
	EvtEndorsement   EventType = "ENDORSEMENT"   // a peer endorses (or rejects)
	EvtOrdering      EventType = "ORDERING"      // orderer sequences into a block
	EvtValidation    EventType = "VALIDATION"    // peer validates the block
	EvtCommit        EventType = "COMMIT"        // block is committed — immutable
	EvtPolicyFail    EventType = "POLICY_FAIL"   // endorsement policy not satisfied
	EvtRevocation    EventType = "REVOCATION"    // credential revoked
	EvtCorroboration EventType = "CORROBORATION" // second source confirms
	EvtTrustDelta    EventType = "TRUST_DELTA"   // agency standing changed
	EvtDisclosure    EventType = "DISCLOSURE"    // selective-disclosure proof
	EvtSystemOffline EventType = "SYSTEM_OFFLINE"// backend unreachable
	EvtSystemOnline  EventType = "SYSTEM_ONLINE" // backend recovered

	// Adversarial-scenario events (attack / defence / weakness storytelling).
	EvtAttack        EventType = "ATTACK"        // a malicious attempt
	EvtDefense       EventType = "DEFENSE"       // the network rejects the attack
	EvtVulnerability EventType = "VULNERABILITY" // our system fails to stop it
)

// FlowEvent is one atomic step in a simulated transaction flow. The visualizer
// consumes these in order to animate the control flow across the topology graph.
type FlowEvent struct {
	ID        int64     `json:"id"`
	Seq       int       `json:"seq"`
	Type      EventType `json:"type"`
	From      string    `json:"from"`      // org DID or "client"
	To        string    `json:"to"`        // org DID or "orderer" or "ledger"
	Message   string    `json:"message"`   // human-readable step description
	TxID      string    `json:"txId"`      // transaction this event belongs to
	Timestamp time.Time `json:"timestamp"`
	Success   bool      `json:"success"`   // for colour coding
	Details   string    `json:"details"`   // extra JSON (cred hash, scores, etc.)
}

// ─── Simulated credential state (mirrors contract.Credential + chaincode) ───

// CredentialStatus mirrors contract.StatusActive / StatusRevoked.
type CredentialStatus string

const (
	StatusActive  CredentialStatus = "ACTIVE"
	StatusRevoked CredentialStatus = "REVOKED"
)

// SimCredential is the simulation's equivalent of a chaincode Credential anchor.
type SimCredential struct {
	CredHash           string           `json:"credHash"`
	SchemaID           string           `json:"schemaId"`
	IssuerDID          string           `json:"issuerDID"`
	SubjectDID         string           `json:"subjectDID"`
	Status             CredentialStatus `json:"status"`
	Endorsers          []string         `json:"endorsers"`
	IssuedAt           time.Time        `json:"issuedAt"`
	RevokedAt          *time.Time       `json:"revokedAt,omitempty"`
	RevokedBy          string           `json:"revokedBy,omitempty"`
	ReasonCode         string           `json:"reasonCode,omitempty"`
	CorroborationScore int              `json:"corroborationScore"`
}

// ─── Scenario (a pre-baked "use case run") ──────────────────────────────────

// Scenario is a named, repeatable simulation that produces a complete event
// trace. Each scenario maps to one whitepaper use case (§3) plus edge cases.
type Scenario struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	UseCase     int    `json:"useCase"` // whitepaper UC number
	Fn          string `json:"fn"`       // chaincode function exercised
	Endpoint    string `json:"endpoint"` // REST route the main app hits
	Adversarial bool   `json:"adversarial"`
}

// Predefined scenarios matching the 7 whitepaper use cases plus policy-failure
// and multi-org endorsement demos.
var Scenarios = []Scenario{
	{ID: "uc1-register", Name: "UC1 — Worker Registration", Description: "BMET registers a new worker DID on the ledger. Only hashes touch the chain.", UseCase: 1, Fn: "RegisterDID", Endpoint: "POST /api/workers"},
	{ID: "uc2-issue", Name: "UC2 — Skill Credential Issuance", Description: "TTC issues a Welding L3 certificate; AND(TTCMSP,BMETMSP) endorsement enforced.", UseCase: 2, Fn: "IssueCredential", Endpoint: "POST /api/credentials"},
	{ID: "uc3-contract", Name: "UC3 — Contract Anchoring", Description: "Employer drafts a contract; worker signs, employer approves — hashed on-chain.", UseCase: 3, Fn: "CreateContract / SignContract / ApproveContract", Endpoint: "POST /api/contracts"},
	{ID: "uc4-verify", Name: "UC4 — Credential Verification", Description: "Foreign employer verifies a credential; trust score + recommendation returned.", UseCase: 4, Fn: "VerifyAnchor", Endpoint: "GET /api/verify/{hash}"},
	{ID: "uc5-wage", Name: "UC5 — Wage Record", Description: "Bank records monthly wage on ledger; payroll corroboration.", UseCase: 5, Fn: "IssueCredential", Endpoint: "POST /api/credentials"},
	{ID: "uc6-revoke", Name: "UC6 — Revocation", Description: "BMET revokes a fraudulent credential; trust score penalty applied.", UseCase: 6, Fn: "RevokeCredential", Endpoint: "POST /api/revoke"},
	{ID: "uc7-monitor", Name: "UC7 — Trust Monitoring", Description: "Live agency standing dashboard; TTC-Mirpur vs TTC-Chittagong comparison.", UseCase: 7, Fn: "GetAgencyStanding", Endpoint: "GET /api/agency-standing/{did}"},
	{ID: "policy-fail", Name: "Policy Enforcement — Peer Down", Description: "TTC peer goes OFFLINE → endorsement policy AND(TTCMSP,BMETMSP) FAILS → tx rejected.", UseCase: 0, Fn: "IssueCredential", Endpoint: "POST /api/credentials"},
	{ID: "selective-disclosure", Name: "Selective Disclosure — Salary Proof", Description: "Worker proves wage ≥ 25,000 BDT without revealing exact salary.", UseCase: 0, Fn: "RecordDisclosure", Endpoint: "POST /api/disclose"},
	{ID: "corroboration-flow", Name: "Corroboration Scoring", Description: "Bank corroborates a wage credential; score climbs from 1 -> 2 -> 3.", UseCase: 0, Fn: "SubmitCorroboration", Endpoint: "POST /api/corroborate"},

	// ── Adversarial suite — attacks on real ledger properties (not on prototype
	// shortcuts). Both are defended by the actual chaincode. ──
	{ID: "adv-tamper", Name: "🗡️ Attack — Tampered Credential", Description: "Attacker edits the off-chain credential body (level 3 → 5). Recomputed hash ≠ anchored hash → verification rejects it. DEFENDED by hash anchoring.", UseCase: 0, Fn: "VerifyAnchor", Endpoint: "GET /api/verify/{hash}", Adversarial: true},
	{ID: "adv-sybil-corroboration", Name: "🗡️ Attack — Sybil Corroboration", Description: "Attacker tries to inflate corroboration with invented source DIDs. SubmitCorroboration checks each source is a registered on-chain DID → sock-puppets rejected. DEFENDED.", UseCase: 0, Fn: "SubmitCorroboration", Endpoint: "POST /api/corroborate", Adversarial: true},
}

// ─── Simulation run results ─────────────────────────────────────────────────

// RunResult is the complete output of one simulation run, persisted to SQLite.
type RunResult struct {
	ID        int64       `json:"id"`
	Scenario  string     `json:"scenario"`
	StartedAt  time.Time  `json:"startedAt"`
	EndedAt    *time.Time `json:"endedAt,omitempty"`
	Success   bool       `json:"success"`
	Events    []FlowEvent `json:"events"`
	Topology  Topology    `json:"topology"`
	Summary   string     `json:"summary"`
}