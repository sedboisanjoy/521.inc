import { useEffect, useState } from "react";
import { api, type WorkerDir } from "../api";
import { useStore } from "../store";
import { Card, Field, Button, ErrorLine, JsonDetails, Copy } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// Training Center portal — its sole power is to certify a worker's skill. A
// skill certificate records the trade, competency level and assessment score
// only. Wage and employer are NOT here: they belong to the hiring stage (the
// company sets the wage on its job posting), not to a training certificate.
export function Issuer() {
  const { session, setSession, log, toast, identityDID, openFlow, autoFlow } = useStore();
  const actor = "Training Center";
  const schemaId = "SkillCredential-v1";

  const [issuerDID] = useState(identityDID || "did:key:ttc-dhaka");
  const [subjectDID, setSubjectDID] = useState(session.did || "");
  const [trade, setTrade] = useState("Welding");
  const [level, setLevel] = useState(3);
  const [score, setScore] = useState(85);
  const [credOut, setCredOut] = useState<{ credHash: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [workers, setWorkers] = useState<WorkerDir[]>([]);
  const [query, setQuery] = useState("");
  const [dirErr, setDirErr] = useState("");

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
  const selected = workers.find((w) => w.did === subjectDID);

  async function issue() {
    setErr("");
    setBusy(true);
    try {
      const r = await api.issueCredential({
        schemaId,
        issuerDID,
        subjectDID: subjectDID.trim(),
        claims: { trade, level: Number(level), score: Number(score) },
      });
      setCredOut(r);
      setSession({ credHash: r.credHash });
      const entry = log({ kind: "issue", actor, title: `Certificate: ${trade} (level ${level})`, detail: r.credHash, ok: true });
      toast("success", "Certificate anchored on the blockchain");
      if (autoFlow) openFlow(subjectFromActivity(entry));
    } catch (e) {
      const m = (e as Error).message;
      setErr(m);
      const entry = log({ kind: "issue", actor, title: `Failed to issue certificate`, detail: m, ok: false });
      toast("error", m);
      if (autoFlow) openFlow(subjectFromActivity(entry));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-narrow">
      <Card
        title="Issue Skill Certificate"
        tag="Step 1"
        hint="Issue a skill certificate to a worker you have trained. Only a private hash goes to the blockchain — the certificate details stay off-chain."
      >
        <div className="issuer-id">
          <span>Issuer</span>
          <Copy value={issuerDID} short />
        </div>

        <div className="dir">
          <div className="dir-head">
            <label style={{ margin: 0 }}>Select the worker to certify</label>
            <button className="dir-refresh" onClick={loadWorkers} title="Refresh">↻ Refresh</button>
          </div>
          <input
            className="dir-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or ID…"
          />
          <ErrorLine msg={dirErr} />
          {workers.length === 0 ? (
            <div className="empty" style={{ marginTop: 10 }}>
              <div className="empty-ico"><Icon name="users" size={28} /></div>
              No workers have registered yet — a worker must first register from the login page.
            </div>
          ) : (
            <div className="dir-list">
              {filtered.map((w) => (
                <button
                  key={w.did}
                  className={`dir-row ${subjectDID === w.did ? "active" : ""}`}
                  onClick={() => setSubjectDID(w.did)}
                >
                  <span className="dir-radio">{subjectDID === w.did ? "●" : "○"}</span>
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
          )}
          {selected && (
            <div className="dir-selected">Certifying <strong>{selected.name}</strong></div>
          )}
        </div>

        {!selected && workers.length > 0 && (
          <input
            className="dir-paste"
            value={subjectDID}
            onChange={(e) => setSubjectDID(e.target.value)}
            placeholder="…or enter an ID directly"
          />
        )}

        <Field label="Trade / skill being certified">
          <input value={trade} onChange={(e) => setTrade(e.target.value)} />
        </Field>
        <div className="row">
          <Field label="Skill level (1–5)">
            <input type="number" min={1} max={5} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
          </Field>
          <Field label="Assessment score (%)">
            <input type="number" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} />
          </Field>
        </div>

        <Button onClick={issue} busy={busy} disabled={!subjectDID.trim()}>Issue Certificate</Button>
        <ErrorLine msg={err} />
        {credOut && (
          <div className="result">
            <div className="result-row">
              <span>Certificate hash</span>
              <Copy value={credOut.credHash} short />
            </div>
            <p className="hint" style={{ margin: "6px 0 0" }}>
              The worker will now find this in their certificate list and can use it to apply for jobs.
            </p>
            <Button
              variant="ghost"
              onClick={() => openFlow({ kind: "issue", actor, detail: credOut.credHash, ok: true, label: `Certificate: ${trade}` })}
            >
              <Icon name="flow" size={16} /> View data flow
            </Button>
            <JsonDetails data={credOut} />
          </div>
        )}
      </Card>
    </div>
  );
}
