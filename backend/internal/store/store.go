// Package store is the off-chain encrypted vault (§6.4). For the prototype it
// is an in-memory map; the interface is shaped so it can be swapped for
// PostgreSQL + IPFS with envelope encryption without touching callers.
//
// Everything the ledger must NEVER see lives here: full credential JSON-LD,
// worker PII, contract PDFs. On-chain we keep only the salted hash.
package store

import (
	"sort"
	"sync"
)

// Worker is the off-chain PII record for a registered worker.
type Worker struct {
	WorkerID string `json:"workerId"`
	DID      string `json:"did"`
	Name     string `json:"name"`
	NID      string `json:"nid"`
	Address  string `json:"address"`
	PhotoCID string `json:"photoCid,omitempty"` // IPFS pointer in production
}

// Org is a participating organisation — a training center ("ttc") or an
// employer/company ("company"). Multiple of each may exist, each with its own
// DID so trust standing accrues per-organisation.
type Org struct {
	OrgID string `json:"orgId"`
	DID   string `json:"did"`
	Name  string `json:"name"`
	Type  string `json:"type"` // "ttc" | "company" | "agency"
	Email string `json:"email,omitempty"`
}

// Credential is the full off-chain credential body (the part kept private). The
// on-chain anchor references it only by CredHash.
type Credential struct {
	CredHash   string                 `json:"credHash"`
	Salt       string                 `json:"-"`
	SchemaID   string                 `json:"schemaId"`
	IssuerDID  string                 `json:"issuerDID"`
	SubjectDID string                 `json:"subjectDID"`
	Claims     map[string]interface{} `json:"claims"`
}

// Contract is the full off-chain employment-contract body (UC3). The on-chain
// anchor references it only by ContractHash; the salary and terms never touch
// the ledger.
type Contract struct {
	ContractHash string `json:"contractHash"`
	Salt         string `json:"-"`
	WorkerDID    string `json:"workerDID"`
	EmployerDID  string `json:"employerDID"`
	Employer     string `json:"employer"` // display name
	Position     string `json:"position"`
	Salary       int    `json:"salary"`
	Currency     string `json:"currency"`
	Term         string `json:"term"`
	JobID        string `json:"jobId,omitempty"`
}

// Review is a verified-anonymous workplace review (Surface 2, §3.5). The
// reviewer's identity never appears; a one-time nullifier proves "one voice per
// employee per employer" without linking to the worker.
type Review struct {
	ReviewHash    string `json:"reviewHash"`
	CompanyDID    string `json:"companyDID"`
	Nullifier     string `json:"nullifier"`
	Rating        int    `json:"rating"` // 1..5
	Recommend     bool   `json:"recommend"`
	ViolationCode string `json:"violationCode,omitempty"` // wage|contract|overtime|safety|termination
	Text          string `json:"text"`
	At            string `json:"at"`
}

// Violation is a labour-law violation signal raised by a review (Surface 5,
// §3.7), routed to the ministry with evidence but no reviewer identity.
type Violation struct {
	ID              string `json:"id"`
	CompanyDID      string `json:"companyDID"`
	Company         string `json:"company"`
	Code            string `json:"code"`
	ReviewHash      string `json:"reviewHash"`
	Status          string `json:"status"` // "open" | "resolved"
	Outcome         string `json:"outcome,omitempty"`
	EscalationReason string `json:"escalationReason,omitempty"` // why it reached the ministry
	Corroborators   int    `json:"corroborators,omitempty"`    // distinct verified reviewers
	At              string `json:"at"`
}

// CompanyProfile holds the off-chain corporate-transparency facts for a company
// DID (Surface 3): whether it is RJSC-registered, whether a UBO threshold proof
// exists, and the wage bill it has disclosed (for reconciliation).
type CompanyProfile struct {
	CompanyDID        string `json:"companyDID"`
	Registered        bool   `json:"registered"`
	UBOOk             bool   `json:"uboOk"`
	WageBillDisclosed int    `json:"wageBillDisclosed"`
}

