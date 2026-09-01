// Package contract implements the Employment Passport chaincode — the on-chain
// registry of credential hashes, DIDs, revocation status and reputation.
//
// Golden Rule (§6.4): no personal data is ever written to the ledger, in
// plaintext or reversibly encrypted. Every function here handles only salted
// hashes, DIDs, status flags and audit metadata.
package contract

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// EmploymentContract implements the Appendix-A core chaincode interface.
type EmploymentContract struct {
	contractapi.Contract
}

// --- helpers ---------------------------------------------------------------

// txTime returns the transaction timestamp as a deterministic RFC3339 string.
// Using the tx timestamp (not time.Now) keeps the result identical across all
// endorsing peers, which is required for endorsement to succeed.
func txTime(ctx contractapi.TransactionContextInterface) (string, error) {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return "", fmt.Errorf("failed to read tx timestamp: %w", err)
	}
	return ts.AsTime().UTC().Format(time.RFC3339), nil
}

// submittingMSP returns the MSP ID of the org that submitted the transaction,
// used to attribute every write to an accountable organisation.
func submittingMSP(ctx contractapi.TransactionContextInterface) (string, error) {
	mspID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return "", fmt.Errorf("failed to read submitter MSP: %w", err)
	}
	return mspID, nil
}

func key(ctx contractapi.TransactionContextInterface, objType, id string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(objType, []string{id})
}

func getJSON(ctx contractapi.TransactionContextInterface, k string, out interface{}) (bool, error) {
	data, err := ctx.GetStub().GetState(k)
	if err != nil {
		return false, fmt.Errorf("world state read failed: %w", err)
	}
	if data == nil {
		return false, nil
	}
	if err := json.Unmarshal(data, out); err != nil {
		return false, fmt.Errorf("failed to decode state: %w", err)
	}
	return true, nil
}

func putJSON(ctx contractapi.TransactionContextInterface, k string, v interface{}) error {
	data, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("failed to encode state: %w", err)
	}
	return ctx.GetStub().PutState(k, data)
}

// --- 1. RegisterDID --------------------------------------------------------

// RegisterDID anchors a DID document pointer on the ledger (UC1). Only the DID
// and a hash of its document are stored; the document lives off-chain.
func (c *EmploymentContract) RegisterDID(ctx contractapi.TransactionContextInterface, did, docHash string) error {
	if did == "" || docHash == "" {
		return fmt.Errorf("did and docHash are required")
	}
	k, err := key(ctx, objDID, did)
	if err != nil {
		return err
	}
	var existing DIDRecord
	found, err := getJSON(ctx, k, &existing)
	if err != nil {
		return err
	}
	if found {
		return fmt.Errorf("DID %s is already registered", did)
	}
	now, err := txTime(ctx)
	if err != nil {
		return err
	}
	msp, err := submittingMSP(ctx)
	if err != nil {
		return err
	}
	return putJSON(ctx, k, DIDRecord{
		DocType:      objDID,
		DID:          did,
		DocHash:      docHash,
		RegisteredBy: msp,
		RegisteredAt: now,
	})
}

// --- 2. IssueCredential ----------------------------------------------------

// IssueCredential anchors a credential hash (UC2/UC3/UC5). The endorsement
// policy configured for this chaincode/schema (e.g. AND(TTC,BMET)) is what
// actually enforces multi-org co-signing; here we record who anchored it.
func (c *EmploymentContract) IssueCredential(ctx contractapi.TransactionContextInterface, credHash, schemaID, issuerDID, subjectDID, expiry string) error {
	if credHash == "" || schemaID == "" || issuerDID == "" || subjectDID == "" {
		return fmt.Errorf("credHash, schemaId, issuerDID and subjectDID are required")
	}
	k, err := key(ctx, objCredential, credHash)
	if err != nil {
		return err
	}
	var existing Credential
	found, err := getJSON(ctx, k, &existing)
	if err != nil {
		return err
	}
	if found {
		return fmt.Errorf("credential %s already anchored", credHash)
	}
	now, err := txTime(ctx)
	if err != nil {
		return err
	}
	msp, err := submittingMSP(ctx)
	if err != nil {
		return err
	}
	return putJSON(ctx, k, Credential{
		DocType:            objCredential,
		CredHash:           credHash,
		SchemaID:           schemaID,
		IssuerDID:          issuerDID,
		SubjectDID:         subjectDID,
		Status:             StatusActive,
		Endorsers:          []string{msp},
		IssuedAt:           now,
		Expiry:             expiry,
		CorroborationScore: 1, // the issuer itself is the first source
	})
}

