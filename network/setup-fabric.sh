#!/usr/bin/env bash
# Installs Hyperledger Fabric 2.5 binaries, Docker images and samples into
# ~/hyperledger/fabric-samples. Idempotent: skips if already present.
set -euo pipefail

FABRIC_VERSION="${FABRIC_VERSION:-2.5.9}"
CA_VERSION="${CA_VERSION:-1.5.13}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/hyperledger}"

echo "==> Installing Hyperledger Fabric ${FABRIC_VERSION} into ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
cd "${INSTALL_DIR}"

if [ ! -d fabric-samples ]; then
  curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
  chmod +x install-fabric.sh
  ./install-fabric.sh --fabric-version "${FABRIC_VERSION}" --ca-version "${CA_VERSION}" docker samples binary
else
  echo "    fabric-samples already present, skipping download"
fi

echo ""
echo "==> Add Fabric binaries to your PATH:"
echo "    export PATH=\$PATH:${INSTALL_DIR}/fabric-samples/bin"
echo "==> Then deploy the chaincode with: ./network/deploy.sh"