// Application is an agency-mediated job application (§3.8). It carries two
// distinct kinds of claim: AttestedRefs (pointers to anchored credentials —
// auto-verified, no agency risk) and Asserted (the agency's own signed claims —
// where the agency stakes its standing). Contradiction is set when an asserted
// claim directly contradicts an anchored credential (tier-1, automatic).
type Application struct {
	ID                string                 `json:"id"`
	EmployerDID       string                 `json:"employerDID"`
	Employer          string                 `json:"employer"`
	AgencyDID         string                 `json:"agencyDID"`
	Agency            string                 `json:"agency"`
	WorkerDID         string                 `json:"workerDID"`
	WorkerName        string                 `json:"workerName"`
	OrderRef          string                 `json:"orderRef,omitempty"`
	AttestedRefs      []string               `json:"attestedRefs"`
	Asserted          map[string]interface{} `json:"asserted"`
	AssertedHash      string                 `json:"assertedHash"`
	AppHash           string                 `json:"appHash"`
	Contradiction     bool                   `json:"contradiction"`
	ContradictionNote string                 `json:"contradictionNote,omitempty"`
	Status            string                 `json:"status"` // "submitted" | "hired" | "rejected"
	At                string                 `json:"at"`
}

// Allegation is an employer's claim that an agency's asserted field does not
// match reality (§3.8, tier-3). It anchors "as an allegation, not a finding":
// no standing effect until the agency has a response window and a regulator +
// observer dual sign-off resolves it.
type Allegation struct {
	ID              string `json:"id"`
	ApplicationID   string `json:"applicationId"`
	AgencyDID       string `json:"agencyDID"`
	Agency          string `json:"agency"`
	EmployerDID     string `json:"employerDID"`
	Claim           string `json:"claim"` // which asserted field is disputed
	Detail          string `json:"detail"`
	AllegationHash  string `json:"allegationHash"`
	Status          string `json:"status"` // open | responded | upheld | dismissed | uncontested
	ResponseDeadline int64 `json:"responseDeadline"` // unix seconds
	RespondedAt     string `json:"respondedAt,omitempty"`
	ResponseHash    string `json:"responseHash,omitempty"`
	RegulatorOK     bool   `json:"regulatorOK"`
	ObserverOK      bool   `json:"observerOK"`
	Outcome         string `json:"outcome,omitempty"`
	At              string `json:"at"`
}

// AgencyDigest is the computed (not tallied) standing for an agency (§3.8):
// derived from anchored events so any party can recompute the same number.
type AgencyDigest struct {
	AgencyDID       string `json:"agencyDID"`
	Placements      int    `json:"placements"`
	DistinctEmployers int  `json:"distinctEmployers"`
	Contradictions  int    `json:"contradictions"`
	UpheldDisputes  int    `json:"upheldDisputes"`
	CorroborationPct int   `json:"corroborationPct"`
	Score           int    `json:"score"`
	Rated           bool   `json:"rated"`
}

// Store is the off-chain vault API.
type Store struct {
	mu       sync.RWMutex
	workers  map[string]*Worker     // by workerID
	byDID    map[string]*Worker     // by DID
	byNID    map[string]*Worker     // by national ID (uniqueness)
	creds    map[string]*Credential // by credHash
	credsBySubject map[string][]string // subjectDID -> credHashes (wallet view)
	credsByIssuer  map[string][]string // issuerDID -> credHashes (wage bill etc.)
	contracts      map[string]*Contract // by contractHash
	contractsByParty map[string][]string // DID -> contractHashes (worker or employer)
	orgs     map[string]*Org // by OrgID
	reviews          map[string]*Review   // by reviewHash
	reviewsByCompany map[string][]string  // companyDID -> reviewHashes
	nullifiers       map[string]bool      // spent review nullifiers
	violations       map[string]*Violation // by violation ID
	companyProfiles  map[string]*CompanyProfile // by companyDID
	applications     map[string]*Application // by application ID
	appsByEmployer   map[string][]string     // employerDID -> application IDs
	appsByAgency     map[string][]string     // agencyDID -> application IDs
	allegations      map[string]*Allegation  // by allegation ID
	allegsByAgency   map[string][]string     // agencyDID -> allegation IDs
	allegsByApp      map[string][]string     // applicationID -> allegation IDs
	orgSeq   int
	seq      int
	violSeq  int
	appSeq   int
	allegSeq int
}

