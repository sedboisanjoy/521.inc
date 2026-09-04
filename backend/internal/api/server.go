// Package api exposes the REST surface (Layer 2) that the React apps call. Each
// handler maps to one README use case and orchestrates the off-chain vault plus
// the on-chain ledger, enforcing the Golden Rule (only hashes go on-chain).
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/cheatro-gupto/employment-passport/backend/internal/did"
	"github.com/cheatro-gupto/employment-passport/backend/internal/ledger"
	"github.com/cheatro-gupto/employment-passport/backend/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// Server wires the ledger and off-chain store into an HTTP router.
type Server struct {
	L ledger.Ledger
	S *store.Store
}

// Router builds the chi router with all endpoints and CORS for the web app.
func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger, middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type"},
	}))

	r.Get("/api/health", s.health)
	r.Get("/api/workers", s.listWorkers)                 // directory for issuers
	r.Post("/api/workers", s.registerWorker)             // UC1
	r.Get("/api/orgs", s.listOrgs)                       // training centers / companies
	r.Post("/api/orgs", s.registerOrg)                   // register a new org
	r.Post("/api/credentials", s.issueCredential)        // UC2 / UC3 / UC5
	r.Get("/api/verify/{credHash}", s.verify)            // UC4
	r.Post("/api/revoke", s.revoke)                      // UC6
	r.Post("/api/corroborate", s.corroborate)            // §5.4
	r.Post("/api/disclose", s.disclose)                  // selective disclosure
	r.Post("/api/agency-standing", s.updateStanding)     // UC7
	r.Get("/api/agency-standing/{did}", s.getStanding)   // UC7 dashboard
	r.Get("/api/wallet/{subjectDID}", s.wallet)          // worker wallet view
	r.Get("/api/credentials/{credHash}", s.getCredential) // full off-chain body
	r.Post("/api/contracts", s.createContract)           // UC3 draft
	r.Post("/api/contracts/sign", s.signContract)        // UC3 worker signs
	r.Post("/api/contracts/approve", s.approveContract)  // UC3 employer approves
	r.Get("/api/contracts/by/{did}", s.listContracts)    // inbox / employer list
	r.Get("/api/contracts/{hash}", s.getContract)        // anchor + off-chain body

	// §3.1 Surface 2 — workplace transparency (verified-anonymous reviews)
	r.Post("/api/employment-proofs", s.issueEmploymentProof) // employer → worker (gate to review)
	r.Post("/api/reviews", s.submitReview)                    // nullifier-gated review
	r.Get("/api/companies/{did}/digest", s.companyDigest)     // transparency digest
	// §3.1 Surface 5 — labour-law enforcement (review → ministry loop)
	r.Get("/api/violations", s.listViolations)               // ministry queue
	r.Post("/api/violations/inspect", s.recordInspection)     // ministry outcome
	// §3.1 Surface 4 — Operations Suite (wage events, employer + bank co-sign)
	r.Post("/api/wage-events", s.createWageEvent)             // employer anchors payroll
	r.Post("/api/wage-events/cosign", s.cosignWageEvent)      // bank co-signs
	r.Get("/api/wage-events/pending", s.pendingWages)         // bank queue (all PENDING_BANK)
	r.Get("/api/wage-events/by/{did}", s.listWageEvents)      // income history / payroll list
	// §3.1 Surface 3 — corporate identity (registry, UBO, procurement, reconciliation)
	r.Post("/api/companies", s.registerCompanyOnChain)               // RJSC registration
	r.Post("/api/companies/{did}/ubo", s.proveUBO)                   // BFIU threshold proof
	r.Post("/api/companies/{did}/wagebill", s.discloseWageBill)      // disclose wage bill
	r.Get("/api/companies/{did}/reconciliation", s.reconciliation)   // vs anchored wage events
	r.Post("/api/procurement", s.anchorProcurement)                  // tender award + conflict check
	// §3.1 Surface 1 gaps — endorsements (staked) + privacy-preserving matching
	r.Post("/api/endorsements", s.issueEndorsement)
	r.Post("/api/endorsements/dispute", s.disputeEndorsement)
	r.Post("/api/match", s.match)

	// §3.8 — job marketplace + agency accountability
	r.Post("/api/agency-licences", s.issueAgencyLicence)                  // BMET licenses an agency
	r.Get("/api/agency-licences", s.listAgencyLicences)                  // roster / standing board
	r.Post("/api/applications", s.submitApplication)                     // agency submits (attested + asserted)
	r.Get("/api/applications/by-employer/{did}", s.applicationsByEmployer)
	r.Get("/api/applications/by-agency/{did}", s.applicationsByAgency)
	r.Post("/api/applications/{id}/hire", s.hireApplication)
	r.Post("/api/allegations", s.allegeMismatch)                         // employer alleges
	r.Post("/api/allegations/{id}/respond", s.respondAllegation)         // agency responds
	r.Post("/api/allegations/{id}/endorse", s.endorseAllegation)         // regulator/observer 2-of-2
	r.Post("/api/allegations/{id}/close-window", s.closeAllegationWindow)
	r.Get("/api/allegations", s.listAllegations)                        // BMET queue
	r.Get("/api/allegations/by-agency/{did}", s.allegationsByAgency)
	r.Get("/api/agencies/{did}/standing-digest", s.agencyStandingDigest) // computed standing
	return r
}

// Fixed actor DIDs that must exist on-chain so cross-org operations (e.g. a bank
// corroborating a wage event) validate. Registered idempotently at startup.
const (
	DIDBMET       = "did:key:bmet"
	DIDEmployer   = "did:key:employer"
	DIDTTC        = "did:key:ttc-dhaka"
	DIDBank       = "did:key:bank"
	DIDMinistry   = "did:key:ministry"
	DIDRJSC       = "did:key:rjsc"
	DIDBFIU       = "did:key:bfiu"
	DIDReputation = "did:key:reputation" // neutral anchor for anonymous reviews
	DIDAgency     = "did:key:agency"     // the demo recruiting agency (BAIRA member)
	DIDObserver   = "did:key:observer"   // civil-society observer for the 2-of-2
)

// Credential schema identifiers (§3.2).
const (
	schemaEmploymentProof = "EmploymentProof"
	schemaReview          = "WorkplaceReview"
	schemaWageEvent       = "WageEvent"
	schemaEndorsement     = "Endorsement"
	schemaCompanyReg      = "CompanyRegistration"
	schemaUBO             = "BeneficialOwnership"
	schemaProcurement     = "ProcurementAward"
	schemaInspection      = "InspectionReport"
	schemaSkill           = "SkillCredential-v1"
	schemaAgencyLicence   = "AgencyLicence"
	schemaApplication     = "ApplicationRecord"
	schemaAllegation      = "MismatchAllegation"
	schemaResponse        = "AllegationResponse"
)

// Bootstrap registers the fixed actor DIDs on-chain (idempotent).
func (s *Server) Bootstrap() {
	for _, d := range []string{DIDBMET, DIDEmployer, DIDTTC, DIDBank, DIDMinistry, DIDRJSC, DIDBFIU, DIDReputation, DIDAgency, DIDObserver} {
		_ = s.L.RegisterDID(d, did.Hash([]byte(d)))
	}
}

