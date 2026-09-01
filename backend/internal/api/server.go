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
	r.Post("/api/workers", s.registerWorker)             // UC1
	r.Post("/api/credentials", s.issueCredential)        // UC2 / UC3 / UC5
	r.Get("/api/verify/{credHash}", s.verify)            // UC4
	r.Post("/api/revoke", s.revoke)                      // UC6
	r.Post("/api/corroborate", s.corroborate)            // §5.4
	r.Post("/api/disclose", s.disclose)                  // selective disclosure
	r.Post("/api/agency-standing", s.updateStanding)     // UC7
	r.Get("/api/agency-standing/{did}", s.getStanding)   // UC7 dashboard
	r.Get("/api/wallet/{subjectDID}", s.wallet)          // worker wallet view
	r.Get("/api/credentials/{credHash}", s.getCredential) // full off-chain body
	return r
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
