// Package ledger abstracts the on-chain layer behind an interface so the rest
// of the backend never depends on Fabric directly. Two implementations exist:
// an in-memory Mock (for local dev/demo) and a Fabric gateway client.
package ledger

// VerifyResult mirrors the chaincode VerifyAnchor return shape.
type VerifyResult struct {
	Found              bool     `json:"found"`
	CredHash           string   `json:"credHash"`
	Status             string   `json:"status"`
	SchemaID           string   `json:"schemaId,omitempty"`
	IssuerDID          string   `json:"issuerDID,omitempty"`
	IssuerStanding     int      `json:"issuerStanding"`
	Endorsers          []string `json:"endorsers,omitempty"`
	CorroborationScore int      `json:"corroborationScore"`
	IssuedAt           string   `json:"issuedAt,omitempty"`
	RevokedAt          string   `json:"revokedAt,omitempty"`
	ReasonCode         string   `json:"reasonCode,omitempty"`
}

// AgencyStanding mirrors the chaincode GetAgencyStanding return shape.
type AgencyStanding struct {
	AgencyDID string `json:"agencyDID"`
	Score     int    `json:"score"`
	UpdatedAt string `json:"updatedAt,omitempty"`
}

// ContractResult mirrors the chaincode GetContract return shape (UC3).
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

// Ledger is the set of chaincode operations the backend needs. Writes map to
// Fabric SubmitTransaction; reads map to EvaluateTransaction.
type Ledger interface {
	RegisterDID(did, docHash string) error
	IssueCredential(credHash, schemaID, issuerDID, subjectDID, expiry string) error
	RevokeCredential(credHash, reasonCode string) error
	VerifyAnchor(credHash string) (*VerifyResult, error)
	RecordDisclosure(consentHash, verifierDID string) error
	SubmitCorroboration(credHash, sourceDID, evidenceHash string) error
	UpdateAgencyStanding(agencyDID string, delta int, evidenceHash string) error
	GetAgencyStanding(agencyDID string) (*AgencyStanding, error)
	CreateContract(contractHash, workerDID, employerDID string) error
	SignContract(contractHash, workerDID string) error
	ApproveContract(contractHash, employerDID string) error
	GetContract(contractHash string) (*ContractResult, error)
	Close() error
}
