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

func (m *Mock) Close() error { return nil }