// New returns an empty in-memory vault.
func New() *Store {
	return &Store{
		workers:          map[string]*Worker{},
		byDID:            map[string]*Worker{},
		byNID:            map[string]*Worker{},
		creds:            map[string]*Credential{},
		credsBySubject:   map[string][]string{},
		credsByIssuer:    map[string][]string{},
		contracts:        map[string]*Contract{},
		contractsByParty: map[string][]string{},
		orgs:             map[string]*Org{},
		reviews:          map[string]*Review{},
		reviewsByCompany: map[string][]string{},
		nullifiers:       map[string]bool{},
		violations:       map[string]*Violation{},
		companyProfiles:  map[string]*CompanyProfile{},
		applications:     map[string]*Application{},
		appsByEmployer:   map[string][]string{},
		appsByAgency:     map[string][]string{},
		allegations:      map[string]*Allegation{},
		allegsByAgency:   map[string][]string{},
		allegsByApp:      map[string][]string{},
	}
}

// NextOrgID returns the next sequential org id (TTC-1001 / CO-1001).
func (s *Store) NextOrgID(typ string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.orgSeq++
	prefix := "ORG"
	if typ == "ttc" {
		prefix = "TTC"
	} else if typ == "company" {
		prefix = "CO"
	} else if typ == "agency" {
		prefix = "AG"
	}
	return prefix + "-" + itoa(1000+s.orgSeq)
}

// PutOrg stores an organisation record.
func (s *Store) PutOrg(o *Org) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.orgs[o.OrgID] = o
}

// ListOrgs returns all orgs of a type (or all if typ is empty), ordered by id.
func (s *Store) ListOrgs(typ string) []*Org {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Org, 0, len(s.orgs))
	for _, o := range s.orgs {
		if typ == "" || o.Type == typ {
			out = append(out, o)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].OrgID < out[j].OrgID })
	return out
}

// NextWorkerID returns the next sequential worker id (W-10001, ...).
func (s *Store) NextWorkerID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.seq++
	return workerID(s.seq)
}

func workerID(n int) string {
	return "W-" + itoa(10000+n)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

// PutWorker stores a worker record.
func (s *Store) PutWorker(w *Worker) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.workers[w.WorkerID] = w
	s.byDID[w.DID] = w
	s.byNID[w.NID] = w
}

// WorkerByNID returns a worker by national ID (for duplicate detection).
func (s *Store) WorkerByNID(nid string) (*Worker, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	w, ok := s.byNID[nid]
	return w, ok
}

// GetWorker returns a worker by id.
func (s *Store) GetWorker(id string) (*Worker, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	w, ok := s.workers[id]
	return w, ok
}

// ListWorkers returns every registered worker, ordered by workerID (i.e. the
// order they were registered) so a directory view is stable.
func (s *Store) ListWorkers() []*Worker {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Worker, 0, len(s.workers))
	for _, w := range s.workers {
		out = append(out, w)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].WorkerID < out[j].WorkerID })
	return out
}

// PutCredential stores a full off-chain credential body, indexed by both the
// subject (wallet view) and the issuer (e.g. a company's wage events).
func (s *Store) PutCredential(c *Credential) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.creds[c.CredHash] = c
	s.credsBySubject[c.SubjectDID] = append(s.credsBySubject[c.SubjectDID], c.CredHash)
	s.credsByIssuer[c.IssuerDID] = append(s.credsByIssuer[c.IssuerDID], c.CredHash)
}

// CredsByIssuer returns all credential hashes anchored by an issuer DID.
func (s *Store) CredsByIssuer(issuerDID string) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]string, len(s.credsByIssuer[issuerDID]))
	copy(out, s.credsByIssuer[issuerDID])
	return out
}

// CredsBySchema returns full off-chain bodies for every credential of a schema
// (used for cross-org queues, e.g. all wage events awaiting a bank co-sign).
func (s *Store) CredsBySchema(schema string) []*Credential {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []*Credential{}
	for _, c := range s.creds {
		if c.SchemaID == schema {
			out = append(out, c)
		}
	}
	return out
}

// GetCredential returns a full off-chain credential body by hash.
func (s *Store) GetCredential(credHash string) (*Credential, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.creds[credHash]
	return c, ok
}

// WalletOf returns all credential hashes held by a subject DID (wallet view).
func (s *Store) WalletOf(subjectDID string) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]string, len(s.credsBySubject[subjectDID]))
	copy(out, s.credsBySubject[subjectDID])
	return out
}

