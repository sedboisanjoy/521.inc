// Package engine runs the control-flow simulation — every Fabric transaction
// step (propose → endorse → order → validate → commit) is traced as discrete
// events. The engine also manages live topology (which peers are up/down) and
// enforces the endorsement policy.
package engine

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/rand"
	"sync"
	"time"
)

// ─── Default topology (3-org consortium: BMET, TTC, Bank) ─────────────────

var defaultTopology = Topology{
	Channel: "anchor-channel",
	Policy:  "AND('TTCMSP.member','BMETMSP.member')",
	Orderer: Node{Name: "orderer.employment-passport.bd", Endpoint: "localhost:7050", Online: true},
	Orgs: []Org{
		{DID: "did:key:regulator:bmet", Name: "BMET (Regulator)", MSPID: "BMETMSP", Role: RoleRegulator, Endpoint: "localhost:7051", Online: true, Score: 85},
		{DID: "did:key:issuer:ttc-dhaka", Name: "TTC Dhaka (Issuer)", MSPID: "TTCMSP", Role: RoleIssuer, Endpoint: "localhost:8051", Online: true, Score: 92},
		{DID: "did:key:verifier:bank", Name: "Sonali Bank (Verifier)", MSPID: "BANKMSP", Role: RoleVerifier, Endpoint: "localhost:9051", Online: true, Score: 78},
	},
	Peers: []PeerNode{
		{OrgDID: "did:key:regulator:bmet", Name: "peer0.bmet", Endpoint: "localhost:7051", Online: true},
		{OrgDID: "did:key:issuer:ttc-dhaka", Name: "peer0.ttc", Endpoint: "localhost:8051", Online: true},
		{OrgDID: "did:key:verifier:bank", Name: "peer0.bank", Endpoint: "localhost:9051", Online: true},
	},
}

// ─── Engine ─────────────────────────────────────────────────────────────────

// Engine is the simulation's core state machine. It owns the live topology
// snapshot, persisted state, and event log. All methods are safe for
// concurrent use (the API server calls them from HTTP handlers).
type Engine struct {
	mu       sync.RWMutex
	topo     Topology
	creds    map[string]*SimCredential // by credHash
	seq      int
	backendOnline bool // set by the health probe
}

// New returns a fresh engine seeded with the default 3-org topology.
func New() *Engine {
	return &Engine{
		topo:  defaultTopology,
		creds: map[string]*SimCredential{},
		backendOnline: true, // optimistic at start
	}
}

// ─── Topology management ────────────────────────────────────────────────────

// Topology returns the current live topology (thread-safe snapshot).
func (e *Engine) Topology() Topology {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.topo
}

// SetPeerOnline toggles a peer's online status (used to demonstrate policy
// enforcement failure when a required endorser goes down).
func (e *Engine) SetPeerOnline(orgDID string, online bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	for i := range e.topo.Peers {
		if e.topo.Peers[i].OrgDID == orgDID {
			e.topo.Peers[i].Online = online
		}
	}
	for i := range e.topo.Orgs {
		if e.topo.Orgs[i].DID == orgDID {
			e.topo.Orgs[i].Online = online
		}
	}
}

// SetBackendOnline is called by the health probe to update the live-status flag.
func (e *Engine) SetBackendOnline(online bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.backendOnline = online
}

// IsBackendOnline returns the last known health-probe result.
func (e *Engine) IsBackendOnline() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.backendOnline
}

// ─── Simulation runner ──────────────────────────────────────────────────────

