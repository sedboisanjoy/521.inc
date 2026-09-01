// Package api exposes the simulation engine over a REST API that the React
// visualizer consumes. Every endpoint maps to a visualizer widget — topology
// graph, scenario runner, event timeline, and system-status heartbeat.
package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/cheatro-gupto/employment-passport/simulator/internal/db"
	"github.com/cheatro-gupto/employment-passport/simulator/internal/engine"
	"github.com/cheatro-gupto/employment-passport/simulator/internal/probe"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// Server wires the engine, database, and health probe into an HTTP router.
type Server struct {
	Eng   *engine.Engine
	DB    *db.DB
	Probe *probe.Probe
}

// Router returns a chi router with all simulator endpoints.
func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger, middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type"},
	}))

	r.Get("/api/health", s.health)

	// Topology — live network map + D3 graph data
	r.Get("/api/topology", s.getTopology)

	// Scenarios — list available + run one
	r.Get("/api/scenarios", s.listScenarios)
	r.Post("/api/scenarios/{scenarioId}/run", s.runScenario)

	// Runs — query past simulation results
	r.Get("/api/runs", s.listRuns)
	r.Get("/api/runs/{runId}", s.getRun)
	r.Get("/api/runs/{runId}/events", s.getRunEvents)

	// System status — live backend health + peer status
	r.Get("/api/system-status", s.systemStatus)

	// Peer control — toggle online/offline for policy enforcement demo
	r.Post("/api/peers/{orgDID}/online", s.setPeerOnline)
	r.Post("/api/peers/{orgDID}/offline", s.setPeerOffline)

	return r
}

// ─── Handlers ──────────────────────────────────────────────────────────────

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":        "ok",
		"backendOnline": s.Eng.IsBackendOnline(),
		"time":          time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) getTopology(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"topology":      s.Eng.Topology(),
		"backendOnline": s.Probe.Status(),
	})
}

func (s *Server) listScenarios(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, engine.Scenarios)
}

func (s *Server) runScenario(w http.ResponseWriter, r *http.Request) {
	scenarioID := chi.URLParam(r, "scenarioId")
	result, err := s.Eng.RunScenario(scenarioID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	id, err := s.DB.SaveRun(result)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	result.ID = id
	writeJSON(w, http.StatusCreated, result)
}

func (s *Server) listRuns(w http.ResponseWriter, r *http.Request) {
	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	runs, err := s.DB.ListRuns(limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, runs)
}

func (s *Server) getRun(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "runId"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	run, err := s.DB.LoadRun(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusOK, run)
}

func (s *Server) getRunEvents(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "runId"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	run, err := s.DB.LoadRun(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusOK, run.Events)
}

func (s *Server) systemStatus(w http.ResponseWriter, r *http.Request) {
	topo := s.Eng.Topology()
	peers := make([]map[string]interface{}, len(topo.Peers))
	for i, p := range topo.Peers {
		peers[i] = map[string]interface{}{
			"name":     p.Name,
			"orgDid":   p.OrgDID,
			"endpoint": p.Endpoint,
			"online":   p.Online,
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"backendOnline": s.Probe.Status(),
		"ordererOnline": topo.Orderer.Online,
		"peers":         peers,
		"orgs":          topo.Orgs,
		"policy":        topo.Policy,
	})
}

func (s *Server) setPeerOnline(w http.ResponseWriter, r *http.Request) {
	orgDID := chi.URLParam(r, "orgDID")
	s.Eng.SetPeerOnline(orgDID, true)
	writeJSON(w, http.StatusOK, map[string]string{"status": "online", "orgDID": orgDID})
}

func (s *Server) setPeerOffline(w http.ResponseWriter, r *http.Request) {
	orgDID := chi.URLParam(r, "orgDID")
	s.Eng.SetPeerOnline(orgDID, false)
	writeJSON(w, http.StatusOK, map[string]string{"status": "offline", "orgDID": orgDID})
}

// ─── helpers ───────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, err error) {
	writeJSON(w, code, map[string]string{"error": err.Error()})
}