// PutContract stores an off-chain contract body, indexed by both parties so it
// surfaces in the worker's inbox and the employer's list.
func (s *Store) PutContract(c *Contract) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.contracts[c.ContractHash] = c
	s.contractsByParty[c.WorkerDID] = append(s.contractsByParty[c.WorkerDID], c.ContractHash)
	if c.EmployerDID != c.WorkerDID {
		s.contractsByParty[c.EmployerDID] = append(s.contractsByParty[c.EmployerDID], c.ContractHash)
	}
}

// GetContract returns a full off-chain contract body by hash.
func (s *Store) GetContract(contractHash string) (*Contract, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.contracts[contractHash]
	return c, ok
}

// ContractsOf returns all contract hashes where the DID is worker or employer.
func (s *Store) ContractsOf(did string) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]string, len(s.contractsByParty[did]))
	copy(out, s.contractsByParty[did])
	return out
}

// --- Surface 2: verified-anonymous reviews + nullifier registry -------------

// NullifierSeen reports whether a review nullifier has already been spent (the
// "one verified voice per employee per employer" guard, §3.5).
func (s *Store) NullifierSeen(n string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.nullifiers[n]
}

// PutReview records a review, rejecting a reused nullifier. The caller anchors
// the reviewHash on-chain; the body (text, rating) stays off-chain.
func (s *Store) PutReview(r *Review) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.nullifiers[r.Nullifier] {
		return errDuplicateVoice
	}
	s.nullifiers[r.Nullifier] = true
	s.reviews[r.ReviewHash] = r
	s.reviewsByCompany[r.CompanyDID] = append(s.reviewsByCompany[r.CompanyDID], r.ReviewHash)
	return nil
}

var errDuplicateVoice = &StoreError{"you have already reviewed this employer (one verified voice per employee)"}

// StoreError is a domain error the API layer can surface directly.
type StoreError struct{ Msg string }

func (e *StoreError) Error() string { return e.Msg }

// ReviewsByCompany returns every review of a company DID (newest first).
func (s *Store) ReviewsByCompany(companyDID string) []*Review {
	s.mu.RLock()
	defer s.mu.RUnlock()
	hashes := s.reviewsByCompany[companyDID]
	out := make([]*Review, 0, len(hashes))
	for i := len(hashes) - 1; i >= 0; i-- {
		if r, ok := s.reviews[hashes[i]]; ok {
			out = append(out, r)
		}
	}
	return out
}

// --- Surface 5: violation signals -------------------------------------------

// NextViolationID returns the next sequential violation id (V-1001, ...).
func (s *Store) NextViolationID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.violSeq++
	return "V-" + itoa(1000+s.violSeq)
}

// PutViolation stores (or updates) a violation record.
func (s *Store) PutViolation(v *Violation) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.violations[v.ID] = v
}

// GetViolation returns a violation by id.
func (s *Store) GetViolation(id string) (*Violation, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.violations[id]
	return v, ok
}

// ListViolations returns violations filtered by status ("" = all), newest first.
func (s *Store) ListViolations(status string) []*Violation {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Violation, 0, len(s.violations))
	for _, v := range s.violations {
		if status == "" || v.Status == status {
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID > out[j].ID })
	return out
}

// --- Surface 3: company transparency profile --------------------------------

// CompanyProfileOf returns the profile for a company DID, creating an empty one
// on first access so callers can mutate it in place.
func (s *Store) CompanyProfileOf(companyDID string) *CompanyProfile {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.companyProfiles[companyDID]
	if !ok {
		p = &CompanyProfile{CompanyDID: companyDID}
		s.companyProfiles[companyDID] = p
	}
	return p
}

// --- §3.8: agency-mediated applications -------------------------------------

// NextApplicationID returns the next sequential application id (APP-1001, ...).
func (s *Store) NextApplicationID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.appSeq++
	return "APP-" + itoa(1000+s.appSeq)
}

// PutApplication stores (or updates) an application, indexed by employer and
// agency so both portals can list their own.
func (s *Store) PutApplication(a *Application) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.applications[a.ID]; !exists {
		s.appsByEmployer[a.EmployerDID] = append(s.appsByEmployer[a.EmployerDID], a.ID)
		s.appsByAgency[a.AgencyDID] = append(s.appsByAgency[a.AgencyDID], a.ID)
	}
	s.applications[a.ID] = a
}

// GetApplication returns an application by id.
func (s *Store) GetApplication(id string) (*Application, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	a, ok := s.applications[id]
	return a, ok
}

