# Employment Passport — developer tasks.
# Run `make help` for the list.

.PHONY: help chaincode-test chaincode-build backend backend-fabric web web-build \
        fabric-setup fabric-up fabric-down demo \
        simulator simulator-web

help:
	@echo "Employment Passport — make targets:"
	@echo "  chaincode-test   run Go chaincode unit tests"
	@echo "  chaincode-build  compile the chaincode"
	@echo "  backend          run the API in mock mode (no Fabric needed)"
	@echo "  backend-fabric   run the API against the Fabric network"
	@echo "  web              run the React dev server (proxies /api -> :8080)"
	@echo "  web-build        production build of the web app"
	@echo "  fabric-setup     install Fabric 2.5 binaries + samples"
	@echo "  fabric-up        bring up test-network + deploy chaincode"
	@echo "  fabric-down      tear down the Fabric network"
	@echo "  demo             run the end-to-end curl demo against a running backend"
	@echo "  simulator        run the control-flow simulator (Go, :9090)"
	@echo "  simulator-web    run the simulator visualizer (React, :5174)"

chaincode-test:
	cd chaincode && go test ./...

chaincode-build:
	cd chaincode && go build ./...

backend:
	cd backend && LEDGER_MODE=mock go run .

backend-fabric:
	set -a && . network/env.fabric.example && set +a && cd backend && go run .

web:
	cd web && npm install && npm run dev

web-build:
	cd web && npm install && npm run build

fabric-setup:
	./network/setup-fabric.sh

fabric-up:
	./network/deploy.sh up

fabric-down:
	./network/deploy.sh down

demo:
	./demo.sh

simulator:
	cd simulator && go run ./cmd/

simulator-web:
	cd simulator/web && npm install && npm run dev
