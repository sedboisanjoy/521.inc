# Employment Passport — Implementation Plan

**Blockchain Olympiad Bangladesh 2026 · Team 404_found_us**
Hyperledger Fabric + Go + React · 2-day build

---

## 1. Context

This repo currently holds only the whitepaper (`Employment_Passport_Whitepaper_BCOLBD2026.pdf`) and its extracted text. There is **no code yet**.

This plan builds the working prototype the whitepaper's Phase 0 promises — *"Fabric network with three organisations; wallet and verifier SDK; one corridor, one trade"* — as a judge-facing demo that runs end to end on Linux and shows **Login → Register Worker → Issue Credential → Verify Credential in 4 clicks**, backed by a real 3-org Fabric network with a genuine multi-org endorsement policy.

### Two constraints that shape everything

**1. The dev machine cannot run this stack.** Windows 10, no Docker, no Go (available: Node 24, Python 3.14, Java 21). Files are authored on Windows; the network, chaincode and backend are compiled and run on the Linux box. Nothing can be pre-validated before handoff — every check in §10 is yours to execute.

**2. Two days is the budget.** Scope decisions below consistently favour *real but small* over *faithful to the whitepaper but unfinished*. Deviations are listed in §9.

---

## 2. Architecture as built

| Layer | Technology | Port |
|---|---|---|
| Frontend | React 18 + Bootstrap 5 (CSS only, no component library) | 3000 |
| Backend | Go 1.21+ / Gin, `fabric-gateway` client | 5000 |
| Chaincode | Go, `fabric-contract-api-go` | 9999 (CCaaS) |
| Network | Hyperledger Fabric 2.5 LTS — BMET, TTC, Bank + 1 Raft orderer | 7050–9051 |

Single channel `employment-channel`, chaincode name `employment`.

### Endorsement policy

Committed with:

```
--signature-policy "AND('TTCMSP.member','BMETMSP.member')"
```

This is **chaincode-level**, so it applies to every function, not just `IssueCredential`. That is the deliberate simplification: the Fabric Gateway collects endorsements from both orgs' peers automatically, which genuinely demonstrates multi-org endorsement without the complexity of state-based endorsement.

Know this for the Q&A: per-function policies would require `SetStateValidationParameter` on each key. That is a post-demo refinement, not a gap in understanding.

---

## 3. File tree

Files marked ★ are additions beyond the original spec that the build genuinely needs in order to run.

```
employment-passport/
├── README.md                          ★ setup + demo script
├── docker-compose.yaml                   backend + frontend + chaincode
├── Makefile                           ★ up / down / redeploy
├── chaincode/employment/
│   ├── go.mod, go.sum
│   ├── employment_cc.go                  SmartContract + the 6 core functions
│   ├── contract_cc.go                 ★ contract signing (use case 5)
│   ├── disclosure_cc.go               ★ disclosure anchoring (use case 4)
│   ├── models.go                      ★ Worker, Credential, TrustScore, Contract
│   └── Dockerfile                     ★ chaincode-as-a-service image
├── backend/
│   ├── cmd/api/main.go
│   ├── internal/api/{auth,credentials,contracts,wallet}.go
│   ├── internal/api/router.go         ★ routes + CORS + JWT middleware
│   ├── internal/fabric/{gateway,contract}.go
│   ├── internal/crypto/disclosure.go  ★ selective disclosure + threshold proof
│   ├── internal/models/types.go
│   ├── go.mod, .env.example
│   └── Dockerfile                     ★
├── frontend/
│   ├── package.json
│   ├── public/index.html              ★
│   ├── src/{index.js,App.js,App.css}
│   ├── src/services/api.js
│   ├── src/components/{Login,Register,WorkerDashboard,AdminPanel,VerifyPage}.jsx
│   └── Dockerfile                     ★
└── fabric-config/
    ├── configtx.yaml, crypto-config.yaml
    ├── docker-compose.yaml               peers, orderer, CLI
    ├── start.sh
    ├── stop.sh                        ★ clean re-runs
    └── deploy-chaincode.sh            ★ package / install / approve / commit
```

---

## 4. Chaincode

The six specified functions **do not cover use cases 4 and 5**, so three more are added.

