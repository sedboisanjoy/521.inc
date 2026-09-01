#!/usr/bin/env bash
# Brings up the Fabric test-network, creates the anchor-channel, and deploys the
# Employment Passport Go chaincode. Org1 maps to BMET, Org2 to BAIRA. Add a
# third org (Bank) with the sample addOrg3 flow if desired.
#
# Usage: ./network/deploy.sh [up|down|redeploy]
set -euo pipefail

FABRIC_SAMPLES="${FABRIC_SAMPLES:-$HOME/hyperledger/fabric-samples}"
TEST_NETWORK="${FABRIC_SAMPLES}/test-network"
CHANNEL="${CHANNEL:-anchor-channel}"
CC_NAME="${CC_NAME:-employment-passport}"
CC_PATH="$(cd "$(dirname "$0")/../chaincode" && pwd)"
ACTION="${1:-up}"

if [ ! -d "${TEST_NETWORK}" ]; then
  echo "ERROR: ${TEST_NETWORK} not found. Run ./network/setup-fabric.sh first." >&2
  exit 1
fi

export PATH="${FABRIC_SAMPLES}/bin:${PATH}"
cd "${TEST_NETWORK}"

case "${ACTION}" in
  down)
    ./network.sh down
    ;;
  up|redeploy)
    if [ "${ACTION}" = "up" ]; then
      ./network.sh down
      ./network.sh up createChannel -c "${CHANNEL}" -ca
    fi
    echo "==> Deploying chaincode ${CC_NAME} from ${CC_PATH}"
    ./network.sh deployCC -ccn "${CC_NAME}" -ccp "${CC_PATH}" -ccl go -c "${CHANNEL}"
    echo ""
    echo "==> Chaincode deployed on channel '${CHANNEL}'."
    echo "==> Point the backend at Fabric with the env in network/env.fabric.example:"
    echo "      LEDGER_MODE=fabric \\"
    echo "      FABRIC_PEER_ENDPOINT=localhost:7051 \\"
    echo "      FABRIC_GATEWAY_PEER=peer0.org1.example.com \\"
    echo "      FABRIC_MSP_ID=Org1MSP \\"
    echo "      FABRIC_CHANNEL=${CHANNEL} FABRIC_CHAINCODE=${CC_NAME} \\"
    echo "      go run ."
    ;;
  *)
    echo "usage: $0 [up|down|redeploy]" >&2
    exit 1
    ;;
esac