// anchorCredential is the shared "issue any credential" helper: salted hash on
// the ledger + full body in the off-chain vault (the Golden Rule pattern used by
// every §3.1 surface).
func (s *Server) anchorCredential(schemaID, issuerDID, subjectDID string, claims map[string]interface{}) (string, error) {
	salt, err := did.Salt()
	if err != nil {
		return "", err
	}
	body, _ := json.Marshal(struct {
		SchemaID   string                 `json:"schemaId"`
		IssuerDID  string                 `json:"issuerDID"`
		SubjectDID string                 `json:"subjectDID"`
		Claims     map[string]interface{} `json:"claims"`
	}{schemaID, issuerDID, subjectDID, claims})
	h := did.SaltedHash(salt, body)
	if err := s.L.IssueCredential(h, schemaID, issuerDID, subjectDID, ""); err != nil {
		return "", err
	}
	s.S.PutCredential(&store.Credential{
		CredHash: h, Salt: salt, SchemaID: schemaID,
		IssuerDID: issuerDID, SubjectDID: subjectDID, Claims: claims,
	})
	return h, nil
}

// --- helpers ---------------------------------------------------------------

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, err error) {
	writeJSON(w, code, map[string]string{"error": err.Error()})
}

func readJSON(r *http.Request, v interface{}) error {
	return json.NewDecoder(r.Body).Decode(v)
}

// --- handlers --------------------------------------------------------------

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "time": time.Now().UTC().Format(time.RFC3339)})
}

// listWorkers returns the worker directory so an issuer (training center) can
// pick who to certify instead of pasting a raw DID. The NID is masked — the
// directory reveals just enough to identify a person, not their full PII.
func (s *Server) listWorkers(w http.ResponseWriter, r *http.Request) {
	type dirEntry struct {
		WorkerID  string `json:"workerId"`
		DID       string `json:"did"`
		Name      string `json:"name"`
		NIDMasked string `json:"nidMasked"`
		Address   string `json:"address"`
	}
	ws := s.S.ListWorkers()
	out := make([]dirEntry, 0, len(ws))
	for _, wk := range ws {
		out = append(out, dirEntry{
			WorkerID: wk.WorkerID, DID: wk.DID, Name: wk.Name,
			NIDMasked: maskNID(wk.NID), Address: wk.Address,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

// maskNID keeps only the last 4 digits visible (e.g. "******3456").
func maskNID(nid string) string {
	if len(nid) <= 4 {
		return nid
	}
	masked := make([]byte, len(nid))
	for i := range masked {
		masked[i] = '*'
	}
	copy(masked[len(nid)-4:], nid[len(nid)-4:])
	return string(masked)
}

func (s *Server) listOrgs(w http.ResponseWriter, r *http.Request) {
	orgs := s.S.ListOrgs(r.URL.Query().Get("type"))
	writeJSON(w, http.StatusOK, orgs)
}

type registerOrgReq struct {
	Name  string `json:"name"`
	Type  string `json:"type"` // "ttc" | "company"
	Email string `json:"email"`
}

func (s *Server) registerOrg(w http.ResponseWriter, r *http.Request) {
	var req registerOrgReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.Name == "" || (req.Type != "ttc" && req.Type != "company" && req.Type != "agency") {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("name and a valid type (ttc|company|agency) are required"))
		return
	}
	didStr, docHash, err := did.New(req.Type)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if err := s.L.RegisterDID(didStr, docHash); err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	org := &store.Org{OrgID: s.S.NextOrgID(req.Type), DID: didStr, Name: req.Name, Type: req.Type, Email: req.Email}
	s.S.PutOrg(org)
	// A recruiting agency is licensed on admission (BMET verifies legal existence,
	// §3.8) so it can submit applications immediately — mirroring how a company is
	// usable the moment it registers.
	if req.Type == "agency" {
		_, _ = s.anchorCredential(schemaAgencyLicence, DIDBMET, didStr, map[string]interface{}{
			"legalName": req.Name, "status": "active", "corridors": "KSA, UAE, Qatar",
		})
	}
	writeJSON(w, http.StatusCreated, org)
}

type registerWorkerReq struct {
	Name    string `json:"name"`
	NID     string `json:"nid"`
	Address string `json:"address"`
}

func (s *Server) registerWorker(w http.ResponseWriter, r *http.Request) {
	var req registerWorkerReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.Name == "" || req.NID == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("name and nid are required"))
		return
	}
	// A national ID uniquely identifies a person — reject duplicates.
	if existing, ok := s.S.WorkerByNID(req.NID); ok {
		writeErr(w, http.StatusConflict, fmt.Errorf("এই জাতীয় পরিচয়পত্র (%s) ইতিমধ্যে %s নামে নিবন্ধিত (%s)", req.NID, existing.Name, existing.WorkerID))
		return
	}
	didStr, docHash, err := did.New("worker")
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	// Off-chain: PII. On-chain: only the DID pointer + doc hash.
	worker := &store.Worker{
		WorkerID: s.S.NextWorkerID(), DID: didStr,
		Name: req.Name, NID: req.NID, Address: req.Address,
	}
	if err := s.L.RegisterDID(didStr, docHash); err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	s.S.PutWorker(worker)
	writeJSON(w, http.StatusCreated, map[string]string{"workerId": worker.WorkerID, "did": didStr})
}

type issueReq struct {
	SchemaID   string                 `json:"schemaId"`
	IssuerDID  string                 `json:"issuerDID"`
	SubjectDID string                 `json:"subjectDID"`
	Claims     map[string]interface{} `json:"claims"`
	Expiry     string                 `json:"expiry"`
}

func (s *Server) issueCredential(w http.ResponseWriter, r *http.Request) {
	var req issueReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.SchemaID == "" || req.IssuerDID == "" || req.SubjectDID == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("schemaId, issuerDID and subjectDID are required"))
		return
	}
	// Build the off-chain credential body and derive its salted on-chain hash.
	salt, err := did.Salt()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	body, _ := json.Marshal(struct {
		SchemaID   string                 `json:"schemaId"`
		IssuerDID  string                 `json:"issuerDID"`
		SubjectDID string                 `json:"subjectDID"`
		Claims     map[string]interface{} `json:"claims"`
	}{req.SchemaID, req.IssuerDID, req.SubjectDID, req.Claims})
	credHash := did.SaltedHash(salt, body)

	if err := s.L.IssueCredential(credHash, req.SchemaID, req.IssuerDID, req.SubjectDID, req.Expiry); err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	s.S.PutCredential(&store.Credential{
		CredHash: credHash, Salt: salt, SchemaID: req.SchemaID,
		IssuerDID: req.IssuerDID, SubjectDID: req.SubjectDID, Claims: req.Claims,
	})
	writeJSON(w, http.StatusCreated, map[string]string{"credHash": credHash})
}

func (s *Server) verify(w http.ResponseWriter, r *http.Request) {
	res, err := s.L.VerifyAnchor(chi.URLParam(r, "credHash"))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

type revokeReq struct {
	CredHash   string `json:"credHash"`
	ReasonCode string `json:"reasonCode"`
}

func (s *Server) revoke(w http.ResponseWriter, r *http.Request) {
	var req revokeReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if err := s.L.RevokeCredential(req.CredHash, req.ReasonCode); err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "REVOKED", "credHash": req.CredHash})
}

