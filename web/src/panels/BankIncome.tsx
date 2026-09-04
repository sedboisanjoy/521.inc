import { useState, useEffect } from "react";
import { api, type WorkerDir, type WageEntry } from "../api";
import { useStore } from "../store";
import { Card, Field, Button, Copy, ErrorLine } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// Bank — income verification for credit. The bank is a trusted party, so it may
// see the actual amounts. It reads a worker's CONFIRMED (employer + bank
// co-signed) wage history and answers a simple creditworthiness predicate.
export function BankIncome() {
  const { identityDID, log, toast, openFlow, autoFlow } = useStore();

  const [workers, setWorkers] = useState<WorkerDir[]>([]);
  const [dirErr, setDirErr] = useState("");
  const [query, setQuery] = useState("");
  const [workerDID, setWorkerDID] = useState("");

  const [thresholdAmount, setThresholdAmount] = useState(25000);
  const [monthsThreshold, setMonthsThreshold] = useState(1);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ count: number; ok: boolean; predicate: string } | null>(null);

  async function loadWorkers() {
    setDirErr("");
    try {
      setWorkers(await api.listWorkers());
    } catch (e) {
      setDirErr((e as Error).message);
    }
  }
  useEffect(() => { loadWorkers(); }, []);

  const filtered = workers.filter((w) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return w.name.toLowerCase().includes(q) || w.workerId.toLowerCase().includes(q) || w.did.toLowerCase().includes(q);
  });

  async function verify() {
    setErr("");
    setResult(null);
    setBusy(true);
    try {
      const events: WageEntry[] = await api.listWageEvents(workerDID.trim(), "subject");
      const confirmed = events.filter((ev) => (ev.claims as { status?: string }).status === "CONFIRMED");
      const count = confirmed.length;
      const allAbove = confirmed.every((ev) => Number((ev.claims as { amount?: number }).amount ?? 0) >= Number(thresholdAmount));
      const ok = count >= Number(monthsThreshold) && allAbove;
      const predicate = `≥ ${monthsThreshold} months at ≥ ${thresholdAmount} BDT?`;
      setResult({ count, ok, predicate });
      const entry = log({ kind: "verify", actor: "Bank", title: `Income verified — ${ok ? "Yes" : "No"}`, detail: workerDID.trim(), ok: true });
      toast(ok ? "success" : "info", ok ? "Income verified — creditworthy" : "Income does not meet the threshold");
      if (autoFlow) openFlow(subjectFromActivity(entry));
    } catch (e) {
      setErr((e as Error).message);
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Verify Income"
      tag="Creditworthiness"
      hint="The bank confirms creditworthiness from co-signed wage history. Only CONFIRMED wage events (signed by both the employer and a bank) count toward the verdict."
    >
      <Field label="Select the worker to assess">
        {workers.length === 0 ? (
          <div className="empty" style={{ marginTop: 8 }}>
            <div className="empty-ico"><Icon name="users" size={28} /></div>
            No workers have registered yet.
          </div>
        ) : (
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
                  className={`dir-row ${workerDID === w.did ? "active" : ""}`}
                  onClick={() => setWorkerDID(w.did)}
                >
                  <span className="dir-radio">{workerDID === w.did ? "●" : "○"}</span>
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
        )}
      </Field>
      <input
        className="dir-paste"
        value={workerDID}
        onChange={(e) => setWorkerDID(e.target.value)}
        placeholder="…or paste a worker DID directly"
      />
      <ErrorLine msg={dirErr} />

      <div className="row">
        <Field label="Minimum monthly amount (BDT)">
          <input type="number" min={0} value={thresholdAmount} onChange={(e) => setThresholdAmount(Number(e.target.value))} />
        </Field>
        <Field label="Minimum months">
          <input type="number" min={1} value={monthsThreshold} onChange={(e) => setMonthsThreshold(Number(e.target.value))} />
        </Field>
      </div>

      <Button onClick={verify} busy={busy} disabled={!workerDID.trim()}>Verify income</Button>
      <ErrorLine msg={err} />

      {result && (
        <div className="result">
          <div className={"verdict " + (result.ok ? "verdict-ok" : "verdict-no")}>
            <span className="verdict-ico">{result.ok ? "✓" : "✕"}</span>
            <div>
              <div className="verdict-title">{result.predicate} {result.ok ? "Yes" : "No"}</div>
              <div className="verdict-sub">
                {result.count} confirmed wage event(s) on record · <Copy value={workerDID} short />
              </div>
            </div>
          </div>
          <p className="hint" style={{ margin: "6px 0 0" }}>
            Verdict is based only on employer + bank co-signed wage history.
          </p>
        </div>
      )}
    </Card>
  );
}