// RunScenario executes one named scenario and returns a fully traced RunResult.
// The events array captures the Fabric control flow step-by-step.
func (e *Engine) RunScenario(scenarioID string) (*RunResult, error) {
	sc := scenarioByID(scenarioID)
	if sc == nil {
		return nil, fmt.Errorf("unknown scenario %q", scenarioID)
	}

	result := &RunResult{
		Scenario:  sc.ID,
		StartedAt: time.Now(),
		Events:    []FlowEvent{},
		Topology:  e.Topology(),
	}

	switch scenarioID {
	case "uc1-register":
		e.runRegistration(result)
	case "uc2-issue":
		e.runIssuance(result)
	case "uc3-contract":
		e.runContractAnchoring(result)
	case "uc4-verify":
		e.runVerification(result)
	case "uc5-wage":
		e.runWageRecord(result)
	case "uc6-revoke":
		e.runRevocation(result)
	case "uc7-monitor":
		e.runTrustMonitoring(result)
	case "policy-fail":
		e.runPolicyFailure(result)
	case "selective-disclosure":
		e.runSelectiveDisclosure(result)
	case "corroboration-flow":
		e.runCorroboration(result)
	case "adv-tamper":
		e.runAttackTamper(result)
	case "adv-sybil-corroboration":
		e.runAttackSybil(result)
	default:
		return nil, fmt.Errorf("scenario %q not implemented", scenarioID)
	}

	now := time.Now()
	result.EndedAt = &now
	// A run is "successful" (secure) unless the network rejected a legitimate tx
	// (policy fail) OR an attack exposed a real vulnerability we don't stop.
	result.Success = true
	for _, ev := range result.Events {
		if ev.Type == EvtPolicyFail || ev.Type == EvtVulnerability {
			result.Success = false
		}
	}
	result.Summary = buildSummary(result)
	return result, nil
}

// ─── Helpers ────────────────────────────────────────────────────────────────

func (e *Engine) nextSeq() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.seq++
	return e.seq
}

func (e *Engine) emit(result *RunResult, ev FlowEvent) {
	ev.ID = int64(len(result.Events)) + 1
	ev.Seq = e.nextSeq()
	ev.Timestamp = time.Now()
	result.Events = append(result.Events, ev)
}

func (e *Engine) txID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return "tx_" + hex.EncodeToString(b)[:16]
}

func (e *Engine) hash(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func scenarioByID(id string) *Scenario {
	for i := range Scenarios {
		if Scenarios[i].ID == id {
			return &Scenarios[i]
		}
	}
	return nil
}

func buildSummary(r *RunResult) string {
	if r.Success {
		return fmt.Sprintf("✓ Scenario %s completed successfully — %d events traced", r.Scenario, len(r.Events))
	}
	return fmt.Sprintf("✗ Scenario %s FAILED — endorsement policy not satisfied", r.Scenario)
}

// ─── UC1: Worker Registration ──────────────────────────────────────────────

func (e *Engine) runRegistration(r *RunResult) {
	tx := e.txID()
	did := "did:key:worker:rahim-uddin"
	docHash := e.hash(did)

	e.emit(r, FlowEvent{TxID: tx, Type: EvtProposal, From: "client", To: "did:key:regulator:bmet", Message: "BMET officer submits RegisterDID proposal", Success: true, Details: fmt.Sprintf(`{"did":"%s"}`, did)})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtEndorsement, From: "did:key:regulator:bmet", To: "ledger", Message: "peer0.bmet endorses — identity verified", Success: true, Details: `{"endorser":"BMETMSP"}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtOrdering, From: "peer0.bmet", To: "orderer.employment-passport.bd", Message: "Orderer sequences into block #42", Success: true, Details: `{"block":42}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtValidation, From: "orderer", To: "all peers", Message: "All peers validate — no conflicts detected", Success: true, Details: `{"peers":3}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtCommit, From: "orderer", To: "ledger", Message: "✓ DID anchored on ledger. Worker W-10001 registered.", Success: true, Details: fmt.Sprintf(`{"did":"%s","docHash":"%s","workerId":"W-10001"}`, did, docHash)})

	e.storeCred(did, "DIDRegistration", did, docHash)
}

// ─── UC2: Credential Issuance (AND policy enforced) ─────────────────────────

func (e *Engine) runIssuance(r *RunResult) {
	tx := e.txID()
	credHash := e.hash("welding-l3-cert")
	issuerDID := "did:key:issuer:ttc-dhaka"
	subjectDID := "did:key:worker:rahim-uddin"

	e.emit(r, FlowEvent{TxID: tx, Type: EvtProposal, From: "client", To: issuerDID, Message: "TTC officer submits IssueCredential: Welding Level 3", Success: true, Details: fmt.Sprintf(`{"trade":"Welding","level":3,"issuer":"%s"}`, issuerDID)})

	// Check endorsement policy: AND(TTCMSP, BMETMSP)
	ttcOnline := e.peerOnline(issuerDID)
	bmetOnline := e.peerOnline("did:key:regulator:bmet")

	if !ttcOnline {
		e.emit(r, FlowEvent{TxID: tx, Type: EvtPolicyFail, From: issuerDID, To: "ledger", Message: "❌ ENDORSEMENT FAILED — TTC peer is OFFLINE. AND(TTCMSP,BMETMSP) requires both peers active.", Success: false, Details: `{"required":["TTCMSP","BMETMSP"],"missing":["TTCMSP"]}`})
		return
	}
	if !bmetOnline {
		e.emit(r, FlowEvent{TxID: tx, Type: EvtPolicyFail, From: issuerDID, To: "ledger", Message: "❌ ENDORSEMENT FAILED — BMET peer is OFFLINE.", Success: false, Details: `{"required":["TTCMSP","BMETMSP"],"missing":["BMETMSP"]}`})
		return
	}

	e.emit(r, FlowEvent{TxID: tx, Type: EvtEndorsement, From: issuerDID, To: "ledger", Message: "peer0.ttc endorses — schema SkillCredential-v1", Success: true, Details: `{"endorser":"TTCMSP"}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtEndorsement, From: "did:key:regulator:bmet", To: "ledger", Message: "peer0.bmet endorses — BMET auto-verifies TTC authorization", Success: true, Details: `{"endorser":"BMETMSP"}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtOrdering, From: "peers", To: "orderer.employment-passport.bd", Message: "Endorsed proposal sent to Ordering Service", Success: true, Details: `{"endorsers":["TTCMSP","BMETMSP"]}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtCommit, From: "orderer", To: "ledger", Message: "✓ Credential anchored. CredHash: " + credHash[:12] + "...  Multi-org endorsement confirmed.", Success: true, Details: fmt.Sprintf(`{"credHash":"%s","issuerStanding":92}`, credHash)})

	e.storeCred(credHash, "SkillCredential-v1", issuerDID, subjectDID)
}