type corroborateReq struct {
	CredHash     string `json:"credHash"`
	SourceDID    string `json:"sourceDID"`
	EvidenceHash string `json:"evidenceHash"`
}

func (s *Server) corroborate(w http.ResponseWriter, r *http.Request) {
	var req corroborateReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if err := s.L.SubmitCorroboration(req.CredHash, req.SourceDID, req.EvidenceHash); err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "CORROBORATED", "credHash": req.CredHash})
}

// discloseReq asks the holder to prove a predicate over a hidden attribute,
// e.g. { attribute:"wageAmount", op:">=", value:25000 }. Only the boolean
// answer is returned — the underlying value is never revealed (selective
// disclosure). A production build replaces this with a BBS+ derived proof.
type discloseReq struct {
	CredHash    string  `json:"credHash"`
	Attribute   string  `json:"attribute"`
	Op          string  `json:"op"`
	Value       float64 `json:"value"`
	VerifierDID string  `json:"verifierDID"`
}

func (s *Server) disclose(w http.ResponseWriter, r *http.Request) {
	var req discloseReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	cred, ok := s.S.GetCredential(req.CredHash)
	if !ok {
		writeErr(w, http.StatusNotFound, fmt.Errorf("credential body not found off-chain"))
		return
	}
	raw, ok := cred.Claims[req.Attribute]
	if !ok {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("attribute %q not in credential", req.Attribute))
		return
	}
	actual, ok := toFloat(raw)
	if !ok {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("attribute %q is not numeric", req.Attribute))
		return
	}
	result, err := compare(actual, req.Op, req.Value)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	// Log the consent event on-chain (no value, just a hash + verifier DID).
	consent := did.Hash([]byte(fmt.Sprintf("%s|%s|%s|%d", req.CredHash, req.VerifierDID, req.Attribute, time.Now().UnixNano())))
	if err := s.L.RecordDisclosure(consent, req.VerifierDID); err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"predicate": fmt.Sprintf("%s %s %v", req.Attribute, req.Op, req.Value),
		"result":    result,
		"consentHash": consent,
	})
}

func toFloat(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	default:
		return 0, false
	}
}

func compare(a float64, op string, b float64) (bool, error) {
	switch op {
	case ">=":
		return a >= b, nil
	case ">":
		return a > b, nil
	case "<=":
		return a <= b, nil
	case "<":
		return a < b, nil
	case "==":
		return a == b, nil
	default:
		return false, fmt.Errorf("unsupported op %q", op)
	}
}

type standingReq struct {
	AgencyDID    string `json:"agencyDID"`
	Delta        int    `json:"delta"`
	EvidenceHash string `json:"evidenceHash"`
}

func (s *Server) updateStanding(w http.ResponseWriter, r *http.Request) {
	var req standingReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if err := s.L.UpdateAgencyStanding(req.AgencyDID, req.Delta, req.EvidenceHash); err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	st, _ := s.L.GetAgencyStanding(req.AgencyDID)
	writeJSON(w, http.StatusOK, st)
}

func (s *Server) getStanding(w http.ResponseWriter, r *http.Request) {
	st, err := s.L.GetAgencyStanding(chi.URLParam(r, "did"))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

// walletEntry is one credential in a worker's wallet, joined with its live
// on-chain status.
type walletEntry struct {
	CredHash string               `json:"credHash"`
	SchemaID string               `json:"schemaId"`
	Claims   map[string]interface{} `json:"claims"`
	Anchor   *ledger.VerifyResult `json:"anchor"`
}

func (s *Server) wallet(w http.ResponseWriter, r *http.Request) {
	subject := chi.URLParam(r, "subjectDID")
	var out []walletEntry
	for _, h := range s.S.WalletOf(subject) {
		cred, _ := s.S.GetCredential(h)
		anchor, _ := s.L.VerifyAnchor(h)
		out = append(out, walletEntry{CredHash: h, SchemaID: cred.SchemaID, Claims: cred.Claims, Anchor: anchor})
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) getCredential(w http.ResponseWriter, r *http.Request) {
	cred, ok := s.S.GetCredential(chi.URLParam(r, "credHash"))
	if !ok {
		writeErr(w, http.StatusNotFound, fmt.Errorf("credential not found"))
		return
	}
	writeJSON(w, http.StatusOK, cred)
}

// --- UC3 contract lifecycle ------------------------------------------------

type createContractReq struct {
	WorkerDID   string `json:"workerDID"`
	EmployerDID string `json:"employerDID"`
	Employer    string `json:"employer"`
	Position    string `json:"position"`
	Salary      int    `json:"salary"`
	Currency    string `json:"currency"`
	Term        string `json:"term"`
	JobID       string `json:"jobId"`
}

func (s *Server) createContract(w http.ResponseWriter, r *http.Request) {
	var req createContractReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.WorkerDID == "" || req.EmployerDID == "" || req.Position == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("workerDID, employerDID and position are required"))
		return
	}
	// Off-chain body → salted on-chain hash (same pattern as issueCredential).
	salt, err := did.Salt()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	body, _ := json.Marshal(struct {
		WorkerDID, EmployerDID, Position, Currency, Term string
		Salary                                           int
	}{req.WorkerDID, req.EmployerDID, req.Position, req.Currency, req.Term, req.Salary})
	contractHash := did.SaltedHash(salt, body)

	if err := s.L.CreateContract(contractHash, req.WorkerDID, req.EmployerDID); err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	s.S.PutContract(&store.Contract{
		ContractHash: contractHash, Salt: salt, WorkerDID: req.WorkerDID,
		EmployerDID: req.EmployerDID, Employer: req.Employer, Position: req.Position,
		Salary: req.Salary, Currency: req.Currency, Term: req.Term, JobID: req.JobID,
	})
	writeJSON(w, http.StatusCreated, map[string]string{"contractHash": contractHash, "status": "PENDING"})
}

type signContractReq struct {
	ContractHash string `json:"contractHash"`
	WorkerDID    string `json:"workerDID"`
}

func (s *Server) signContract(w http.ResponseWriter, r *http.Request) {
	var req signContractReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if err := s.L.SignContract(req.ContractHash, req.WorkerDID); err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "WORKER_SIGNED", "contractHash": req.ContractHash})
}

type approveContractReq struct {
	ContractHash string `json:"contractHash"`
	EmployerDID  string `json:"employerDID"`
}

func (s *Server) approveContract(w http.ResponseWriter, r *http.Request) {
	var req approveContractReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if err := s.L.ApproveContract(req.ContractHash, req.EmployerDID); err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "SIGNED", "contractHash": req.ContractHash})
}

// contractEntry is one contract joined with its live on-chain status.
type contractEntry struct {
	*store.Contract
	Anchor *ledger.ContractResult `json:"anchor"`
}

func (s *Server) getContract(w http.ResponseWriter, r *http.Request) {
	hash := chi.URLParam(r, "hash")
	body, ok := s.S.GetContract(hash)
	if !ok {
		writeErr(w, http.StatusNotFound, fmt.Errorf("contract not found"))
		return
	}
	anchor, _ := s.L.GetContract(hash)
	writeJSON(w, http.StatusOK, contractEntry{Contract: body, Anchor: anchor})
}

