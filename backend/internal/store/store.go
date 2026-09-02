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
	Type  string `json:"type"` // "ttc" | "company"
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

// Store is the off-chain vault API.
type Store struct {
	mu       sync.RWMutex
	workers  map[string]*Worker     // by workerID
	byDID    map[string]*Worker     // by DID
	byNID    map[string]*Worker     // by national ID (uniqueness)
	creds    map[string]*Credential // by credHash
	credsBySubject map[string][]string // subjectDID -> credHashes (wallet view)
	contracts      map[string]*Contract // by contractHash
	contractsByParty map[string][]string // DID -> contractHashes (worker or employer)
	orgs     map[string]*Org // by OrgID
	orgSeq   int
	seq      int
}

// New returns an empty in-memory vault.
func New() *Store {
	return &Store{
		workers:          map[string]*Worker{},
		byDID:            map[string]*Worker{},
		byNID:            map[string]*Worker{},
		creds:            map[string]*Credential{},
		credsBySubject:   map[string][]string{},
		contracts:        map[string]*Contract{},
		contractsByParty: map[string][]string{},
		orgs:             map[string]*Org{},
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

// PutCredential stores a full off-chain credential body.
func (s *Store) PutCredential(c *Credential) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.creds[c.CredHash] = c
	s.credsBySubject[c.SubjectDID] = append(s.credsBySubject[c.SubjectDID], c.CredHash)
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
