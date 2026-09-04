import { useState, useEffect } from "react";
import { api, type WorkerDir, type WageEntry } from "../api";
import { useStore } from "../store";
import { Card, Field, Button, Badge, Copy, ErrorLine } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// Operations Suite (paid) — a company's day-to-day back office. Two powers:
// (a) issue an Employment Proof so a worker can later review this company, and
// (b) anchor Payroll wage events. A wage event stays PENDING_BANK until an
// independent bank co-signs it, so no single party can fake a salary history.
export function EmployerOps() {
  const { identityDID, session, log, toast, openFlow, autoFlow } = useStore();
  const myDID = identityDID || "did:key:employer";
  const companyName = session.orgName || "Company";

  const [workers, setWorkers] = useState<WorkerDir[]>([]);
  const [dirErr, setDirErr] = useState("");
  const [query, setQuery] = useState("");

  // Onboarding
  const [proofDID, setProofDID] = useState("");
  const [proofBusy, setProofBusy] = useState(false);
  const [proofErr, setProofErr] = useState("");

  // Payroll
  const [wageDID, setWageDID] = useState("");
  const [amount, setAmount] = useState(30000);
  const [month, setMonth] = useState("2026-08");
  const [wageBusy, setWageBusy] = useState(false);
  const [wageErr, setWageErr] = useState("");

  const [events, setEvents] = useState<WageEntry[]>([]);

  async function loadWorkers() {
    setDirErr("");
    try {
      setWorkers(await api.listWorkers());
    } catch (e) {
      setDirErr((e as Error).message);
    }
  }
  async function loadEvents() {
    try {
      setEvents(await api.listWageEvents(myDID, "issuer"));
    } catch {
      /* keep last known */
    }
  }
  useEffect(() => { loadWorkers(); }, []);
  useEffect(() => {
    loadEvents();
    const t = setInterval(loadEvents, 4000);
    return () => clearInterval(t);
  }, []);

  const filtered = workers.filter((w) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return w.name.toLowerCase().includes(q) || w.workerId.toLowerCase().includes(q) || w.did.toLowerCase().includes(q);
  });

  async function issueProof() {
    setProofErr("");
    setProofBusy(true);
    try {
      const r = await api.issueEmploymentProof({ employerDID: myDID, employer: companyName, workerDID: proofDID.trim() });
      const entry = log({ kind: "employ_proof", actor: "Company", title: `Employment proof issued`, detail: r.credHash, ok: true });
      toast("success", "Employment proof issued — the worker can now review this company");
      if (autoFlow) openFlow(subjectFromActivity(entry));
    } catch (e) {
      setProofErr((e as Error).message);
      toast("error", (e as Error).message);
    } finally {
      setProofBusy(false);
    }
  }

  async function anchorWage() {
    setWageErr("");
    setWageBusy(true);
    try {
      const r = await api.createWageEvent({ employerDID: myDID, employer: companyName, workerDID: wageDID.trim(), amount: Number(amount), month });
      const entry = log({ kind: "wage", actor: "Company", title: `Wage event ${amount} BDT (${month})`, detail: r.credHash, ok: true });
      toast("success", "Wage event anchored — PENDING_BANK until the bank co-signs");
      if (autoFlow) openFlow(subjectFromActivity(entry));
      loadEvents();
    } catch (e) {
      setWageErr((e as Error).message);
      toast("error", (e as Error).message);
    } finally {
      setWageBusy(false);
    }
  }

  function WorkerSelect({ value, onChange }: { value: string; onChange: (did: string) => void }) {
    if (workers.length === 0) {
      return (
        <div className="empty" style={{ marginTop: 8 }}>
          <div className="empty-ico"><Icon name="users" size={28} /></div>
          No workers have registered yet.
        </div>
      );
    }
    return (
      <div className="dir">
        <input
          className="dir-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or ID…"
        />
        <div className="dir-list">
          {filtered.map((w) => (
            <button
              key={w.did}
              className={`dir-row ${value === w.did ? "active" : ""}`}
              onClick={() => onChange(w.did)}
            >
              <span className="dir-radio">{value === w.did ? "●" : "○"}</span>
              <span className="dir-avatar">{w.name.charAt(0).toUpperCase()}</span>
              <span className="dir-info">
                <span className="dir-name">{w.name} <span className="dir-id">{w.workerId}</span></span>
                <span className="dir-meta mono">{w.did}</span>
              </span>
              <span className="dir-nid">NID {w.nidMasked}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="hint" style={{ padding: "8px 2px" }}>“{query}” not found.</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="panel-grid">
      <Card
        title="Onboarding"
        tag="Operations Suite"
        hint="Issue an Employment Proof to a worker. This on-chain link is what later lets the worker post an anonymous review of this company."
      >
        <div className="issuer-id">
          <span>Employer</span>
          <Copy value={myDID} short />
        </div>
        <Field label="Select the worker to onboard">
          <WorkerSelect value={proofDID} onChange={setProofDID} />
        </Field>
        <input
          className="dir-paste"
          value={proofDID}
          onChange={(e) => setProofDID(e.target.value)}
          placeholder="…or enter a worker DID directly"
        />
        <Button onClick={issueProof} busy={proofBusy} disabled={!proofDID.trim()}>Issue Employment Proof</Button>
        <ErrorLine msg={proofErr} />
      </Card>

      <Card
        title="Payroll"
        tag="Operations Suite"
        hint="Anchor a monthly wage event. It stays PENDING_BANK until an independent bank co-signs — only then is it trusted salary history."
      >
        <div className="issuer-id">
          <span>Employer</span>
          <Copy value={myDID} short />
        </div>
        <Field label="Select the worker to pay">
          <WorkerSelect value={wageDID} onChange={setWageDID} />
        </Field>
        <input
          className="dir-paste"
          value={wageDID}
          onChange={(e) => setWageDID(e.target.value)}
          placeholder="…or enter a worker DID directly"
        />
        <div className="row">
          <Field label="Amount (BDT)">
            <input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
          <Field label="Month">
            <input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="2026-08" />
          </Field>
        </div>
        <Button onClick={anchorWage} busy={wageBusy} disabled={!wageDID.trim()}>Anchor Wage Event</Button>
        <ErrorLine msg={wageErr} />
        <ErrorLine msg={dirErr} />
      </Card>

      <Card
        title="Wage Events"
        tag="Payroll Ledger"
        hint="Every wage event this company has anchored. A bank must co-sign before it becomes CONFIRMED."
      >
        <div className="dir-head" style={{ marginBottom: 8 }}>
          <span className="hint" style={{ margin: 0 }}>{events.length} event(s) · auto-refreshing</span>
          <button className="dir-refresh" onClick={loadEvents} title="Refresh">↻ Refresh</button>
        </div>
        {events.length === 0 ? (
          <div className="empty">
            <div className="empty-ico"><Icon name="wage" size={28} /></div>
            No wage events anchored yet.
          </div>
        ) : (
          <div className="job-list">
            {events.map((ev) => {
              const c = ev.claims as { amount?: number; currency?: string; month?: string; status?: string };
              const confirmed = c.status === "CONFIRMED";
              return (
                <article key={ev.credHash} className="applicant">
                  <div className="result-row"><span>Worker</span><Copy value={ev.workerDID || ""} short /></div>
                  <div className="result-row"><span>Amount</span><strong>{c.amount} {c.currency || "BDT"}</strong></div>
                  <div className="result-row"><span>Month</span><span>{c.month}</span></div>
                  <div className="result-row">
                    <span>Status</span>
                    <span><Badge status={confirmed ? "ACTIVE" : "UNKNOWN"} /> <span className="mono">{c.status}</span></span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
