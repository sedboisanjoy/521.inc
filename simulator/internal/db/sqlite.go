// Package db persists simulation runs and state to a SQLite database so
// results survive restarts and can be queried by the visualizer across runs.
// Table schema mirrors engine.RunResult + engine.FlowEvent.
package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/cheatro-gupto/employment-passport/simulator/internal/engine"
	_ "modernc.org/sqlite"
)

// DB wraps a SQLite connection with a schema bootstrapper and CRUD helpers.
type DB struct {
	mu   sync.RWMutex
	conn *sql.DB
	path string
}

// Open creates (or opens) the SQLite database at the given path, runs
// migrations, and returns a ready DB handle.
func Open(path string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create db dir: %w", err)
	}
	conn, err := sql.Open("sqlite", path+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	conn.SetMaxOpenConns(1) // SQLite serialises writes
	db := &DB{conn: conn, path: path}
	if err := db.migrate(); err != nil {
		conn.Close()
		return nil, err
	}
	return db, nil
}

func (d *DB) migrate() error {
	_, err := d.conn.Exec(`
		CREATE TABLE IF NOT EXISTS runs (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			scenario   TEXT    NOT NULL,
			started_at TEXT    NOT NULL,
			ended_at   TEXT,
			success    INTEGER NOT NULL DEFAULT 0,
			summary    TEXT    NOT NULL DEFAULT '',
			topology   TEXT    NOT NULL DEFAULT '{}'
		);
		CREATE TABLE IF NOT EXISTS events (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			run_id     INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
			seq        INTEGER NOT NULL,
			type       TEXT    NOT NULL,
			"from"     TEXT    NOT NULL DEFAULT '',
			"to"       TEXT    NOT NULL DEFAULT '',
			message    TEXT    NOT NULL DEFAULT '',
			tx_id      TEXT    NOT NULL DEFAULT '',
			timestamp  TEXT    NOT NULL,
			success    INTEGER NOT NULL DEFAULT 0,
			details    TEXT    NOT NULL DEFAULT '{}'
		);
		CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id);
		CREATE TABLE IF NOT EXISTS state (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL DEFAULT ''
		);
	`)
	return err
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

// SaveRun persists a completed run plus its events in one transaction.
func (d *DB) SaveRun(r *engine.RunResult) (int64, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	topoJSON, _ := json.Marshal(r.Topology)
	ended := ""
	if r.EndedAt != nil {
		ended = r.EndedAt.Format(time.RFC3339)
	}
	success := 0
	if r.Success {
		success = 1
	}

	tx, err := d.conn.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	res, err := tx.Exec(
		`INSERT INTO runs (scenario, started_at, ended_at, success, summary, topology) VALUES (?,?,?,?,?,?)`,
		r.Scenario, r.StartedAt.Format(time.RFC3339), ended, success, r.Summary, string(topoJSON),
	)
	if err != nil {
		return 0, fmt.Errorf("insert run: %w", err)
	}
	runID, _ := res.LastInsertId()

	for _, ev := range r.Events {
		s := 0
		if ev.Success {
			s = 1
		}
		_, err := tx.Exec(
			`INSERT INTO events (run_id, seq, type, "from", "to", message, tx_id, timestamp, success, details) VALUES (?,?,?,?,?,?,?,?,?,?)`,
			runID, ev.Seq, string(ev.Type), ev.From, ev.To, ev.Message, ev.TxID, ev.Timestamp.Format(time.RFC3339), s, ev.Details,
		)
		if err != nil {
			return 0, fmt.Errorf("insert event: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit run: %w", err)
	}
	return runID, nil
}

// LoadRun returns a full run (including all events) by ID.
func (d *DB) LoadRun(id int64) (*engine.RunResult, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	row := d.conn.QueryRow(`SELECT id, scenario, started_at, ended_at, success, summary, topology FROM runs WHERE id=?`, id)
	var r engine.RunResult
	var started, ended string
	var success int
	var topoJSON string
	if err := row.Scan(&r.ID, &r.Scenario, &started, &ended, &success, &r.Summary, &topoJSON); err != nil {
		return nil, fmt.Errorf("scan run: %w", err)
	}
	r.StartedAt, _ = time.Parse(time.RFC3339, started)
	if ended != "" {
		t, _ := time.Parse(time.RFC3339, ended)
		r.EndedAt = &t
	}
	r.Success = success == 1
	json.Unmarshal([]byte(topoJSON), &r.Topology)

	events, err := d.loadEvents(runIDValue(r.ID))
	if err != nil {
		return nil, err
	}
	r.Events = events
	return &r, nil
}

// ListRuns returns the most recent runs (descending by id), limited to `limit`.
func (d *DB) ListRuns(limit int) ([]engine.RunResult, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	rows, err := d.conn.Query(`SELECT id, scenario, started_at, ended_at, success, summary, topology FROM runs ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, fmt.Errorf("query runs: %w", err)
	}
	defer rows.Close()

	var runs []engine.RunResult
	for rows.Next() {
		var r engine.RunResult
		var started, ended string
		var success int
		var topoJSON string
		if err := rows.Scan(&r.ID, &r.Scenario, &started, &ended, &success, &r.Summary, &topoJSON); err != nil {
			return nil, fmt.Errorf("scan run: %w", err)
		}
		r.StartedAt, _ = time.Parse(time.RFC3339, started)
		if ended != "" {
			t, _ := time.Parse(time.RFC3339, ended)
			r.EndedAt = &t
		}
		r.Success = success == 1
		json.Unmarshal([]byte(topoJSON), &r.Topology)
		runs = append(runs, r)
	}
	return runs, nil
}

func (d *DB) loadEvents(runID int64) ([]engine.FlowEvent, error) {
	rows, err := d.conn.Query(`SELECT id, seq, type, "from", "to", message, tx_id, timestamp, success, details FROM events WHERE run_id=? ORDER BY seq`, runID)
	if err != nil {
		return nil, fmt.Errorf("query events: %w", err)
	}
	defer rows.Close()

	var events []engine.FlowEvent
	for rows.Next() {
		var ev engine.FlowEvent
		var ts string
		var success int
		var details string
		if err := rows.Scan(&ev.ID, &ev.Seq, &ev.Type, &ev.From, &ev.To, &ev.Message, &ev.TxID, &ts, &success, &details); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		ev.Timestamp, _ = time.Parse(time.RFC3339, ts)
		ev.Success = success == 1
		ev.Details = details
		events = append(events, ev)
	}
	return events, nil
}

// ─── State (key-value) — used by the health probe ───────────────────────────

func (d *DB) SetState(key, value string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	_, err := d.conn.Exec(`INSERT OR REPLACE INTO state (key, value) VALUES (?,?)`, key, value)
	return err
}

func (d *DB) GetState(key string) (string, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	var v string
	err := d.conn.QueryRow(`SELECT value FROM state WHERE key=?`, key).Scan(&v)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return v, err
}

func (d *DB) Close() error { return d.conn.Close() }

func runIDValue(id int64) int64 { return id }