func (s *Server) listContracts(w http.ResponseWriter, r *http.Request) {
	did := chi.URLParam(r, "did")
	var out []contractEntry
	for _, h := range s.S.ContractsOf(did) {
		body, _ := s.S.GetContract(h)
		anchor, _ := s.L.GetContract(h)
		out = append(out, contractEntry{Contract: body, Anchor: anchor})
	}
	writeJSON(w, http.StatusOK, out)
}

// ═══════════════════════════════════════════════════════════════════════════
// §3.1 Surface 2 — Workplace transparency (verified-anonymous reviews)
// ═══════════════════════════════════════════════════════════════════════════

type employmentProofReq struct {
	EmployerDID string `json:"employerDID"`
	Employer    string `json:"employer"`
	WorkerDID   string `json:"workerDID"`
	Since       string `json:"since"`
}

// issueEmploymentProof anchors "this DID worked here" (schema EmploymentProof),
// the credential that later gates a worker's right to review the employer.
func (s *Server) issueEmploymentProof(w http.ResponseWriter, r *http.Request) {
	var req employmentProofReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.EmployerDID == "" || req.WorkerDID == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("employerDID and workerDID are required"))
		return
	}
	h, err := s.anchorCredential(schemaEmploymentProof, req.EmployerDID, req.WorkerDID, map[string]interface{}{
		"employer": req.Employer, "employerDID": req.EmployerDID, "since": req.Since,
	})
	if err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"credHash": h})
}

type reviewReq struct {
	CompanyDID    string `json:"companyDID"`
	Company       string `json:"company"`
	WorkerDID     string `json:"workerDID"`
	LinkSecret    string `json:"linkSecret"`
	Rating        int    `json:"rating"`
	Recommend     bool   `json:"recommend"`
	ViolationCode string `json:"violationCode"`
	Text          string `json:"text"`
}

// submitReview records a verified-anonymous review: the worker must hold an
// EmploymentProof for the company, and a one-time nullifier (derived from a
// per-employer link secret) enforces "one verified voice per employer". A
// violationCode raises a labour-law signal routed to the ministry (Surface 5).
func (s *Server) submitReview(w http.ResponseWriter, r *http.Request) {
	var req reviewReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.CompanyDID == "" || req.WorkerDID == "" || req.LinkSecret == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("companyDID, workerDID and linkSecret are required"))
		return
	}
	// Gate: the worker must hold an EmploymentProof for this company.
	hasProof := false
	for _, hh := range s.S.WalletOf(req.WorkerDID) {
		c, ok := s.S.GetCredential(hh)
		if ok && c.SchemaID == schemaEmploymentProof && c.Claims["employerDID"] == req.CompanyDID {
			hasProof = true
			break
		}
	}
	if !hasProof {
		writeErr(w, http.StatusForbidden, fmt.Errorf("you can only review an employer you hold an employment proof for"))
		return
	}
	// Nullifier: one-way, unique to (this worker's link secret, this company).
	nullifier := did.Hash([]byte(req.LinkSecret + "|" + req.CompanyDID))
	if s.S.NullifierSeen(nullifier) {
		writeErr(w, http.StatusConflict, fmt.Errorf("you have already reviewed this employer (one verified voice per employee)"))
		return
	}
	// Anchor the review hash under a neutral reputation DID (reviewer stays anonymous).
	reviewHash, err := s.anchorCredential(schemaReview, DIDReputation, req.CompanyDID, map[string]interface{}{
		"rating": req.Rating, "recommend": req.Recommend, "violationCode": req.ViolationCode,
	})
	if err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err := s.S.PutReview(&store.Review{
		ReviewHash: reviewHash, CompanyDID: req.CompanyDID, Nullifier: nullifier,
		Rating: req.Rating, Recommend: req.Recommend, ViolationCode: req.ViolationCode,
		Text: req.Text, At: now,
	}); err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	escalated := false
	reason := ""
	if req.ViolationCode != "" {
		reason, escalated = s.evaluateEscalation(req.CompanyDID, req.WorkerDID, req.ViolationCode)
		// Escalate to the ministry only when the policy is satisfied, and only
		// once per (company, code) so corroborating reviews fold into one signal.
		if escalated && !s.hasOpenViolation(req.CompanyDID, req.ViolationCode) {
			s.S.PutViolation(&store.Violation{
				ID: s.S.NextViolationID(), CompanyDID: req.CompanyDID, Company: req.Company,
				Code: req.ViolationCode, ReviewHash: reviewHash, Status: "open",
				EscalationReason: reason, Corroborators: s.distinctReviewers(req.CompanyDID, req.ViolationCode),
				At: now,
			})
		}
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"reviewHash": reviewHash, "nullifier": nullifier,
		"escalated": escalated, "reason": reason,
	})
}

// evaluateEscalation applies the labour-standards-compliant enforcement policy
// (§3.7). A single review does not reach the ministry on its own:
//   - WAGE claims are checked against the anchored bank-rail payroll. If the
//     committed salary was paid in full, the claim is contradicted by evidence
//     and is NOT escalated (this is what makes bribed wage-lies bounce, and what
//     makes an honest employer's on-time payroll an automatic shield). Short or
//     missing bank-confirmed wages against an active contract escalate on hard
//     evidence, even from a single reviewer.
//   - Other claims need corroboration by K distinct verified reviewers, tiered
//     by severity (safety escalates faster). Below K, the signal is held as an
//     aggregate in the transparency digest, not routed to the ministry.
// It returns a machine-readable reason and whether the signal escalates.
func (s *Server) evaluateEscalation(companyDID, workerDID, code string) (string, bool) {
	if code == "wage" {
		contractSalary := s.contractSalaryOf(workerDID, companyDID)
		paid := s.confirmedWageFrom(workerDID, companyDID)
		switch {
		case paid > 0 && (contractSalary == 0 || paid >= contractSalary):
			return "contradicted by anchored payroll — committed salary paid in full via the bank rail", false
		case contractSalary > 0 && paid == 0:
			return "corroborated by anchored data — no bank-confirmed wage against an active contract", true
		case paid > 0 && contractSalary > 0 && paid < contractSalary:
			return fmt.Sprintf("corroborated by anchored data — bank-confirmed wage %d below contract %d", paid, contractSalary), true
		}
		// No contract and no wage record on the rail → uncorroborated; fall through.
	}
	k := 3
	if code == "safety" {
		k = 2 // danger escalates faster
	}
	distinct := s.distinctReviewers(companyDID, code)
	if distinct >= k {
		return fmt.Sprintf("corroborated by %d distinct verified reviewers", distinct), true
	}
	return fmt.Sprintf("below corroboration threshold (%d of %d) — held as an aggregate signal, not routed to the ministry", distinct, k), false
}

func (s *Server) contractSalaryOf(workerDID, employerDID string) int {
	for _, h := range s.S.ContractsOf(workerDID) {
		if c, ok := s.S.GetContract(h); ok && c.EmployerDID == employerDID {
			return c.Salary
		}
	}
	return 0
}