// --- 3. RevokeCredential ---------------------------------------------------

// RevokeCredential flips a credential to REVOKED (UC6). Nothing is deleted —
// the ledger is immutable — only the status bit and audit fields change.
func (c *EmploymentContract) RevokeCredential(ctx contractapi.TransactionContextInterface, credHash, reasonCode string) error {
	k, err := key(ctx, objCredential, credHash)
	if err != nil {
		return err
	}
	var cred Credential
	found, err := getJSON(ctx, k, &cred)
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("credential %s does not exist", credHash)
	}
	if cred.Status == StatusRevoked {
		return fmt.Errorf("credential %s is already revoked", credHash)
	}
	now, err := txTime(ctx)
	if err != nil {
		return err
	}
	msp, err := submittingMSP(ctx)
	if err != nil {
		return err
	}
	cred.Status = StatusRevoked
	cred.RevokedAt = now
	cred.RevokedBy = msp
	cred.ReasonCode = reasonCode
	return putJSON(ctx, k, cred)
}

// --- 4. VerifyAnchor -------------------------------------------------------

// VerifyAnchor returns the anchored state of a credential plus its issuer's
// current standing and corroboration basis (UC4). This is a query (read-only):
// it does not go through ordering/consensus, so it answers in sub-second time.
func (c *EmploymentContract) VerifyAnchor(ctx contractapi.TransactionContextInterface, credHash string) (*VerifyResult, error) {
	k, err := key(ctx, objCredential, credHash)
	if err != nil {
		return nil, err
	}
	var cred Credential
	found, err := getJSON(ctx, k, &cred)
	if err != nil {
		return nil, err
	}
	if !found {
		return &VerifyResult{Found: false, CredHash: credHash, Status: "UNKNOWN"}, nil
	}
	standing := c.issuerStanding(ctx, cred.IssuerDID)
	return &VerifyResult{
		Found:              true,
		CredHash:           cred.CredHash,
		Status:             cred.Status,
		SchemaID:           cred.SchemaID,
		IssuerDID:          cred.IssuerDID,
		IssuerStanding:     standing,
		Endorsers:          cred.Endorsers,
		CorroborationScore: cred.CorroborationScore,
		IssuedAt:           cred.IssuedAt,
		RevokedAt:          cred.RevokedAt,
		ReasonCode:         cred.ReasonCode,
	}, nil
}

// issuerStanding looks up an issuer's reputation score, defaulting to 0 for an
// unknown (not-yet-scored) issuer.
func (c *EmploymentContract) issuerStanding(ctx contractapi.TransactionContextInterface, issuerDID string) int {
	k, err := key(ctx, objAgency, issuerDID)
	if err != nil {
		return 0
	}
	var st AgencyStanding
	found, err := getJSON(ctx, k, &st)
	if err != nil || !found {
		return 0
	}
	return st.Score
}

// --- 5. RecordDisclosure ---------------------------------------------------

// RecordDisclosure logs a worker-consent event so the worker can audit who
// verified their credentials (Appendix A). Only hashes and the verifier DID
// are stored.
func (c *EmploymentContract) RecordDisclosure(ctx contractapi.TransactionContextInterface, consentHash, verifierDID string) error {
	if consentHash == "" || verifierDID == "" {
		return fmt.Errorf("consentHash and verifierDID are required")
	}
	k, err := key(ctx, objDisclosure, consentHash)
	if err != nil {
		return err
	}
	now, err := txTime(ctx)
	if err != nil {
		return err
	}
	msp, err := submittingMSP(ctx)
	if err != nil {
		return err
	}
	return putJSON(ctx, k, DisclosureEvent{
		DocType:     objDisclosure,
		ConsentHash: consentHash,
		VerifierDID: verifierDID,
		At:          now,
		By:          msp,
	})
}

