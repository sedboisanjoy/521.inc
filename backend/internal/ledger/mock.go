package ledger

import (
	"fmt"
	"sync"
	"time"
)

// Mock is an in-memory Ledger that reproduces the chaincode semantics so the
// full stack can run and demo before the Fabric network is stood up. It is
// safe for concurrent use.
type Mock struct {
	mu        sync.Mutex
	creds     map[string]*credential
	dids      map[string]bool
	standings map[string]int
	contracts map[string]*contract
}

type contract struct {
	ContractHash   string
	WorkerDID      string
	EmployerDID    string
	Status         string
	CreatedAt      string
	WorkerSignedAt string
	ApprovedAt     string
}

type credential struct {
	CredHash           string
	SchemaID           string
	IssuerDID          string
	SubjectDID         string
	Status             string
	Endorsers          []string
	IssuedAt           string
	RevokedAt          string
	ReasonCode         string
	CorroborationScore int
	sources            map[string]bool
}

// NewMock returns an empty in-memory ledger.
func NewMock() *Mock {
	return &Mock{
		creds:     map[string]*credential{},
		dids:      map[string]bool{},
		standings: map[string]int{},
		contracts: map[string]*contract{},
	}
}

func now() string { return time.Now().UTC().Format(time.RFC3339) }

func (m *Mock) RegisterDID(did, docHash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if did == "" || docHash == "" {
		return fmt.Errorf("did and docHash are required")
	}
	if m.dids[did] {
		return fmt.Errorf("DID %s is already registered", did)
	}
	m.dids[did] = true
	return nil
}

func (m *Mock) IssueCredential(credHash, schemaID, issuerDID, subjectDID, expiry string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if credHash == "" || schemaID == "" || issuerDID == "" || subjectDID == "" {
		return fmt.Errorf("credHash, schemaId, issuerDID and subjectDID are required")
	}
	if _, ok := m.creds[credHash]; ok {
		return fmt.Errorf("credential %s already anchored", credHash)
	}
	m.creds[credHash] = &credential{
		CredHash: credHash, SchemaID: schemaID, IssuerDID: issuerDID, SubjectDID: subjectDID,
		Status: "ACTIVE", Endorsers: []string{"MockMSP"}, IssuedAt: now(),
		CorroborationScore: 1, sources: map[string]bool{},
	}
	return nil
}

func (m *Mock) RevokeCredential(credHash, reasonCode string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.creds[credHash]
	if !ok {
		return fmt.Errorf("credential %s does not exist", credHash)
	}
	if c.Status == "REVOKED" {
		return fmt.Errorf("credential %s is already revoked", credHash)
	}
	c.Status = "REVOKED"
	c.RevokedAt = now()
	c.ReasonCode = reasonCode
	return nil
}

func (m *Mock) VerifyAnchor(credHash string) (*VerifyResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.creds[credHash]
	if !ok {
		return &VerifyResult{Found: false, CredHash: credHash, Status: "UNKNOWN"}, nil
	}
	return &VerifyResult{
		Found: true, CredHash: c.CredHash, Status: c.Status, SchemaID: c.SchemaID,
		IssuerDID: c.IssuerDID, IssuerStanding: m.standings[c.IssuerDID], Endorsers: c.Endorsers,
		CorroborationScore: c.CorroborationScore, IssuedAt: c.IssuedAt,
		RevokedAt: c.RevokedAt, ReasonCode: c.ReasonCode,
	}, nil
}

func (m *Mock) RecordDisclosure(consentHash, verifierDID string) error {
	if consentHash == "" || verifierDID == "" {
		return fmt.Errorf("consentHash and verifierDID are required")
	}
	return nil // audit log; nothing to read back in the mock
}

func (m *Mock) SubmitCorroboration(credHash, sourceDID, evidenceHash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.creds[credHash]
	if !ok {
		return fmt.Errorf("credential %s does not exist", credHash)
	}
	if sourceDID == c.IssuerDID {
		return fmt.Errorf("issuer cannot corroborate its own credential")
	}
	if c.sources[sourceDID] {
		return fmt.Errorf("source %s has already corroborated this credential", sourceDID)
	}
	c.sources[sourceDID] = true
	c.CorroborationScore++
	return nil
}

func (m *Mock) UpdateAgencyStanding(agencyDID string, delta int, evidenceHash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if agencyDID == "" {
		return fmt.Errorf("agencyDID is required")
	}
	s := m.standings[agencyDID] + delta
	if s < 0 {
		s = 0
	}
	if s > 100 {
		s = 100
	}
	m.standings[agencyDID] = s
	return nil
}

func (m *Mock) GetAgencyStanding(agencyDID string) (*AgencyStanding, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return &AgencyStanding{AgencyDID: agencyDID, Score: m.standings[agencyDID], UpdatedAt: now()}, nil
}

func (m *Mock) CreateContract(contractHash, workerDID, employerDID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if contractHash == "" || workerDID == "" || employerDID == "" {
		return fmt.Errorf("contractHash, workerDID and employerDID are required")
	}
	if _, ok := m.contracts[contractHash]; ok {
		return fmt.Errorf("contract %s already anchored", contractHash)
	}
	m.contracts[contractHash] = &contract{
		ContractHash: contractHash, WorkerDID: workerDID, EmployerDID: employerDID,
		Status: "PENDING", CreatedAt: now(),
	}
	return nil
}

func (m *Mock) SignContract(contractHash, workerDID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.contracts[contractHash]
	if !ok {
		return fmt.Errorf("contract %s does not exist", contractHash)
	}
	if c.Status != "PENDING" {
		return fmt.Errorf("contract %s is not awaiting the worker (status %s)", contractHash, c.Status)
	}
	if c.WorkerDID != workerDID {
		return fmt.Errorf("contract %s is not addressed to worker %s", contractHash, workerDID)
	}
	c.Status = "WORKER_SIGNED"
	c.WorkerSignedAt = now()
	return nil
}

func (m *Mock) ApproveContract(contractHash, employerDID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.contracts[contractHash]
	if !ok {
		return fmt.Errorf("contract %s does not exist", contractHash)
	}
	if c.Status != "WORKER_SIGNED" {
		return fmt.Errorf("contract %s is not awaiting employer approval (status %s)", contractHash, c.Status)
	}
	if c.EmployerDID != employerDID {
		return fmt.Errorf("contract %s does not belong to employer %s", contractHash, employerDID)
	}
	c.Status = "SIGNED"
	c.ApprovedAt = now()
	return nil
}

func (m *Mock) GetContract(contractHash string) (*ContractResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.contracts[contractHash]
	if !ok {
		return &ContractResult{Found: false, ContractHash: contractHash, Status: "UNKNOWN"}, nil
	}
	return &ContractResult{
		Found: true, ContractHash: c.ContractHash, WorkerDID: c.WorkerDID,
		EmployerDID: c.EmployerDID, Status: c.Status, CreatedAt: c.CreatedAt,
		WorkerSignedAt: c.WorkerSignedAt, ApprovedAt: c.ApprovedAt,
	}, nil
}

func (m *Mock) Close() error { return nil }
