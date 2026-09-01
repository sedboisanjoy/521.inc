// Package store is the off-chain encrypted vault (§6.4). For the prototype it
// is an in-memory map; the interface is shaped so it can be swapped for
// PostgreSQL + IPFS with envelope encryption without touching callers.
//
// Everything the ledger must NEVER see lives here: full credential JSON-LD,
// worker PII, contract PDFs. On-chain we keep only the salted hash.
package store

import "sync"

// Worker is the off-chain PII record for a registered worker.
type Worker struct {
	WorkerID string `json:"workerId"`
	DID      string `json:"did"`
	Name     string `json:"name"`
	NID      string `json:"nid"`
	Address  string `json:"address"`
	PhotoCID string `json:"photoCid,omitempty"` // IPFS pointer in production
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

// Store is the off-chain vault API.
type Store struct {
	mu       sync.RWMutex
	workers  map[string]*Worker     // by workerID
	byDID    map[string]*Worker     // by DID
	creds    map[string]*Credential // by credHash
	credsBySubject map[string][]string // subjectDID -> credHashes (wallet view)
	seq      int
}

// New returns an empty in-memory vault.
func New() *Store {
	return &Store{
		workers:        map[string]*Worker{},
		byDID:          map[string]*Worker{},
		creds:          map[string]*Credential{},
		credsBySubject: map[string][]string{},
	}
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
}

// GetWorker returns a worker by id.
func (s *Store) GetWorker(id string) (*Worker, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	w, ok := s.workers[id]
	return w, ok
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
