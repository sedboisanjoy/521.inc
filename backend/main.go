// Command backend is the Employment Passport API server (Layer 2/3). It runs in
// one of two ledger modes selected by LEDGER_MODE:
//
//	mock   (default) — in-memory ledger, no Fabric required; ideal for dev/demo
//	fabric           — connects to a live Fabric network via the gateway
package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/cheatro-gupto/employment-passport/backend/internal/api"
	"github.com/cheatro-gupto/employment-passport/backend/internal/ledger"
	"github.com/cheatro-gupto/employment-passport/backend/internal/store"
)

func main() {
	addr := envOr("ADDR", ":8080")
	l := buildLedger()
	defer l.Close()

	srv := &api.Server{L: l, S: store.New()}
	httpServer := &http.Server{
		Addr:         addr,
		Handler:      srv.Router(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 20 * time.Second,
	}
	log.Printf("employment-passport backend listening on %s (LEDGER_MODE=%s)", addr, envOr("LEDGER_MODE", "mock"))
	log.Fatal(httpServer.ListenAndServe())
}

func buildLedger() ledger.Ledger {
	if os.Getenv("LEDGER_MODE") != "fabric" {
		log.Println("using in-memory mock ledger")
		return ledger.NewMock()
	}
	cfg := ledger.FabricConfig{
		PeerEndpoint: envOr("FABRIC_PEER_ENDPOINT", "localhost:7051"),
		GatewayPeer:  envOr("FABRIC_GATEWAY_PEER", "peer0.bmet.example.com"),
		MSPID:        envOr("FABRIC_MSP_ID", "BMETMSP"),
		TLSCertPath:  os.Getenv("FABRIC_TLS_CERT"),
		CertPath:     os.Getenv("FABRIC_USER_CERT"),
		KeyDir:       os.Getenv("FABRIC_USER_KEY_DIR"),
		Channel:      envOr("FABRIC_CHANNEL", "anchor-channel"),
		Chaincode:    envOr("FABRIC_CHAINCODE", "employment-passport"),
	}
	f, err := ledger.NewFabric(cfg)
	if err != nil {
		log.Fatalf("failed to connect to Fabric: %v", err)
	}
	log.Println("connected to Fabric network")
	return f
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
