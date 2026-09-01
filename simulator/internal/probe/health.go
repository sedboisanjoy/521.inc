// Package probe periodically health-checks the main Employment Passport
// backend (Layer 2 REST API) and feeds the result into the simulation engine
// so the visualizer can show SYSTEM OFFLINE / ONLINE transitions.
package probe

import (
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

// Callback is the function the probe calls when backend status changes.
type Callback func(online bool)

// Probe polls the backend health endpoint and invokes cb whenever the
// online/offline state toggles.
type Probe struct {
	mu       sync.Mutex
	backendURL string
	interval time.Duration
	cbs      []Callback
	wasOnline bool
	client   *http.Client
	stopCh   chan struct{}
}

// New creates a Probe that hits backendURL/api/health every `interval`.
func New(backendURL string, interval time.Duration) *Probe {
	return &Probe{
		backendURL: backendURL,
		interval:   interval,
		client:     &http.Client{Timeout: 3 * time.Second},
		wasOnline:   false,
		stopCh:     make(chan struct{}),
	}
}

// OnChange registers a callback that fires when the backend status toggles.
func (p *Probe) OnChange(cb Callback) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.cbs = append(p.cbs, cb)
}

// Start begins the polling loop in a background goroutine.
func (p *Probe) Start() {
	go p.loop()
}

// Stop terminates the polling loop.
func (p *Probe) Stop() {
	close(p.stopCh)
}

func (p *Probe) loop() {
	// Fire immediately on start
	p.tick()

	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()

	for {
		select {
		case <-p.stopCh:
			return
		case <-ticker.C:
			p.tick()
		}
	}
}

func (p *Probe) tick() {
	online := p.check()
	p.mu.Lock()
	changed := online != p.wasOnline
	prev := p.wasOnline
	p.wasOnline = online
	cbs := make([]Callback, len(p.cbs))
	copy(cbs, p.cbs)
	p.mu.Unlock()

	if changed {
		if online {
			log.Printf("🔗 Backend ONLINE — %s is reachable (was offline)", p.backendURL)
		} else {
			log.Printf("🔴 Backend OFFLINE — %s is unreachable (was %v)", p.backendURL, prev)
		}
		for _, cb := range cbs {
			cb(online)
		}
	}
}

func (p *Probe) check() bool {
	url := fmt.Sprintf("%s/api/health", p.backendURL)
	resp, err := p.client.Get(url)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// Status returns the last known backend status (non-blocking).
func (p *Probe) Status() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.wasOnline
}