// ─── UC3: Contract Anchoring ────────────────────────────────────────────────

func (e *Engine) runContractAnchoring(r *RunResult) {
	tx := e.txID()
	contractHash := e.hash("contract-pdf-saudico-2000sar")

	e.emit(r, FlowEvent{TxID: tx, Type: EvtProposal, From: "client", To: "did:key:issuer:ttc-dhaka", Message: "Agency officer creates contract: Welder, SaudiCo, 2000 SAR/ mo, 2 yr", Success: true, Details: `{"employer":"SaudiCo","salary":2000,"term":"2 years"}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtEndorsement, From: "did:key:issuer:ttc-dhaka", To: "ledger", Message: "SHA-256 PDF hash generated →  " + contractHash[:16] + "...", Success: true, Details: fmt.Sprintf(`{"hash":"%s"}`, contractHash)})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtEndorsement, From: "did:key:regulator:bmet", To: "ledger", Message: "BMET endorses agency authorization", Success: true, Details: `{"endorser":"BMETMSP"}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtCommit, From: "orderer", To: "ledger", Message: "✓ Contract anchored on-chain — status: PENDING (awaiting worker + employer signatures)", Success: true, Details: `{"status":"PENDING"}`})

	e.emit(r, FlowEvent{TxID: tx, Type: EvtCommit, From: "worker", To: "ledger", Message: "Worker signs contract via biometric auth → status: WORKER_SIGNED", Success: true, Details: `{"signer":"did:key:worker:rahim-uddin"}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtCommit, From: "employer", To: "ledger", Message: "SaudiCo HR approves → status: SIGNED (immutable)", Success: true, Details: `{"signer":"SaudiCo","status":"SIGNED"}`})

	e.storeCred(contractHash, "EmploymentContract-v1", "did:key:issuer:ttc-dhaka", "did:key:worker:rahim-uddin")
}

// ─── UC4: Credential Verification ───────────────────────────────────────────

func (e *Engine) runVerification(r *RunResult) {
	tx := e.txID()
	credHash := e.hash("welding-l3-cert")

	e.emit(r, FlowEvent{TxID: tx, Type: EvtProposal, From: "client", To: "did:key:verifier:bank", Message: "Foreign employer queries: verify credential " + credHash[:16] + "...", Success: true})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtEndorsement, From: "did:key:verifier:bank", To: "ledger", Message: "Evaluating VerifyAnchor — read-only query (no ordering)", Success: true, Details: `{"found":true,"status":"ACTIVE"}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtCommit, From: "ledger", To: "client", Message: "✓ Credential VERIFIED. Status: ACTIVE, Issuer Standing: 92/100, Recommendation: ✅ ACCEPT", Success: true, Details: `{"status":"ACTIVE","issuerStanding":92,"recommendation":"ACCEPT"}`})
}