| Function | Notes |
|---|---|
| `RegisterWorker(nid, name, address)` | Returns `workerId`. NID, name and address are **SHA-256 salted-hashed before any `PutState`** — only hashes and a salt commitment reach the ledger. |
| `IssueCredential(workerId, type, trade, level, issuer)` | Returns `credentialId`. Gated by the AND policy. Emits a `CredentialIssued` event. |
| `GetCredential(credentialId)` | Full credential record. |
| `VerifyCredential(credentialId)` | Returns `{valid, status, trust, recommendation}`. |
| `RevokeCredential(credentialId, reason)` | Sets status, applies −15 to issuer trust. |
| `GetWorkerWallet(workerId)` | Credential list via `GetStateByPartialCompositeKey`. |
| ★ `AnchorContract(...)` | Use case 5 — three-party contract. |
| ★ `SignContract(contractId, partyDID, sigHash)` | Fully signed once worker + agency + employer have all signed. |
| ★ `RecordDisclosure(credentialId, verifierDID, proofHash)` | Use case 4 — audit trail of who checked what. |

### Trust scores

Stored at composite key `trust~issuerDID`. Base **50**, **+2** per successful verification, **−15** per fraud or revocation, clamped 0–100.

`VerifyCredential` maps the score to a recommendation, which `VerifyPage` renders as a badge:

| Score | Recommendation |
|---|---|
| ≥ 70 | **Accept** |
| 40–69 | **Review** |
| < 40 | **Reject** |

---

## 5. Selective disclosure — read before building

The spec calls for BBS+. **BBS+ in Go is the single biggest schedule risk in this plan.** `aries-framework-go` is deprecated and the extracted `aries-bbs-go` is thinly maintained; a dependency rabbit hole here can consume most of day two and leave nothing demoable.

**Recommendation:** build `internal/crypto/disclosure.go` behind a `DisclosureProvider` interface and ship the hash-based provider as the default.

- **Default — real crypto, ~2 hours.** Per-attribute salted SHA-256 digests anchored on-chain at issuance. The worker reveals only chosen attributes plus their salts; the verifier recomputes the digests and matches the anchor. This is genuine selective disclosure — the same construction SD-JWT uses.
- **Salary threshold.** A Pedersen commitment to the salary is anchored at issuance; the wallet opens only the boolean `salary >= 25000`. Proves the claim without revealing the figure.
- **Stretch.** A `BBSProvider` behind the same interface, time-boxed to a strict 2 hours on day two. If it does not resolve, drop it and keep the interface.

Whichever ships, **label it accurately** in the README and to the jury. The hash-based scheme is *linkable* across verifiers; BBS+ is not. A jury that probes an overclaimed unlinkability guarantee costs far more than the honest, smaller claim.

Note that whitepaper Appendix B commits to BBS+ in writing. If the hash provider ships, soften that wording before submission.

---

## 6. Backend

`internal/fabric/gateway.go` connects using `github.com/hyperledger/fabric-gateway` — the Fabric 2.4+ gateway service, enabled by default in 2.5. **Not** the deprecated `fabric-sdk-go`. It loads the BMET admin identity from the `crypto-config` output, opens a gRPC connection to `peer0.bmet`, and exposes a singleton `*client.Contract`.

`contract.go` wraps each chaincode function in a typed Go method, so handlers never touch raw `[]byte`.

`internal/api/` holds the Gin handlers, one file per the spec. JWT is HS256 via `golang-jwt/jwt/v5` with four seeded demo users — `bmet_admin`, `ttc_issuer`, `bank_officer`, `worker`. This is simplified for the demo, and the README says so plainly rather than implying production auth.

---

## 7. Frontend

Vite or CRA, with Bootstrap 5 pulled from CDN in `public/index.html` — no component library, per spec.

`src/services/api.js` centralises axios with a JWT interceptor. Five components map to the five use cases, and `App.js` does role-based routing so the login role determines the landing screen.

`VerifyPage.jsx` is the money screen: credential status, trust-score badge, recommendation, and the disclosure proof result.

---

## 8. Two-day sequence

The chain is the risk, so it lands first.

### Day 1 — chain and API

1. Write `crypto-config.yaml` and `configtx.yaml`; run `cryptogen` and `configtxgen`.
   *cryptogen over Fabric CA — deprecated, but dramatically faster and the correct call at this scope.*