// --- 6. SubmitCorroboration ------------------------------------------------

// SubmitCorroboration lets a second issuer support an existing claim, raising
// its corroboration score (§5.4). A wage claim backed by both payroll and an
// independent bank scores higher than one backed by a single source.
func (c *EmploymentContract) SubmitCorroboration(ctx contractapi.TransactionContextInterface, credHash, sourceDID, evidenceHash string) error {
	k, err := key(ctx, objCredential, credHash)
	if err != nil {
		return err
	}
	var cred Credential
	found, err := getJSON(ctx, k, &cred)
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("credential %s does not exist", credHash)
	}
	if sourceDID == cred.IssuerDID {
		return fmt.Errorf("issuer cannot corroborate its own credential")
	}
	for _, existing := range cred.Corroborations {
		if existing.SourceDID == sourceDID {
			return fmt.Errorf("source %s has already corroborated this credential", sourceDID)
		}
	}
	now, err := txTime(ctx)
	if err != nil {
		return err
	}
	msp, err := submittingMSP(ctx)
	if err != nil {
		return err
	}
	cred.Corroborations = append(cred.Corroborations, Corroboration{
		SourceDID:    sourceDID,
		EvidenceHash: evidenceHash,
		At:           now,
		By:           msp,
	})
	cred.CorroborationScore++
	return putJSON(ctx, k, cred)
}

// --- 7. UpdateAgencyStanding -----------------------------------------------

// UpdateAgencyStanding adjusts an agency/issuer reputation score (UC7). In
// production this requires dual endorsement (regulator + observer) via the
// endorsement policy; the delta and evidence hash are recorded for audit.
func (c *EmploymentContract) UpdateAgencyStanding(ctx contractapi.TransactionContextInterface, agencyDID string, delta int, evidenceHash string) error {
	if agencyDID == "" {
		return fmt.Errorf("agencyDID is required")
	}
	k, err := key(ctx, objAgency, agencyDID)
	if err != nil {
		return err
	}
	var st AgencyStanding
	found, err := getJSON(ctx, k, &st)
	if err != nil {
		return err
	}
	if !found {
		st = AgencyStanding{DocType: objAgency, AgencyDID: agencyDID, Score: 0}
	}
	now, err := txTime(ctx)
	if err != nil {
		return err
	}
	msp, err := submittingMSP(ctx)
	if err != nil {
		return err
	}
	st.Score += delta
	if st.Score < 0 {
		st.Score = 0
	}
	if st.Score > 100 {
		st.Score = 100
	}
	st.UpdatedAt = now
	st.History = append(st.History, StandingEvent{Delta: delta, EvidenceHash: evidenceHash, At: now, By: msp})
	return putJSON(ctx, k, st)
}

// --- 8. Contract lifecycle (UC3) -------------------------------------------

// CreateContract anchors a new employment contract in PENDING state. Only the
// salted hash and the two parties' DIDs are stored; the body is off-chain.
func (c *EmploymentContract) CreateContract(ctx contractapi.TransactionContextInterface, contractHash, workerDID, employerDID string) error {
	if contractHash == "" || workerDID == "" || employerDID == "" {
		return fmt.Errorf("contractHash, workerDID and employerDID are required")
	}
	k, err := key(ctx, objContract, contractHash)
	if err != nil {
		return err
	}
	var existing Contract
	found, err := getJSON(ctx, k, &existing)
	if err != nil {
		return err
	}
	if found {
		return fmt.Errorf("contract %s already anchored", contractHash)
	}
	now, err := txTime(ctx)
	if err != nil {
		return err
	}
	msp, err := submittingMSP(ctx)
	if err != nil {
		return err
	}
	return putJSON(ctx, k, Contract{
		DocType:      objContract,
		ContractHash: contractHash,
		WorkerDID:    workerDID,
		EmployerDID:  employerDID,
		Status:       StatusPending,
		CreatedAt:    now,
		CreatedBy:    msp,
	})
}

