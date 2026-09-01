package contract

// Credential status values.
const (
	StatusActive  = "ACTIVE"
	StatusRevoked = "REVOKED"
)

// Contract lifecycle status values (UC3). A contract is anchored on draft,
// countersigned by the worker, then approved by the employer — each step
// immutable, which is what defeats contract substitution.
const (
	StatusPending      = "PENDING"       // drafted, awaiting the worker
	StatusWorkerSigned = "WORKER_SIGNED" // worker signed, awaiting the employer
	StatusSigned       = "SIGNED"        // employer approved; complete
)

// Composite-key object types used to partition the world state.
const (
	objDID        = "did"
	objCredential = "cred"
	objAgency     = "agency"
	objDisclosure = "disc"
	objContract   = "contract"
)

// DIDRecord anchors a Decentralised Identifier on-chain. Only a pointer/hash is
// stored — the resolvable DID document itself lives off-chain (Golden Rule).
type DIDRecord struct {
	DocType      string `json:"docType"`
	DID          string `json:"did"`
	DocHash      string `json:"docHash"`
	RegisteredBy string `json:"registeredBy"` // MSP ID of the submitting org
	RegisteredAt string `json:"registeredAt"`
}

// Corroboration is a second issuer's independent support for a claim (§5.4
// "corroboration scoring"). Evidence itself stays off-chain; only its hash is kept.
type Corroboration struct {
	SourceDID    string `json:"sourceDID"`
	EvidenceHash string `json:"evidenceHash"`
	At           string `json:"at"`
	By           string `json:"by"` // MSP ID
}

// Credential is the on-chain anchor for a Verifiable Credential. It never holds
// personal data — only a salted hash, issuer identity, status and audit metadata.
type Credential struct {
	DocType            string          `json:"docType"`
	CredHash           string          `json:"credHash"`
	SchemaID           string          `json:"schemaId"`
	IssuerDID          string          `json:"issuerDID"`
	SubjectDID         string          `json:"subjectDID"` // pairwise per verifier
	Status             string          `json:"status"`
	Endorsers          []string        `json:"endorsers"` // MSP IDs that anchored it
	IssuedAt           string          `json:"issuedAt"`
	Expiry             string          `json:"expiry,omitempty"`
	RevokedAt          string          `json:"revokedAt,omitempty"`
	RevokedBy          string          `json:"revokedBy,omitempty"`
	ReasonCode         string          `json:"reasonCode,omitempty"`
	CorroborationScore int             `json:"corroborationScore"`
	Corroborations     []Corroboration `json:"corroborations,omitempty"`
}

// StandingEvent records one adjustment to an agency/issuer reputation score.
type StandingEvent struct {
	Delta        int    `json:"delta"`
	EvidenceHash string `json:"evidenceHash"`
	At           string `json:"at"`
	By           string `json:"by"`
}

// AgencyStanding is the on-chain reputation of an agency or issuer (§7.4). It is
// derived only from ledger events, so it cannot be self-asserted or bought.
type AgencyStanding struct {
	DocType   string          `json:"docType"`
	AgencyDID string          `json:"agencyDID"`
	Score     int             `json:"score"`
	UpdatedAt string          `json:"updatedAt"`
	History   []StandingEvent `json:"history,omitempty"`
}

// DisclosureEvent logs a worker's consent to a verification so the worker can
// later audit who checked what (Appendix A: RecordDisclosure).
type DisclosureEvent struct {
	DocType     string `json:"docType"`
	ConsentHash string `json:"consentHash"`
	VerifierDID string `json:"verifierDID"`
	At          string `json:"at"`
	By          string `json:"by"`
}

// Contract is the on-chain anchor for an employment contract (UC3). It holds
// only the salted hash of the contract body, the two parties' DIDs, the
// signing status and timestamps — never the salary, position or PDF, which
// live off-chain (Golden Rule).
type Contract struct {
	DocType        string `json:"docType"`
	ContractHash   string `json:"contractHash"`
	WorkerDID      string `json:"workerDID"`
	EmployerDID    string `json:"employerDID"`
	Status         string `json:"status"`
	CreatedAt      string `json:"createdAt"`
	CreatedBy      string `json:"createdBy"` // MSP ID
	WorkerSignedAt string `json:"workerSignedAt,omitempty"`
	ApprovedAt     string `json:"approvedAt,omitempty"`
}

// ContractResult is the read shape returned to clients (mirrors VerifyResult):
// Found=false for an unknown hash rather than an error.
type ContractResult struct {
	Found          bool   `json:"found"`
	ContractHash   string `json:"contractHash"`
	WorkerDID      string `json:"workerDID,omitempty"`
	EmployerDID    string `json:"employerDID,omitempty"`
	Status         string `json:"status"`
	CreatedAt      string `json:"createdAt,omitempty"`
	WorkerSignedAt string `json:"workerSignedAt,omitempty"`
	ApprovedAt     string `json:"approvedAt,omitempty"`
}

// VerifyResult is the aggregated answer returned to a verifier: the credential
// state plus the issuer's current standing and corroboration basis (§3.1, §5.4).
type VerifyResult struct {
	Found              bool   `json:"found"`
	CredHash           string `json:"credHash"`
	Status             string `json:"status"`
	SchemaID           string `json:"schemaId,omitempty"`
	IssuerDID          string `json:"issuerDID,omitempty"`
	IssuerStanding     int    `json:"issuerStanding"`
	Endorsers          []string `json:"endorsers,omitempty"`
	CorroborationScore int    `json:"corroborationScore"`
	IssuedAt           string `json:"issuedAt,omitempty"`
	RevokedAt          string `json:"revokedAt,omitempty"`
	ReasonCode         string `json:"reasonCode,omitempty"`
}