2. Bring up `fabric-config/docker-compose.yaml`; create `employment-channel` and join all three orgs.
3. Chaincode: models, six core functions, trust scores. Deploy via `deploy-chaincode.sh` with the AND policy.
   **Milestone: `peer chaincode query` returns a real credential.**
4. Backend gateway plus all endpoints returning live ledger data.
   **Milestone: `curl` issues and verifies a credential.**

### Day 2 — UI and demo

5. React shell, `api.js`, Login + Register.
6. WorkerDashboard, AdminPanel, VerifyPage.
7. Selective disclosure provider + contract signing.
8. Root `docker-compose.yaml`, README, and **rehearse the 4-click demo at least twice.**

> If day two runs short, cut the contract-signing screen — not the verification flow.

---

## 9. Scope deltas from the whitepaper

Worth knowing so a judge's question doesn't catch you out.

| Whitepaper says | Built as | Why |
|---|---|---|
| Four channels (`anchor`, `recruitment`, `payroll`, `governance`) | One channel | A day of config for zero visible demo difference |
| Raft orderer cluster | Single orderer, still Raft | Time |
| IPFS off-chain vault (§6.4) | Filesystem stub | On/off-chain split is real; storage is not distributed |
| Public Merkle anchoring bridge (§6.8) | Not built | Cut for time |
| Per-schema endorsement policies | Chaincode-level AND | See §2 |

### Two whitepaper defects to fix before submission

Found while reading the PDF, independent of the code:

- Page 1 names the team **CHEATro_GUPTO**; every page footer says **Team 404_found_us**.
- The TOC lists **§6.2 Network topology**, **§6.9 Performance and capacity**, and **Appendix C (Glossary)** — all three are **absent from the body**, and §6.9 is actively cited by the technical-risk table ("see §6.9").

### On the impact numbers

`+$20B remittance`, `−85% fraud`, `−40% recruitment cost` go in the docs as requested — but label them **projections with stated assumptions**, not measured results. Appendix D of your own whitepaper already instructs the team to re-verify figures against primary sources. An unsourced headline number is exactly what a jury drills into.

---

## 10. Verification — run on Linux, in order

Each step must pass before the next is worth attempting.

```bash
# 1. Prerequisites present
docker --version && docker compose version && go version && node --version

# 2. Network up — expect 5 containers (3 peers, 1 orderer, 1 CLI)
cd fabric-config && ./start.sh && docker ps

# 3. Channel joined by all three orgs
docker exec cli peer channel list          # run once per org env

# 4. Chaincode committed with the AND policy
./deploy-chaincode.sh
docker exec cli peer lifecycle chaincode querycommitted \
  -C employment-channel -n employment      # confirm the AND(...) policy string

# 5. Chaincode responds directly
docker exec cli peer chaincode invoke -C employment-channel -n employment \
  -c '{"function":"RegisterWorker","Args":["1990123456789","Rahim Uddin","Sylhet"]}'

# 6. Backend talks to the ledger
cd ../backend && go run cmd/api/main.go &
curl -s localhost:5000/health
curl -s -X POST localhost:5000/api/auth/login \
  -d '{"username":"bmet_admin","password":"demo"}'

# 7. Full stack
cd .. && docker compose up --build         # frontend on :3000
```

### Step 8 — the one that actually matters

```bash
# Prove the endorsement policy is genuinely enforced.
# Stop the TTC peer, then issue a credential. It MUST fail.
docker stop peer0.ttc.employment-passport.bd
#   -> expect an endorsement-policy failure, not a success
docker start peer0.ttc.employment-passport.bd
```

This is the difference between a demo that *claims* multi-org endorsement and one that *proves* it. **Consider showing it to the judges.**

---

## 11. Demo flow (4 clicks)

1. **Login** as `bmet_admin`
2. **Register Worker** — show that the ledger holds only a hash of the NID
3. **Issue Credential** as TTC, endorsed by BMET — show both endorsements
4. **Verify** — status, trust score, recommendation

**The closer:** prove salary ≥ 25,000 BDT without revealing the amount.

---

## 12. Open risk

BBS+ is the one item that could miss. The interface-plus-hash-provider approach means the demo works regardless — but **decide by midday on day two** whether BBS+ is landing. If it isn't, cut it and fix the Appendix B wording instead.