// SignContract records the worker's signature (PENDING → WORKER_SIGNED). Only
// the named worker may sign, and only a pending contract.
func (c *EmploymentContract) SignContract(ctx contractapi.TransactionContextInterface, contractHash, workerDID string) error {
	con, k, err := c.loadContract(ctx, contractHash)
	if err != nil {
		return err
	}
	if con.Status != StatusPending {
		return fmt.Errorf("contract %s is not awaiting the worker (status %s)", contractHash, con.Status)
	}
	if con.WorkerDID != workerDID {
		return fmt.Errorf("contract %s is not addressed to worker %s", contractHash, workerDID)
	}
	now, err := txTime(ctx)
	if err != nil {
		return err
	}
	con.Status = StatusWorkerSigned
	con.WorkerSignedAt = now
	return putJSON(ctx, k, con)
}

// ApproveContract records the employer's approval (WORKER_SIGNED → SIGNED).
// Only the named employer may approve, and only after the worker has signed.
func (c *EmploymentContract) ApproveContract(ctx contractapi.TransactionContextInterface, contractHash, employerDID string) error {
	con, k, err := c.loadContract(ctx, contractHash)
	if err != nil {
		return err
	}
	if con.Status != StatusWorkerSigned {
		return fmt.Errorf("contract %s is not awaiting employer approval (status %s)", contractHash, con.Status)
	}
	if con.EmployerDID != employerDID {
		return fmt.Errorf("contract %s does not belong to employer %s", contractHash, employerDID)
	}
	now, err := txTime(ctx)
	if err != nil {
		return err
	}
	con.Status = StatusSigned
	con.ApprovedAt = now
	return putJSON(ctx, k, con)
}

// GetContract returns the anchored state of a contract (UC3/UC4). Found=false
// for an unknown hash, mirroring VerifyAnchor.
func (c *EmploymentContract) GetContract(ctx contractapi.TransactionContextInterface, contractHash string) (*ContractResult, error) {
	k, err := key(ctx, objContract, contractHash)
	if err != nil {
		return nil, err
	}
	var con Contract
	found, err := getJSON(ctx, k, &con)
	if err != nil {
		return nil, err
	}
	if !found {
		return &ContractResult{Found: false, ContractHash: contractHash, Status: "UNKNOWN"}, nil
	}
	return &ContractResult{
		Found:          true,
		ContractHash:   con.ContractHash,
		WorkerDID:      con.WorkerDID,
		EmployerDID:    con.EmployerDID,
		Status:         con.Status,
		CreatedAt:      con.CreatedAt,
		WorkerSignedAt: con.WorkerSignedAt,
		ApprovedAt:     con.ApprovedAt,
	}, nil
}

// loadContract fetches a contract and its state key, erroring if it's absent.
func (c *EmploymentContract) loadContract(ctx contractapi.TransactionContextInterface, contractHash string) (Contract, string, error) {
	var con Contract
	k, err := key(ctx, objContract, contractHash)
	if err != nil {
		return con, "", err
	}
	found, err := getJSON(ctx, k, &con)
	if err != nil {
		return con, "", err
	}
	if !found {
		return con, "", fmt.Errorf("contract %s does not exist", contractHash)
	}
	return con, k, nil
}

// --- read helpers (queries) ------------------------------------------------

// GetCredential returns the full on-chain credential anchor (audit/debug).
func (c *EmploymentContract) GetCredential(ctx contractapi.TransactionContextInterface, credHash string) (*Credential, error) {
	k, err := key(ctx, objCredential, credHash)
	if err != nil {
		return nil, err
	}
	var cred Credential
	found, err := getJSON(ctx, k, &cred)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("credential %s does not exist", credHash)
	}
	return &cred, nil
}

// GetAgencyStanding returns an issuer/agency reputation record (trust dashboard, UC7).
func (c *EmploymentContract) GetAgencyStanding(ctx contractapi.TransactionContextInterface, agencyDID string) (*AgencyStanding, error) {
	k, err := key(ctx, objAgency, agencyDID)
	if err != nil {
		return nil, err
	}
	var st AgencyStanding
	found, err := getJSON(ctx, k, &st)
	if err != nil {
		return nil, err
	}
	if !found {
		return &AgencyStanding{DocType: objAgency, AgencyDID: agencyDID, Score: 0}, nil
	}
	return &st, nil
}