// ApplicationsByEmployer returns every application addressed to an employer DID
// (newest first).
func (s *Store) ApplicationsByEmployer(did string) []*Application {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ids := s.appsByEmployer[did]
	out := make([]*Application, 0, len(ids))
	for i := len(ids) - 1; i >= 0; i-- {
		if a, ok := s.applications[ids[i]]; ok {
			out = append(out, a)
		}
	}
	return out
}

// ApplicationsByAgency returns every application submitted by an agency DID
// (newest first).
func (s *Store) ApplicationsByAgency(did string) []*Application {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ids := s.appsByAgency[did]
	out := make([]*Application, 0, len(ids))
	for i := len(ids) - 1; i >= 0; i-- {
		if a, ok := s.applications[ids[i]]; ok {
			out = append(out, a)
		}
	}
	return out
}

// --- §3.8: mismatch allegations ---------------------------------------------

// NextAllegationID returns the next sequential allegation id (ALG-1001, ...).
func (s *Store) NextAllegationID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.allegSeq++
	return "ALG-" + itoa(1000+s.allegSeq)
}

// PutAllegation stores (or updates) an allegation, indexed by agency and
// application.
func (s *Store) PutAllegation(a *Allegation) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.allegations[a.ID]; !exists {
		s.allegsByAgency[a.AgencyDID] = append(s.allegsByAgency[a.AgencyDID], a.ID)
		s.allegsByApp[a.ApplicationID] = append(s.allegsByApp[a.ApplicationID], a.ID)
	}
	s.allegations[a.ID] = a
}

// GetAllegation returns an allegation by id.
func (s *Store) GetAllegation(id string) (*Allegation, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	a, ok := s.allegations[id]
	return a, ok
}

// AllegationExists reports whether an allegation already exists for the same
// (application, claim) pair (the dup-guard, mirroring the nullifier idea).
func (s *Store) AllegationExists(applicationID, claim string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, id := range s.allegsByApp[applicationID] {
		if a, ok := s.allegations[id]; ok && a.Claim == claim {
			return true
		}
	}
	return false
}

// ListAllegations returns allegations filtered by status ("" = all), newest first.
func (s *Store) ListAllegations(status string) []*Allegation {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Allegation, 0, len(s.allegations))
	for _, a := range s.allegations {
		if status == "" || a.Status == status {
			out = append(out, a)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID > out[j].ID })
	return out
}

// AllegationsByAgency returns every allegation against an agency DID (newest first).
func (s *Store) AllegationsByAgency(did string) []*Allegation {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ids := s.allegsByAgency[did]
	out := make([]*Allegation, 0, len(ids))
	for i := len(ids) - 1; i >= 0; i-- {
		if a, ok := s.allegations[ids[i]]; ok {
			out = append(out, a)
		}
	}
	return out
}

// AgencyDigest computes an agency's standing from anchored events (§3.8). It is
// deterministic derived state — any party recomputes the same number from the
// same placements + allegations, which is why standing cannot be bought or
// edited. Inputs: placement volume, counterparty diversity, upheld disputes,
// auto-contradictions; output a 0..100 score plus its breakdown.
func (s *Store) AgencyDigest(did string) AgencyDigest {
	s.mu.RLock()
	defer s.mu.RUnlock()
	d := AgencyDigest{AgencyDID: did}
	employers := map[string]bool{}
	for _, id := range s.appsByAgency[did] {
		a, ok := s.applications[id]
		if !ok {
			continue
		}
		d.Placements++
		employers[a.EmployerDID] = true
		if a.Contradiction {
			d.Contradictions++
		}
	}
	d.DistinctEmployers = len(employers)
	for _, id := range s.allegsByAgency[did] {
		a, ok := s.allegations[id]
		if !ok {
			continue
		}
		if a.Status == "upheld" || a.Status == "uncontested" {
			d.UpheldDisputes++
		}
	}
	if d.Placements == 0 {
		d.Score = 50 // unrated
		d.Rated = false
		return d
	}
	corroborated := d.Placements - d.Contradictions - d.UpheldDisputes
	if corroborated < 0 {
		corroborated = 0
	}
	d.CorroborationPct = int((corroborated*100 + d.Placements/2) / d.Placements)
	diversity := d.DistinctEmployers
	if diversity > 10 {
		diversity = 10
	}
	score := d.CorroborationPct + diversity - 8*d.UpheldDisputes - 5*d.Contradictions
	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}
	d.Score = score
	d.Rated = true
	return d
}