func (s *Server) confirmedWageFrom(workerDID, employerDID string) int {
	best := 0
	for _, h := range s.S.WalletOf(workerDID) {
		c, ok := s.S.GetCredential(h)
		if !ok || c.SchemaID != schemaWageEvent || c.IssuerDID != employerDID {
			continue
		}
		if fmt.Sprintf("%v", c.Claims["status"]) != "CONFIRMED" {
			continue
		}
		if amt, ok := toFloat(c.Claims["amount"]); ok && int(amt) > best {
			best = int(amt)
		}
	}
	return best
}

func (s *Server) distinctReviewers(companyDID, code string) int {
	seen := map[string]bool{}
	for _, r := range s.S.ReviewsByCompany(companyDID) {
		if r.ViolationCode == code {
			seen[r.Nullifier] = true
		}
	}
	return len(seen)
}

func (s *Server) hasOpenViolation(companyDID, code string) bool {
	for _, v := range s.S.ListViolations("open") {
		if v.CompanyDID == companyDID && v.Code == code {
			return true
		}
	}
	return false
}

// companyDigest returns the public transparency digest for a company DID: the
// aggregate the world can verify without reading any single review.
func (s *Server) companyDigest(w http.ResponseWriter, r *http.Request) {
	companyDID := chi.URLParam(r, "did")
	reviews := s.S.ReviewsByCompany(companyDID)
	rec := 0
	for _, rv := range reviews {
		if rv.Recommend {
			rec++
		}
	}
	pct := 0
	if len(reviews) > 0 {
		pct = rec * 100 / len(reviews)
	}
	openConduct := 0
	for _, v := range s.S.ListViolations("open") {
		if v.CompanyDID == companyDID {
			openConduct++
		}
	}
	wageEvents := 0
	for _, hh := range s.S.CredsByIssuer(companyDID) {
		if c, ok := s.S.GetCredential(hh); ok && c.SchemaID == schemaWageEvent {
			wageEvents++
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"companyDID": companyDID, "reviewers": len(reviews), "recommendPct": pct,
		"openConduct": openConduct, "wageEvents": wageEvents,
	})
}

// ═══════════════════════════════════════════════════════════════════════════
// §3.1 Surface 5 — Labour-law enforcement (review → ministry loop)
// ═══════════════════════════════════════════════════════════════════════════

func (s *Server) listViolations(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.S.ListViolations(r.URL.Query().Get("status")))
}

type inspectReq struct {
	ViolationID string `json:"violationId"`
	CompanyDID  string `json:"companyDID"`
	Outcome     string `json:"outcome"`
	Delta       int    `json:"delta"` // standing adjustment (usually negative)
}

// recordInspection is the ministry's action: it resolves a violation, anchors an
// InspectionReport, and adjusts the company's on-chain standing.
func (s *Server) recordInspection(w http.ResponseWriter, r *http.Request) {
	var req inspectReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if v, ok := s.S.GetViolation(req.ViolationID); ok {
		v.Status = "resolved"
		v.Outcome = req.Outcome
		s.S.PutViolation(v)
	}
	if req.CompanyDID != "" && req.Delta != 0 {
		_ = s.L.UpdateAgencyStanding(req.CompanyDID, req.Delta, did.Hash([]byte("inspection|"+req.ViolationID)))
	}
	h, err := s.anchorCredential(schemaInspection, DIDMinistry, req.CompanyDID, map[string]interface{}{
		"outcome": req.Outcome, "violationId": req.ViolationID,
	})
	if err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	st, _ := s.L.GetAgencyStanding(req.CompanyDID)
	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "resolved", "inspectionHash": h, "score": st.Score})
}

// ═══════════════════════════════════════════════════════════════════════════
// §3.1 Surface 4 — Operations Suite (wage events; employer + bank co-sign)
// ═══════════════════════════════════════════════════════════════════════════

type wageEventReq struct {
	EmployerDID string `json:"employerDID"`
	Employer    string `json:"employer"`
	WorkerDID   string `json:"workerDID"`
	Amount      int    `json:"amount"`
	Month       string `json:"month"`
	Currency    string `json:"currency"`
}

// createWageEvent anchors a payroll event (schema WageEvent) in PENDING_BANK
// state — a wage record needs the bank's independent co-sign to be trusted.
func (s *Server) createWageEvent(w http.ResponseWriter, r *http.Request) {
	var req wageEventReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.EmployerDID == "" || req.WorkerDID == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("employerDID and workerDID are required"))
		return
	}
	cur := req.Currency
	if cur == "" {
		cur = "BDT"
	}
	h, err := s.anchorCredential(schemaWageEvent, req.EmployerDID, req.WorkerDID, map[string]interface{}{
		"amount": req.Amount, "month": req.Month, "currency": cur,
		"employer": req.Employer, "employerDID": req.EmployerDID, "status": "PENDING_BANK",
	})
	if err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"credHash": h, "status": "PENDING_BANK"})
}

type cosignReq struct {
	CredHash string `json:"credHash"`
	BankDID  string `json:"bankDID"`
}

// cosignWageEvent is the bank's independent co-sign: an on-chain corroboration
// (which requires the bank to be a registered DID) that flips the wage event to
// CONFIRMED. This is the employer+bank two-party rule from §6.2.
func (s *Server) cosignWageEvent(w http.ResponseWriter, r *http.Request) {
	var req cosignReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	bank := req.BankDID
	if bank == "" {
		bank = DIDBank
	}
	if err := s.L.SubmitCorroboration(req.CredHash, bank, did.Hash([]byte(req.CredHash+"|bank"))); err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	if c, ok := s.S.GetCredential(req.CredHash); ok {
		c.Claims["status"] = "CONFIRMED"
		c.Claims["bankDID"] = bank
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "CONFIRMED", "credHash": req.CredHash})
}

type wageEntry struct {
	CredHash  string                 `json:"credHash"`
	WorkerDID string                 `json:"workerDID"`
	Claims    map[string]interface{} `json:"claims"`
	Anchor    *ledger.VerifyResult   `json:"anchor"`
}

// pendingWages lists every wage event still awaiting a bank co-sign — the bank's
// cross-company work queue (Surface 4).
func (s *Server) pendingWages(w http.ResponseWriter, r *http.Request) {
	out := []wageEntry{}
	for _, c := range s.S.CredsBySchema(schemaWageEvent) {
		if fmt.Sprintf("%v", c.Claims["status"]) != "PENDING_BANK" {
			continue
		}
		out = append(out, wageEntry{CredHash: c.CredHash, WorkerDID: c.SubjectDID, Claims: c.Claims})
	}
	writeJSON(w, http.StatusOK, out)
}

// listWageEvents returns wage events for a DID. ?as=issuer lists a company's
// payroll; default lists a worker's income history (subject).
func (s *Server) listWageEvents(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "did")
	var hashes []string
	if r.URL.Query().Get("as") == "issuer" {
		hashes = s.S.CredsByIssuer(id)
	} else {
		hashes = s.S.WalletOf(id)
	}
	out := []wageEntry{}
	for _, h := range hashes {
		c, ok := s.S.GetCredential(h)
		if !ok || c.SchemaID != schemaWageEvent {
			continue
		}
		anchor, _ := s.L.VerifyAnchor(h)
		out = append(out, wageEntry{CredHash: h, WorkerDID: c.SubjectDID, Claims: c.Claims, Anchor: anchor})
	}
	writeJSON(w, http.StatusOK, out)
}

