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
	"path/filepath"
	"strings"
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
	srv.Bootstrap() // register fixed actor DIDs (bank, ministry, rjsc, bfiu, …)
	httpServer := &http.Server{
		Addr:         addr,
		Handler:      appHandler(srv.Router()),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 20 * time.Second,
	}
	log.Printf("employment-passport backend listening on %s (LEDGER_MODE=%s)", addr, envOr("LEDGER_MODE", "mock"))
	log.Fatal(httpServer.ListenAndServe())
}

func appHandler(apiHandler http.Handler) http.Handler {
	staticDir := envOr("STATIC_DIR", "../web/dist")
	files := http.FileServer(http.Dir(staticDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			apiHandler.ServeHTTP(w, r)
			return
		}
		path := filepath.Join(staticDir, filepath.Clean(r.URL.Path))
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			files.ServeHTTP(w, r)
			return
		}
		r.URL.Path = "/"
		files.ServeHTTP(w, r)
	})
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
