# Employment Passport — Build & Run

A working Phase-0 prototype of the Employment Passport credential network
(BCOLBD 2026). Go chaincode + Go backend + React PWA, with Hyperledger Fabric as
the ledger. See [README.md](README.md) for the whitepaper discussion and
[docs/](docs/) for the architecture.

## Repository layout

```
chaincode/   Go chaincode — the 7 Appendix-A functions + unit tests
backend/     Go API (chi + fabric-gateway); mock OR fabric ledger mode
web/         React + TypeScript PWA (Issuer / Wallet / Verifier / Admin)
network/     Fabric setup + chaincode deploy scripts
docs/        architecture diagram (draw.io) + notes
demo.sh      end-to-end curl walkthrough of all 7 use cases
```

## Prerequisites (Linux)

Docker, Go 1.22+, Node 20+. Fabric binaries only needed for `fabric` mode.

## Quick start (mock mode — no Fabric required)

The backend ships with an in-memory ledger that reproduces the chaincode
semantics, so the whole stack runs on one machine with no blockchain to stand up.

```bash
# 1. run the chaincode unit tests
make chaincode-test

# 2. start the API (mock ledger) on :8080
make backend

# 3. in another terminal, run the full end-to-end demo
make demo

# 4. or start the web UI (proxies /api -> :8080) and click through
make web        # http://localhost:5173
```

## Full mode (real Hyperledger Fabric)

```bash
# 1. install Fabric 2.5 binaries + samples (~/hyperledger/fabric-samples)
make fabric-setup
export PATH=$PATH:~/hyperledger/fabric-samples/bin

# 2. bring up the test-network + deploy the chaincode on anchor-channel
make fabric-up

# 3. run the backend against Fabric (uses network/env.fabric.example)
make backend-fabric

# 4. web UI + demo work identically
make web
```

Org1 maps to **BMET**, Org2 to **BAIRA**. Add a third org (**Bank**) with the
`addOrg3` sample flow in `fabric-samples/test-network` if you want the full
three-org topology from the whitepaper.

## What the demo proves (all 7 README use cases)

| # | Use case | Endpoint | Chaincode fn |
|---|----------|----------|--------------|
| 1 | Worker registration | `POST /api/workers` | `RegisterDID` |
| 2 | Skill credential issuance | `POST /api/credentials` | `IssueCredential` |
| 3 | Contract anchoring | `POST /api/credentials` | `IssueCredential` |
| 4 | Credential verification | `GET /api/verify/:hash` | `VerifyAnchor` |
| 5 | Wage record | `POST /api/credentials` | `IssueCredential` |
| 6 | Revocation | `POST /api/revoke` | `RevokeCredential` |
| 7 | Trust monitoring | `POST /api/agency-standing` | `UpdateAgencyStanding` |

Plus **selective disclosure** (`POST /api/disclose`) — prove `wage ≥ 25000`
without revealing the amount — and **corroboration** (`POST /api/corroborate`).

## The Golden Rule

No personal data ever touches the ledger. PII and full credential bodies live in
the off-chain store (`backend/internal/store`, IPFS/Postgres in production);
only salted hashes, DIDs, and status flags are anchored on-chain.