// ═══════════════════════════════════════════════════════════════════════════
// §3.1 Surface 3 — Corporate identity (registry, UBO, procurement, reconcile)
// ═══════════════════════════════════════════════════════════════════════════

type companyRegReq struct {
	CompanyDID string `json:"companyDID"`
	LegalName  string `json:"legalName"`
	RegNo      string `json:"regNo"`
}

// registerCompanyOnChain is RJSC anchoring a CompanyRegistration for an existing
// company DID — turning the company into a regulator-verified subject.
func (s *Server) registerCompanyOnChain(w http.ResponseWriter, r *http.Request) {
	var req companyRegReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.CompanyDID == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("companyDID is required"))
		return
	}
	h, err := s.anchorCredential(schemaCompanyReg, DIDRJSC, req.CompanyDID, map[string]interface{}{
		"legalName": req.LegalName, "regNo": req.RegNo,
	})
	if err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	s.S.CompanyProfileOf(req.CompanyDID).Registered = true
	writeJSON(w, http.StatusCreated, map[string]string{"credHash": h})
}

type uboReq struct {
	ThresholdOk bool   `json:"thresholdOk"`
	Note        string `json:"note"`
}

// proveUBO anchors a beneficial-ownership threshold proof ("no owner >25% who is
// sanctioned/PEP") without ever publishing the cap table.
func (s *Server) proveUBO(w http.ResponseWriter, r *http.Request) {
	companyDID := chi.URLParam(r, "did")
	var req uboReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	proofHash := did.Hash([]byte(companyDID + "|ubo|" + time.Now().UTC().Format(time.RFC3339Nano)))
	h, err := s.anchorCredential(schemaUBO, DIDBFIU, companyDID, map[string]interface{}{
		"thresholdOk": req.ThresholdOk, "note": req.Note, "proofHash": proofHash,
	})
	if err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	s.S.CompanyProfileOf(companyDID).UBOOk = req.ThresholdOk
	writeJSON(w, http.StatusCreated, map[string]interface{}{"credHash": h, "proofHash": proofHash, "thresholdOk": req.ThresholdOk})
}

type wageBillReq struct {
	Amount int `json:"amount"`
}

func (s *Server) discloseWageBill(w http.ResponseWriter, r *http.Request) {
	companyDID := chi.URLParam(r, "did")
	var req wageBillReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	p := s.S.CompanyProfileOf(companyDID)
	p.WageBillDisclosed = req.Amount
	writeJSON(w, http.StatusOK, p)
}

// reconciliation compares a company's disclosed wage bill against the sum of its
// CONFIRMED (employer+bank co-signed) wage events on the ledger.
func (s *Server) reconciliation(w http.ResponseWriter, r *http.Request) {
	companyDID := chi.URLParam(r, "did")
	p := s.S.CompanyProfileOf(companyDID)
	anchored := 0.0
	for _, hh := range s.S.CredsByIssuer(companyDID) {
		c, ok := s.S.GetCredential(hh)
		if !ok || c.SchemaID != schemaWageEvent {
			continue
		}
		if fmt.Sprintf("%v", c.Claims["status"]) != "CONFIRMED" {
			continue
		}
		if amt, ok := toFloat(c.Claims["amount"]); ok {
			anchored += amt
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"companyDID": companyDID, "disclosed": p.WageBillDisclosed,
		"anchored": int(anchored), "reconciled": p.WageBillDisclosed == int(anchored),
	})
}

type procurementReq struct {
	CompanyDID string `json:"companyDID"`
	Title      string `json:"title"`
	Amount     int    `json:"amount"`
	ConflictOk bool   `json:"conflictOk"`
}

func (s *Server) anchorProcurement(w http.ResponseWriter, r *http.Request) {
	var req procurementReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.CompanyDID == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("companyDID is required"))
		return
	}
	conflictHash := did.Hash([]byte(fmt.Sprintf("%s|%s|conflict", req.CompanyDID, req.Title)))
	h, err := s.anchorCredential(schemaProcurement, DIDRJSC, req.CompanyDID, map[string]interface{}{
		"title": req.Title, "amount": req.Amount, "conflictOk": req.ConflictOk, "conflictHash": conflictHash,
	})
	if err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"credHash": h, "conflictHash": conflictHash})
}

// ═══════════════════════════════════════════════════════════════════════════
// §3.1 Surface 1 gaps — staked endorsements + privacy-preserving matching
// ═══════════════════════════════════════════════════════════════════════════

type endorseReq struct {
	EndorserDID string `json:"endorserDID"`
	Endorser    string `json:"endorser"`
	WorkerDID   string `json:"workerDID"`
	Competence  string `json:"competence"`
}

// issueEndorsement anchors a staked endorsement (schema Endorsement). Issuing
// one builds the endorser's standing; a later dispute slashes it.
func (s *Server) issueEndorsement(w http.ResponseWriter, r *http.Request) {
	var req endorseReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.EndorserDID == "" || req.WorkerDID == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("endorserDID and workerDID are required"))
		return
	}
	h, err := s.anchorCredential(schemaEndorsement, req.EndorserDID, req.WorkerDID, map[string]interface{}{
		"competence": req.Competence, "endorser": req.Endorser,
	})
	if err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	_ = s.L.UpdateAgencyStanding(req.EndorserDID, 2, did.Hash([]byte("endorse|"+h)))
	writeJSON(w, http.StatusCreated, map[string]string{"credHash": h})
}

type disputeReq struct {
	CredHash    string `json:"credHash"`
	EndorserDID string `json:"endorserDID"`
}

func (s *Server) disputeEndorsement(w http.ResponseWriter, r *http.Request) {
	var req disputeReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	_ = s.L.RevokeCredential(req.CredHash, "DISPUTED")
	if req.EndorserDID != "" {
		_ = s.L.UpdateAgencyStanding(req.EndorserDID, -12, did.Hash([]byte("dispute|"+req.CredHash)))
	}
	st, _ := s.L.GetAgencyStanding(req.EndorserDID)
	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "DISPUTED", "score": st.Score})
}

type matchReq struct {
	Trade     string `json:"trade"`
	MinLevel  int    `json:"minLevel"`
	NoConduct bool   `json:"noConduct"`
}

// match runs a privacy-preserving search: an employer asks "level-N <trade>,
// no conduct finding?" and receives only the DIDs that satisfy the predicate —
// never the raw credential claims.
func (s *Server) match(w http.ResponseWriter, r *http.Request) {
	var req matchReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	matches := []string{}
	for _, wk := range s.S.ListWorkers() {
		ok := false
		for _, hh := range s.S.WalletOf(wk.DID) {
			c, found := s.S.GetCredential(hh)
			if !found || c.SchemaID != schemaSkill {
				continue
			}
			if req.Trade != "" && fmt.Sprintf("%v", c.Claims["trade"]) != req.Trade {
				continue
			}
			if lvl, okn := toFloat(c.Claims["level"]); !okn || int(lvl) < req.MinLevel {
				continue
			}
			// Anchor must still be ACTIVE (a revoked/disputed cred is a conduct finding).
			if anchor, _ := s.L.VerifyAnchor(hh); anchor == nil || anchor.Status != "ACTIVE" {
				continue
			}
			ok = true
			break
		}
		if ok {
			matches = append(matches, wk.DID)
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"predicate": fmt.Sprintf("level>=%d %s%s", req.MinLevel, req.Trade, map[bool]string{true: ", no conduct finding", false: ""}[req.NoConduct]),
		"count":     len(matches), "matches": matches,
	})
}

