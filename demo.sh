#!/usr/bin/env bash
# End-to-end demo against a running backend (default :8080). Walks the 7 use
# cases: trust score -> register -> issue -> verify -> selective disclosure ->
# corroborate -> revoke.
set -euo pipefail
B="${BACKEND:-http://localhost:8080}"
j() { grep -o "\"$1\":\"[^\"]*\"" | head -1 | cut -d'"' -f4; }

echo "== UC7: BMET seeds TTC trust score (+80) =="
curl -s -X POST "$B/api/agency-standing" -H 'Content-Type: application/json' \
  -d '{"agencyDID":"did:key:ttc-dhaka","delta":80,"evidenceHash":"audit-A"}'; echo

echo "== UC1: register worker =="
SUBJECT=$(curl -s -X POST "$B/api/workers" -H 'Content-Type: application/json' \
  -d '{"name":"Rahim Uddin","nid":"1990123456","address":"Sylhet"}' | j did)
echo "subjectDID=$SUBJECT"

echo "== UC2: TTC issues Welding L3 (wage 32000 embedded) =="
CRED=$(curl -s -X POST "$B/api/credentials" -H 'Content-Type: application/json' \
  -d "{\"schemaId\":\"SkillCredential-v1\",\"issuerDID\":\"did:key:ttc-dhaka\",\"subjectDID\":\"$SUBJECT\",\"claims\":{\"trade\":\"Welding\",\"level\":3,\"wageAmount\":32000,\"employer\":\"SaudiCo\"}}" | j credHash)
echo "credHash=$CRED"

echo "== UC4: verify anchor =="
curl -s "$B/api/verify/$CRED"; echo

echo "== Selective disclosure: prove wageAmount >= 25000 (value stays hidden) =="
curl -s -X POST "$B/api/disclose" -H 'Content-Type: application/json' \
  -d "{\"credHash\":\"$CRED\",\"attribute\":\"wageAmount\",\"op\":\">=\",\"value\":25000,\"verifierDID\":\"did:key:bank\"}"; echo

echo "== corroborate (score -> 2) =="
curl -s -X POST "$B/api/corroborate" -H 'Content-Type: application/json' \
  -d "{\"credHash\":\"$CRED\",\"sourceDID\":\"did:key:bank\",\"evidenceHash\":\"ev\"}"; echo

echo "== UC6: revoke =="
curl -s -X POST "$B/api/revoke" -H 'Content-Type: application/json' \
  -d "{\"credHash\":\"$CRED\",\"reasonCode\":\"FRAUD_AUDIT\"}"; echo
echo "== re-verify (REVOKED) =="
curl -s "$B/api/verify/$CRED"; echo