// ─── UC5: Wage Record ───────────────────────────────────────────────────────

func (e *Engine) runWageRecord(r *RunResult) {
	tx := e.txID()
	wageHash := e.hash("wage-august-2026-2000sar")

	e.emit(r, FlowEvent{TxID: tx, Type: EvtProposal, From: "client", To: "did:key:verifier:bank", Message: "Sonali Bank records wage: 2000 SAR, August 2026, source: SaudiCo", Success: true, Details: `{"amount":2000,"currency":"SAR","month":"August 2026"}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtEndorsement, From: "did:key:verifier:bank", To: "ledger", Message: "Bank endorses — wage data confirmed via SWIFT", Success: true, Details: `{"endorser":"BANKMSP"}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtEndorsement, From: "did:key:regulator:bmet", To: "ledger", Message: "BMET cross-validates — remittance record matched", Success: true, Details: `{"endorser":"BMETMSP"}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtCommit, From: "orderer", To: "ledger", Message: "✓ Wage record anchored. Workers now have verifiable income history.", Success: true, Details: fmt.Sprintf(`{"credHash":"%s","corroborated":true}`, wageHash)})

	e.storeCred(wageHash, "WageRecord-v1", "did:key:verifier:bank", "did:key:worker:rahim-uddin")
}

// ─── UC6: Revocation ────────────────────────────────────────────────────────

func (e *Engine) runRevocation(r *RunResult) {
	tx := e.txID()
	credHash := e.hash("welding-l3-cert")

	e.emit(r, FlowEvent{TxID: tx, Type: EvtProposal, From: "client", To: "did:key:regulator:bmet", Message: "BMET officer submits RevokeCredential: 'Certificate found fraudulent during audit'", Success: true, Details: `{"reason":"fraud_audit"}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtEndorsement, From: "did:key:regulator:bmet", To: "ledger", Message: "BMET endorses revocation", Success: true, Details: `{"endorser":"BMETMSP"}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtCommit, From: "orderer", To: "ledger", Message: "✓ Credential REVOKED. Status: REVOKED ← ACTIVE. Immutable audit trail preserved.", Success: true, Details: fmt.Sprintf(`{"credHash":"%s","newStatus":"REVOKED","revokedBy":"BMET"}`, credHash)})

	// Trust penalty on issuer
	e.emit(r, FlowEvent{TxID: tx, Type: EvtTrustDelta, From: "ledger", To: "did:key:issuer:ttc-dhaka", Message: "TTC Dhaka trust score: 92 → 77 (-15 for fraud revocation)", Success: true, Details: `{"old":92,"delta":-15,"new":77}`})

	e.updateOrgScore("did:key:issuer:ttc-dhaka", -15)
}

// ─── UC7: Trust Monitoring ──────────────────────────────────────────────────

func (e *Engine) runTrustMonitoring(r *RunResult) {
	tx := e.txID()

	e.emit(r, FlowEvent{TxID: tx, Type: EvtTrustDelta, From: "ledger", To: "did:key:issuer:ttc-dhaka", Message: "Live Trust Scores — BMET Dashboard", Success: true, Details: `{"scores":{"TTC-Dhaka":92,"TTC-Chittagong":70,"PrivateInst-A":40,"PrivateInst-B":20}}`})

	// Snapshot the orgs under the read-lock, then RELEASE it before emitting —
	// emit() takes the write-lock (via nextSeq), so holding RLock across it
	// self-deadlocks (RWMutex is not reentrant).
	orgs := e.Topology().Orgs
	for _, org := range orgs {
		status := "✅"
		if org.Score < 40 {
			status = "❌"
		} else if org.Score < 70 {
			status = "⚠️"
		}
		e.emit(r, FlowEvent{TxID: tx, Type: EvtTrustDelta, From: "ledger", To: org.DID, Message: fmt.Sprintf("%s %s — Score: %d/100", status, org.Name, org.Score), Success: true})
	}

	e.emit(r, FlowEvent{TxID: tx, Type: EvtCommit, From: "ledger", To: "client", Message: "✓ Trust dashboard refreshed. 1 centre flagged for audit (score < 30).", Success: true})
}

// ─── Policy Failure Demo ────────────────────────────────────────────────────

func (e *Engine) runPolicyFailure(r *RunResult) {
	// Simulate: TTC peer goes down → endorsement fails
	e.SetPeerOnline("did:key:issuer:ttc-dhaka", false)

	tx := e.txID()

	e.emit(r, FlowEvent{TxID: tx, Type: EvtSystemOffline, From: "peer0.ttc", To: "network", Message: "⚠️ PEER DOWN — peer0.ttc.employment-passport.bd has gone OFFLINE", Success: false, Details: `{"peer":"peer0.ttc","org":"TTC Dhaka"}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtProposal, From: "client", To: "did:key:issuer:ttc-dhaka", Message: "TTC attempts to issue credential → proposal sent to BMET (routing around downed peer)", Success: true})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtEndorsement, From: "did:key:regulator:bmet", To: "ledger", Message: "BMET endorses (1 of 2 collected)", Success: true, Details: `{"endorsers":["BMETMSP"],"required":["TTCMSP","BMETMSP"]}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtPolicyFail, From: "ledger", To: "client", Message: "❌ ENDORSEMENT POLICY FAILED — AND(TTCMSP.member, BMETMSP.member) requires TTCMSP endorsement. TTC peer is offline.", Success: false, Details: `{"policy":"AND(TTCMSP.member,BMETMSP.member)","missing":"TTCMSP"}`})

	// Restore
	e.SetPeerOnline("did:key:issuer:ttc-dhaka", true)
	e.emit(r, FlowEvent{TxID: tx, Type: EvtSystemOnline, From: "peer0.ttc", To: "network", Message: "✓ PEER RECOVERED — TTC Dhaka back online. Consensus restored.", Success: true})
}

// ─── Selective Disclosure ───────────────────────────────────────────────────

func (e *Engine) runSelectiveDisclosure(r *RunResult) {
	tx := e.txID()

	e.emit(r, FlowEvent{TxID: tx, Type: EvtProposal, From: "client", To: "did:key:verifier:bank", Message: "Bank requests: 'Prove wageAmount ≥ 25,000 BDT' — value must stay hidden", Success: true})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtDisclosure, From: "worker", To: "ledger", Message: "Worker opens Pedersen commitment: wageAmount ≥ 25,000 = TRUE", Success: true, Details: `{"predicate":"wageAmount >= 25000","result":true}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtDisclosure, From: "ledger", To: "client", Message: "✓ Selective disclosure complete. Salary threshold proven. Actual salary: 32,000 — NEVER revealed.", Success: true, Details: `{"revealed":"none","proof":"Pedersen commitment open"}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtCommit, From: "ledger", To: "ledger", Message: "Consent event recorded on-chain — worker can audit who checked what", Success: true, Details: `{"consentHash":"disc_abc123","verifier":"did:key:bank"}`})
}

// ─── Corroboration Flow ─────────────────────────────────────────────────────

func (e *Engine) runCorroboration(r *RunResult) {
	tx := e.txID()
	credHash := e.hash("wage-august-2026-2000sar")

	e.emit(r, FlowEvent{TxID: tx, Type: EvtCorroboration, From: "did:key:verifier:bank", To: "ledger", Message: "Sonali Bank corroborates wage record — evidence hash provided", Success: true, Details: `{"source":"bank","score":1}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtCorroboration, From: "did:key:regulator:bmet", To: "ledger", Message: "BMET corroborates — remittance data matches", Success: true, Details: `{"source":"bmet","score":2}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtCorroboration, From: "did:key:issuer:ttc-dhaka", To: "ledger", Message: "TTC corroborates — training record consistent", Success: true, Details: `{"source":"ttc","score":3}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtCommit, From: "ledger", To: "client", Message: "✓ Corroboration score: 3 independent sources. Trust: HIGH.", Success: true, Details: fmt.Sprintf(`{"credHash":"%s","corroborationScore":3}`, credHash)})
}