// ═══════════════════════════════════════════════════════════════════════════
// §3.8 — Job marketplace and agency accountability
// ═══════════════════════════════════════════════════════════════════════════

type agencyLicenceReq struct {
	AgencyDID string `json:"agencyDID"`
	LegalName string `json:"legalName"`
	Corridors string `json:"corridors"`
	ValidUntil string `json:"validUntil"`
}

// issueAgencyLicence is BMET licensing a recruiting agency (schema AgencyLicence).
// A valid, active licence is the §6.2 gate that lets an agency submit
// applications on a worker's behalf.
func (s *Server) issueAgencyLicence(w http.ResponseWriter, r *http.Request) {
	var req agencyLicenceReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.AgencyDID == "" || req.LegalName == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("agencyDID and legalName are required"))
		return
	}
	corridors := req.Corridors
	if corridors == "" {
		corridors = "KSA, UAE, Qatar"
	}
	h, err := s.anchorCredential(schemaAgencyLicence, DIDBMET, req.AgencyDID, map[string]interface{}{
		"legalName": req.LegalName, "status": "active",
		"corridors": corridors, "validUntil": req.ValidUntil,
	})
	if err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"credHash": h})
}

// activeLicence returns the display name if a DID holds an active AgencyLicence.
func (s *Server) activeLicence(agencyDID string) (string, bool) {
	for _, c := range s.S.CredsBySchema(schemaAgencyLicence) {
		if c.SubjectDID == agencyDID && fmt.Sprintf("%v", c.Claims["status"]) == "active" {
			return fmt.Sprintf("%v", c.Claims["legalName"]), true
		}
	}
	return "", false
}

// listAgencyLicences returns every licensed agency with its computed standing
// digest — the public standing board a worker checks before paying.
func (s *Server) listAgencyLicences(w http.ResponseWriter, r *http.Request) {
	type row struct {
		AgencyDID string             `json:"agencyDID"`
		LegalName string             `json:"legalName"`
		Status    string             `json:"status"`
		CredHash  string             `json:"credHash"`
		Digest    store.AgencyDigest `json:"digest"`
	}
	out := []row{}
	for _, c := range s.S.CredsBySchema(schemaAgencyLicence) {
		out = append(out, row{
			AgencyDID: c.SubjectDID,
			LegalName: fmt.Sprintf("%v", c.Claims["legalName"]),
			Status:    fmt.Sprintf("%v", c.Claims["status"]),
			CredHash:  c.CredHash,
			Digest:    s.S.AgencyDigest(c.SubjectDID),
		})
	}
	writeJSON(w, http.StatusOK, out)
}

type applicationReq struct {
	EmployerDID  string                 `json:"employerDID"`
	Employer     string                 `json:"employer"`
	AgencyDID    string                 `json:"agencyDID"`
	WorkerDID    string                 `json:"workerDID"`
	WorkerName   string                 `json:"workerName"`
	OrderRef     string                 `json:"orderRef"`
	AttestedRefs []string               `json:"attestedRefs"`
	Asserted     map[string]interface{} `json:"asserted"`
}

// flagContradiction runs the tier-1 automatic check: an asserted skill claim
// that exceeds (or mismatches) what an attested SkillCertificate actually proves
// is a direct contradiction against anchored data — no human judgement.
func (s *Server) flagContradiction(attestedRefs []string, asserted map[string]interface{}) (bool, string) {
	claimedLevel, hasLevel := toFloat(asserted["claimedLevel"])
	claimedTrade, hasTrade := asserted["trade"].(string)
	for _, h := range attestedRefs {
		c, ok := s.S.GetCredential(h)
		if !ok || c.SchemaID != schemaSkill {
			continue
		}
		attLevel, _ := toFloat(c.Claims["level"])
		attTrade := fmt.Sprintf("%v", c.Claims["trade"])
		if hasLevel && claimedLevel > attLevel {
			return true, fmt.Sprintf("asserted level %d contradicts attested certificate level %d", int(claimedLevel), int(attLevel))
		}
		if hasTrade && claimedTrade != "" && claimedTrade != attTrade {
			return true, fmt.Sprintf("asserted trade %q contradicts attested certificate trade %q", claimedTrade, attTrade)
		}
	}
	return false, ""
}

// submitApplication is the agency-mediated application (§3.8): it bundles
// attested credential refs (auto-verified, no agency risk) with asserted claims
// (the agency's own word, which stakes its standing). A tier-1 contradiction
// against anchored data is flagged and slashes standing immediately.
func (s *Server) submitApplication(w http.ResponseWriter, r *http.Request) {
	var req applicationReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.EmployerDID == "" || req.AgencyDID == "" || req.WorkerDID == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("employerDID, agencyDID and workerDID are required"))
		return
	}
	agencyName, licensed := s.activeLicence(req.AgencyDID)
	if !licensed {
		writeErr(w, http.StatusForbidden, fmt.Errorf("this agency holds no active AgencyLicence — applications must be submitted by a licensed agency"))
		return
	}
	if req.Asserted == nil {
		req.Asserted = map[string]interface{}{}
	}
	// Salted hash of the asserted-claim set: this is what the agency signs and stakes.
	assertedBody, _ := json.Marshal(req.Asserted)
	assertedSalt, _ := did.Salt()
	assertedHash := did.SaltedHash(assertedSalt, assertedBody)

	contradiction, note := s.flagContradiction(req.AttestedRefs, req.Asserted)

	appHash, err := s.anchorCredential(schemaApplication, req.AgencyDID, req.WorkerDID, map[string]interface{}{
		"employerDID": req.EmployerDID, "attestedRefs": req.AttestedRefs,
		"assertedHash": assertedHash, "orderRef": req.OrderRef,
	})
	if err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	app := &store.Application{
		ID: s.S.NextApplicationID(), EmployerDID: req.EmployerDID, Employer: req.Employer,
		AgencyDID: req.AgencyDID, Agency: agencyName, WorkerDID: req.WorkerDID, WorkerName: req.WorkerName,
		OrderRef: req.OrderRef, AttestedRefs: req.AttestedRefs, Asserted: req.Asserted,
		AssertedHash: assertedHash, AppHash: appHash,
		Contradiction: contradiction, ContradictionNote: note,
		Status: "submitted", At: time.Now().UTC().Format(time.RFC3339),
	}
	s.S.PutApplication(app)
	// Tier-1: an automatic contradiction has immediate effect on standing.
	if contradiction {
		_ = s.L.UpdateAgencyStanding(req.AgencyDID, -6, did.Hash([]byte("contradiction|"+app.ID)))
	}
	writeJSON(w, http.StatusCreated, app)
}

func (s *Server) applicationsByEmployer(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.S.ApplicationsByEmployer(chi.URLParam(r, "did")))
}

