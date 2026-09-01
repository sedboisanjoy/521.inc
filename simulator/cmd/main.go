// Command simulator is the Employment Passport simulation + visualization
// backend. It runs its own REST API on :9090 by default, polls the main
// backend (:8080) for liveness, and serves the React visualizer's data layer.
//
// Two modes:
//
//	mock (default) — all blockchain control-flow is simulated in-memory
//	live             — the engine reflects real backend health + peer state
//
// The SQLite database at ~/.employment-passport/simulator.db survives restarts
// so past simulation runs are queryable.
package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/cheatro-gupto/employment-passport/simulator/internal/api"
	"github.com/cheatro-gupto/employment-passport/simulator/internal/db"
	"github.com/cheatro-gupto/employment-passport/simulator/internal/engine"
	"github.com/cheatro-gupto/employment-passport/simulator/internal/probe"
)

func main() {
	addr := envOr("ADDR", ":9090")
	backendURL := envOr("BACKEND_URL", "http://localhost:8080")
	dbPath := dbPath()

	// SQLite persistence
	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer database.Close()
	log.Printf("SQLite database at %s", dbPath)

	// Simulation engine
	eng := engine.New()

	// Health probe — polls the main backend every 3 seconds
	p := probe.New(backendURL, 3*time.Second)

	// Wire probe → engine (so topology reflects live backend status)
	p.OnChange(func(online bool) {
		eng.SetBackendOnline(online)
		_ = database.SetState("backendOnline", boolStr(online))
	})

	p.Start()
	defer p.Stop()

	// REST server
	srv := &api.Server{Eng: eng, DB: database, Probe: p}
	httpServer := &http.Server{
		Addr:         addr,
		Handler:      srv.Router(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 20 * time.Second,
	}
	log.Printf("Simulator listening on %s (backend=%s)", addr, backendURL)
	log.Fatal(httpServer.ListenAndServe())
}

func dbPath() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".employment-passport")
	_ = os.MkdirAll(dir, 0o755)
	return filepath.Join(dir, "simulator.db")
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}