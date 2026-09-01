package contract

import (
	"strings"
	"testing"
	"time"

	timestamp "github.com/golang/protobuf/ptypes/timestamp"
	"github.com/hyperledger/fabric-chaincode-go/pkg/cid"
	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// --- lightweight in-memory mocks (interface embedding: only the methods the
// contract actually calls are implemented; the rest stay nil and are unused) ---

type mockStub struct {
	shim.ChaincodeStubInterface
	state map[string][]byte
	ts    time.Time
}

func (m *mockStub) GetState(k string) ([]byte, error) { return m.state[k], nil }
func (m *mockStub) PutState(k string, v []byte) error { m.state[k] = v; return nil }
func (m *mockStub) DelState(k string) error           { delete(m.state, k); return nil }
func (m *mockStub) CreateCompositeKey(objType string, attrs []string) (string, error) {
	return objType + "\x00" + strings.Join(attrs, "\x00"), nil
}
func (m *mockStub) GetTxTimestamp() (*timestamp.Timestamp, error) {
	return &timestamp.Timestamp{Seconds: m.ts.Unix()}, nil
}

type mockCID struct {
	cid.ClientIdentity
	mspID string
}

func (m *mockCID) GetMSPID() (string, error) { return m.mspID, nil }

type mockCtx struct {
	contractapi.TransactionContextInterface
	stub *mockStub
	id   *mockCID
}

func (m *mockCtx) GetStub() shim.ChaincodeStubInterface  { return m.stub }
func (m *mockCtx) GetClientIdentity() cid.ClientIdentity { return m.id }

// newEnv creates a fresh ledger. The same *mockStub is reused across ctx()
// calls so state persists between transactions within a test.
func newEnv() *mockStub {
	return &mockStub{state: map[string][]byte{}, ts: time.Unix(1_756_000_000, 0)}
}

func ctx(stub *mockStub, mspID string) *mockCtx {
	return &mockCtx{stub: stub, id: &mockCID{mspID: mspID}}
}

// --- tests -----------------------------------------------------------------

func TestRegisterDID(t *testing.T) {
	c := &EmploymentContract{}
	stub := newEnv()

	if err := c.RegisterDID(ctx(stub, "BMETMSP"), "did:key:worker1", "hash1"); err != nil {
		t.Fatalf("RegisterDID failed: %v", err)
	}
	if err := c.RegisterDID(ctx(stub, "BMETMSP"), "did:key:worker1", "hash1"); err == nil {
		t.Fatalf("expected duplicate DID registration to fail")
	}
}

func TestIssueAndVerify(t *testing.T) {
	c := &EmploymentContract{}
	stub := newEnv()

	if err := c.IssueCredential(ctx(stub, "TTCMSP"), "cred_001", "SkillCredential-v1", "did:key:ttc", "did:key:worker1", ""); err != nil {
		t.Fatalf("IssueCredential failed: %v", err)
	}
	// Duplicate issuance must fail.
	if err := c.IssueCredential(ctx(stub, "TTCMSP"), "cred_001", "SkillCredential-v1", "did:key:ttc", "did:key:worker1", ""); err == nil {
		t.Fatalf("expected duplicate credential to fail")
	}

	res, err := c.VerifyAnchor(ctx(stub, "SaudiCoMSP"), "cred_001")
	if err != nil {
		t.Fatalf("VerifyAnchor failed: %v", err)
	}
	if !res.Found || res.Status != StatusActive {
		t.Fatalf("expected found ACTIVE, got found=%v status=%s", res.Found, res.Status)
	}
	if res.CorroborationScore != 1 {
		t.Fatalf("expected initial corroboration score 1, got %d", res.CorroborationScore)
	}

	// Unknown credential returns a clean not-found result, not an error.
	res, err = c.VerifyAnchor(ctx(stub, "SaudiCoMSP"), "does_not_exist")
	if err != nil {
		t.Fatalf("VerifyAnchor of unknown should not error: %v", err)
	}
	if res.Found {
		t.Fatalf("expected not found for unknown credential")
	}
}

func TestRevoke(t *testing.T) {
	c := &EmploymentContract{}
	stub := newEnv()

	_ = c.IssueCredential(ctx(stub, "TTCMSP"), "cred_002", "SkillCredential-v1", "did:key:ttc", "did:key:worker1", "")
	if err := c.RevokeCredential(ctx(stub, "BMETMSP"), "cred_002", "FRAUD"); err != nil {
		t.Fatalf("RevokeCredential failed: %v", err)
	}
	// Double revoke must fail.
	if err := c.RevokeCredential(ctx(stub, "BMETMSP"), "cred_002", "FRAUD"); err == nil {
		t.Fatalf("expected double revoke to fail")
	}
	// Revoking unknown credential must fail.
	if err := c.RevokeCredential(ctx(stub, "BMETMSP"), "nope", "FRAUD"); err == nil {
		t.Fatalf("expected revoke of unknown to fail")
	}

	res, _ := c.VerifyAnchor(ctx(stub, "SaudiCoMSP"), "cred_002")
	if res.Status != StatusRevoked || res.ReasonCode != "FRAUD" {
		t.Fatalf("expected REVOKED/FRAUD, got %s/%s", res.Status, res.ReasonCode)
	}
}

func TestCorroboration(t *testing.T) {
	c := &EmploymentContract{}
	stub := newEnv()

	_ = c.IssueCredential(ctx(stub, "EmployerMSP"), "wage_001", "WageCredential-v1", "did:key:employer", "did:key:worker1", "")
	if err := c.SubmitCorroboration(ctx(stub, "BankMSP"), "wage_001", "did:key:bank", "ev1"); err != nil {
		t.Fatalf("SubmitCorroboration failed: %v", err)
	}
	// Issuer cannot corroborate its own claim.
	if err := c.SubmitCorroboration(ctx(stub, "EmployerMSP"), "wage_001", "did:key:employer", "ev2"); err == nil {
		t.Fatalf("expected self-corroboration to fail")
	}
	// Same source cannot corroborate twice.
	if err := c.SubmitCorroboration(ctx(stub, "BankMSP"), "wage_001", "did:key:bank", "ev3"); err == nil {
		t.Fatalf("expected duplicate corroboration to fail")
	}

	res, _ := c.VerifyAnchor(ctx(stub, "SaudiCoMSP"), "wage_001")
	if res.CorroborationScore != 2 {
		t.Fatalf("expected corroboration score 2 (issuer + bank), got %d", res.CorroborationScore)
	}
}

func TestContractLifecycle(t *testing.T) {
	c := &EmploymentContract{}
	stub := newEnv()
	const (
		hash     = "contract_001"
		worker   = "did:key:worker1"
		employer = "did:key:employer"
	)

	if err := c.CreateContract(ctx(stub, "AgencyMSP"), hash, worker, employer); err != nil {
		t.Fatalf("CreateContract failed: %v", err)
	}
	// Duplicate draft must fail.
	if err := c.CreateContract(ctx(stub, "AgencyMSP"), hash, worker, employer); err == nil {
		t.Fatalf("expected duplicate contract to fail")
	}

	// Employer cannot approve before the worker signs.
	if err := c.ApproveContract(ctx(stub, "EmployerMSP"), hash, employer); err == nil {
		t.Fatalf("expected approve-before-sign to fail")
	}
	// A stranger cannot sign in the worker's place.
	if err := c.SignContract(ctx(stub, "AgencyMSP"), hash, "did:key:intruder"); err == nil {
		t.Fatalf("expected signing by wrong worker to fail")
	}

	if err := c.SignContract(ctx(stub, "WorkerMSP"), hash, worker); err != nil {
		t.Fatalf("SignContract failed: %v", err)
	}
	// Double sign must fail (no longer PENDING).
	if err := c.SignContract(ctx(stub, "WorkerMSP"), hash, worker); err == nil {
		t.Fatalf("expected double sign to fail")
	}
	// Wrong employer cannot approve.
	if err := c.ApproveContract(ctx(stub, "EmployerMSP"), hash, "did:key:other"); err == nil {
		t.Fatalf("expected approval by wrong employer to fail")
	}
	if err := c.ApproveContract(ctx(stub, "EmployerMSP"), hash, employer); err != nil {
		t.Fatalf("ApproveContract failed: %v", err)
	}

	res, err := c.GetContract(ctx(stub, "SaudiCoMSP"), hash)
	if err != nil {
		t.Fatalf("GetContract failed: %v", err)
	}
	if !res.Found || res.Status != StatusSigned {
		t.Fatalf("expected found SIGNED, got found=%v status=%s", res.Found, res.Status)
	}
	if res.WorkerSignedAt == "" || res.ApprovedAt == "" {
		t.Fatalf("expected both signing timestamps to be set")
	}

	// Unknown contract returns a clean not-found result, not an error.
	res, err = c.GetContract(ctx(stub, "SaudiCoMSP"), "nope")
	if err != nil {
		t.Fatalf("GetContract of unknown should not error: %v", err)
	}
	if res.Found {
		t.Fatalf("expected not found for unknown contract")
	}
}

func TestUpdateAgencyStanding(t *testing.T) {
	c := &EmploymentContract{}
	stub := newEnv()

	// Score clamps at 100 and never below 0.
	if err := c.UpdateAgencyStanding(ctx(stub, "BMETMSP"), "did:key:ttc", 80, "audit-A"); err != nil {
		t.Fatalf("UpdateAgencyStanding failed: %v", err)
	}
	_ = c.UpdateAgencyStanding(ctx(stub, "BMETMSP"), "did:key:ttc", 50, "audit-B") // 80+50 -> clamp 100
	_ = c.UpdateAgencyStanding(ctx(stub, "BMETMSP"), "did:key:ttc", -200, "fraud")  // -> clamp 0

	st, err := c.GetAgencyStanding(ctx(stub, "SaudiCoMSP"), "did:key:ttc")
	if err != nil {
		t.Fatalf("GetAgencyStanding failed: %v", err)
	}
	if st.Score != 0 {
		t.Fatalf("expected clamped score 0, got %d", st.Score)
	}
	if len(st.History) != 3 {
		t.Fatalf("expected 3 history events, got %d", len(st.History))
	}

	// Issuer standing should surface in a verification result.
	_ = c.UpdateAgencyStanding(ctx(stub, "BMETMSP"), "did:key:ttc2", 75, "seed")
	_ = c.IssueCredential(ctx(stub, "TTCMSP"), "cred_x", "SkillCredential-v1", "did:key:ttc2", "did:key:worker9", "")
	res, _ := c.VerifyAnchor(ctx(stub, "SaudiCoMSP"), "cred_x")
	if res.IssuerStanding != 75 {
		t.Fatalf("expected issuer standing 75 in verify result, got %d", res.IssuerStanding)
	}
}