// ─── Adversarial: Tampered credential (DEFENDED by hash anchoring) ──────────

func (e *Engine) runAttackTamper(r *RunResult) {
	tx := e.txID()
	anchored := e.hash("welding-l3-cert|level=3")
	forged := e.hash("welding-l3-cert|level=5") // attacker bumps the level

	e.emit(r, FlowEvent{TxID: tx, Type: EvtAttack, From: "attacker", To: "did:key:verifier:bank", Message: "🗡️ Attacker edits the off-chain certificate: Welding L3 → L5, then presents it", Success: false, Details: `{"tampered":"level 3->5"}`})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtProposal, From: "did:key:verifier:bank", To: "ledger", Message: "Employer runs VerifyAnchor on the presented certificate", Success: true})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtValidation, From: "ledger", To: "did:key:verifier:bank", Message: "Recomputed hash " + forged[:12] + "… ≠ anchored hash " + anchored[:12] + "…", Success: false, Details: fmt.Sprintf(`{"anchored":"%s","recomputed":"%s"}`, anchored, forged)})
	e.emit(r, FlowEvent{TxID: tx, Type: EvtDefense, From: "ledger", To: "attacker", Message: "🛡️ DEFENDED — hash mismatch. The tampered certificate does not match the ledger. Rejected.", Success: true, Details: `{"defense":"hash anchoring / immutability"}`})
}