func (s *Server) applicationsByAgency(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.S.ApplicationsByAgency(chi.URLParam(r, "did")))
}

// hireApplication marks an application hired (a placement + corroboration signal
// for the agency's standing).
func (s *Server) hireApplication(w http.ResponseWriter, r *http.Request) {
	app, ok := s.S.GetApplication(chi.URLParam(r, "id"))
	if !ok {
		writeErr(w, http.StatusNotFound, fmt.Errorf("application not found"))
		return
	}
	app.Status = "hired"
	s.S.PutApplication(app)
	writeJSON(w, http.StatusOK, app)
}

type allegeReq struct {
	ApplicationID string `json:"applicationId"`
	Claim         string `json:"claim"`
	Detail        string `json:"detail"`
}

// allegeMismatch is the employer's tier-3 claim that an asserted field does not
// match reality. It anchors "as an allegation, not a finding" — no standing
// effect until a response window closes and a regulator + observer resolve it.
func (s *Server) allegeMismatch(w http.ResponseWriter, r *http.Request) {
	var req allegeReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	app, ok := s.S.GetApplication(req.ApplicationID)
	if !ok {
		writeErr(w, http.StatusNotFound, fmt.Errorf("application not found"))
		return
	}
	if req.Claim == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("claim (the disputed asserted field) is required"))
		return
	}
	if s.S.AllegationExists(req.ApplicationID, req.Claim) {
		writeErr(w, http.StatusConflict, fmt.Errorf("this asserted claim already has an open allegation"))
		return
	}
	now := time.Now().UTC()
	h, err := s.anchorCredential(schemaAllegation, app.EmployerDID, app.AgencyDID, map[string]interface{}{
		"applicationId": app.ID, "claim": req.Claim, "detail": req.Detail,
	})
	if err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	alg := &store.Allegation{
		ID: s.S.NextAllegationID(), ApplicationID: app.ID, AgencyDID: app.AgencyDID, Agency: app.Agency,
		EmployerDID: app.EmployerDID, Claim: req.Claim, Detail: req.Detail, AllegationHash: h,
		Status: "open", ResponseDeadline: now.Add(14 * 24 * time.Hour).Unix(),
		At: now.Format(time.RFC3339),
	}
	s.S.PutAllegation(alg)
	writeJSON(w, http.StatusCreated, alg)
}

type respondReq struct {
	AgencyDID   string `json:"agencyDID"`
	CounterClaim string `json:"counterClaim"`
}

// respondAllegation is the agency's counter-claim inside the response window.
func (s *Server) respondAllegation(w http.ResponseWriter, r *http.Request) {
	alg, ok := s.S.GetAllegation(chi.URLParam(r, "id"))
	if !ok {
		writeErr(w, http.StatusNotFound, fmt.Errorf("allegation not found"))
		return
	}
	var req respondReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if alg.Status != "open" {
		writeErr(w, http.StatusConflict, fmt.Errorf("this allegation is no longer open for a response"))
		return
	}
	if time.Now().Unix() > alg.ResponseDeadline {
		writeErr(w, http.StatusConflict, fmt.Errorf("the 14-day response window has closed"))
		return
	}
	h, err := s.anchorCredential(schemaResponse, alg.AgencyDID, alg.EmployerDID, map[string]interface{}{
		"allegationId": alg.ID, "counterClaim": req.CounterClaim,
	})
	if err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}
	alg.Status = "responded"
	alg.RespondedAt = time.Now().UTC().Format(time.RFC3339)
	alg.ResponseHash = h
	s.S.PutAllegation(alg)
	writeJSON(w, http.StatusOK, alg)
}

type endorseAllegReq struct {
	By      string `json:"by"`      // "regulator" | "observer"
	Outcome string `json:"outcome"` // "upheld" | "dismissed"
}

// endorseAllegation records one half of the regulator + observer 2-of-2. Only
// when BOTH have signed does the allegation resolve; an upheld outcome slashes
// the agency's standing. (Two genuine distinct signatures; the 2-of-2 is
// enforced by the app rather than a live Fabric endorsement policy.)
func (s *Server) endorseAllegation(w http.ResponseWriter, r *http.Request) {
	alg, ok := s.S.GetAllegation(chi.URLParam(r, "id"))
	if !ok {
		writeErr(w, http.StatusNotFound, fmt.Errorf("allegation not found"))
		return
	}
	var req endorseAllegReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if alg.Status == "upheld" || alg.Status == "dismissed" {
		writeErr(w, http.StatusConflict, fmt.Errorf("this allegation is already resolved"))
		return
	}
	switch req.By {
	case "regulator":
		alg.RegulatorOK = true
	case "observer":
		alg.ObserverOK = true
	default:
		writeErr(w, http.StatusBadRequest, fmt.Errorf("by must be 'regulator' or 'observer'"))
		return
	}
	if alg.Outcome == "" && (req.Outcome == "upheld" || req.Outcome == "dismissed") {
		alg.Outcome = req.Outcome
	}
	// Resolve only on the full 2-of-2.
	if alg.RegulatorOK && alg.ObserverOK {
		outcome := alg.Outcome
		if outcome == "" {
			outcome = "upheld"
		}
		alg.Status = outcome
		if outcome == "upheld" {
			_ = s.L.UpdateAgencyStanding(alg.AgencyDID, -12, did.Hash([]byte("allegation|"+alg.ID)))
		}
	}
	s.S.PutAllegation(alg)
	st, _ := s.L.GetAgencyStanding(alg.AgencyDID)
	writeJSON(w, http.StatusOK, map[string]interface{}{"allegation": alg, "score": st.Score})
}

// closeAllegationWindow marks an unanswered, past-deadline allegation as
// uncontested so the dual sign-off can uphold it (the paper's default when the
// window closes with no response).
func (s *Server) closeAllegationWindow(w http.ResponseWriter, r *http.Request) {
	alg, ok := s.S.GetAllegation(chi.URLParam(r, "id"))
	if !ok {
		writeErr(w, http.StatusNotFound, fmt.Errorf("allegation not found"))
		return
	}
	if alg.Status != "open" {
		writeErr(w, http.StatusConflict, fmt.Errorf("only an open, unanswered allegation can be closed"))
		return
	}
	alg.Status = "uncontested"
	alg.Outcome = "upheld"
	s.S.PutAllegation(alg)
	_ = s.L.UpdateAgencyStanding(alg.AgencyDID, -12, did.Hash([]byte("uncontested|"+alg.ID)))
	st, _ := s.L.GetAgencyStanding(alg.AgencyDID)
	writeJSON(w, http.StatusOK, map[string]interface{}{"allegation": alg, "score": st.Score})
}

func (s *Server) listAllegations(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	if status == "all" {
		status = "" // "all" is a convenience alias for no status filter
	}
	writeJSON(w, http.StatusOK, s.S.ListAllegations(status))
}

func (s *Server) allegationsByAgency(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.S.AllegationsByAgency(chi.URLParam(r, "did")))
}

// agencyStandingDigest returns the computed (not tallied) standing for an agency
// — recomputable by any party from the same anchored events.
func (s *Server) agencyStandingDigest(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.S.AgencyDigest(chi.URLParam(r, "did")))
}