// ─── Adversarial: Sybil corroboration (DEFENDED by DID-registry check) ───────

func (e *Engine) runAttackSybil(r *RunResult) {
	tx := e.txID()

	e.emit(r, FlowEvent{TxID: tx, Type: EvtAttack, From: "attacker", To: "ledger", Message: "🗡️ Attacker tries to inflate corroboration on a weak credential using invented source DIDs", Success: false, Details: `{"sources":["sockpuppet-1","sockpuppet-2","sockpuppet-3"]}`})
	for i := 1; i <= 3; i++ {
		e.emit(r, FlowEvent{TxID: tx, Type: EvtEndorsement, From: fmt.Sprintf("did:key:sockpuppet-%d", i), To: "ledger", Message: fmt.Sprintf("SubmitCorroboration checks source #%d against the DID registry — not registered", i), Success: false, Details: `{"registered":false}`})
	}
	e.emit(r, FlowEvent{TxID: tx, Type: EvtDefense, From: "ledger", To: "attacker", Message: "🛡️ DEFENDED — every sock-puppet source is rejected: a corroboration only counts from a DID registered on-chain. Score unchanged.", Success: true, Details: `{"defense":"sourceDID must exist in the on-chain DID registry"}`})
}

// ─── State helpers ──────────────────────────────────────────────────────────

func (e *Engine) storeCred(credHash, schemaID, issuerDID, subjectDID string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.creds[credHash] = &SimCredential{
		CredHash:   credHash,
		SchemaID:   schemaID,
		IssuerDID:  issuerDID,
		SubjectDID: subjectDID,
		Status:     StatusActive,
		Endorsers:   []string{"TTCMSP", "BMETMSP"},
		IssuedAt:   time.Now(),
		CorroborationScore: 1,
	}
}

func (e *Engine) updateOrgScore(orgDID string, delta int) {
	e.mu.Lock()
	defer e.mu.Unlock()
	for i := range e.topo.Orgs {
		if e.topo.Orgs[i].DID == orgDID {
			e.topo.Orgs[i].Score += delta
			if e.topo.Orgs[i].Score < 0 {
				e.topo.Orgs[i].Score = 0
			}
			if e.topo.Orgs[i].Score > 100 {
				e.topo.Orgs[i].Score = 100
			}
			return
		}
	}
}

func (e *Engine) peerOnline(orgDID string) bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	for _, p := range e.topo.Peers {
		if p.OrgDID == orgDID {
			return p.Online
		}
	}
	return false
}