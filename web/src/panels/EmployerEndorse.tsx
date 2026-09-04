import { useState, useEffect } from "react";
import { api, type WorkerDir } from "../api";
import { useStore } from "../store";
import { Card, Field, Button, Copy, ErrorLine } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// Company / manager portal — a staked endorsement of a worker's specific
// competence. Unlike a certificate, an endorsement puts the endorser's own
// standing on the line: if it is later disputed and proven false, the
// endorsement is revoked and the endorser's standing is slashed. That stake
// is exactly what makes an endorsement worth trusting.
export function EmployerEndorse() {
  const { identityDID, session, log, toast, openFlow, autoFlow } = useStore();
  const myDID = identityDID || "did:key:employer";
  const endorserName = session.orgName || "Company";

  const [workers, setWorkers] = useState<WorkerDir[]>([]);
  const [query, setQuery] = useState("");
  const [dirErr, setDirErr] = useState("");

  const [workerDID, setWorkerDID] = useState("");
  const [competence, setCompetence] = useState("Certified welder, level 3");
  const [credHash, setCredHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [dispHash, setDispHash] = useState("");
  const [dispEndorser, setDispEndorser] = useState("");
  const [dispBusy, setDispBusy] = useState(false);
  const [dispErr, setDispErr] = useState("");
  const [dispOut, setDispOut] = useState<{ status: string; score: number } | null>(null);

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
  const selected = workers.find((w) => w.did === workerDID);

  async function endorse() {
    setErr("");
    setBusy(true);
    try {
      const r = await api.issueEndorsement({ endorserDID: myDID, endorser: endorserName, workerDID: workerDID.trim(), competence: competence.trim() });
      setCredHash(r.credHash);
      const entry = log({ kind: "endorse", actor: endorserName, title: `Endorsed: ${competence}`, detail: r.credHash, ok: true });
      toast("success", "Endorsement anchored — your standing is staked on it");
      if (autoFlow) openFlow(subjectFromActivity(entry));
    } catch (e) {
      const m = (e as Error).message;
      setErr(m);
      toast("error", m);
    } finally {
      setBusy(false);
    }
  }

  async function dispute() {
    setDispErr("");
    setDispBusy(true);
    try {
      const r = await api.disputeEndorsement({ credHash: dispHash.trim(), endorserDID: dispEndorser.trim() });
      setDispOut(r);
      const entry = log({ kind: "dispute", actor: endorserName, title: `Disputed endorsement`, detail: dispHash.trim(), ok: true });
      toast("success", `Endorsement disputed — endorser standing slashed to ${r.score}`);
      if (autoFlow) openFlow(subjectFromActivity(entry));
    } catch (e) {
      const m = (e as Error).message;
      setDispErr(m);
      toast("error", m);
    } finally {
      setDispBusy(false);
    }
  }

  return (
    <div className="panel-narrow">
      <Card
        title="Endorse a Worker"
        tag="Staked Endorsement"
        hint="Vouch for a worker's specific competence. This is not a training certificate — it stakes your own standing, so it only carries weight because a false endorsement can be slashed."
      >
        <div className="issuer-id">
          <span>Endorser</span>
          <Copy value={myDID} short />
        </div>

        <div className="dir">
          <div className="dir-head">
            <label style={{ margin: 0 }}>Select the worker to endorse</label>
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
          )}
          {selected && (
            <div className="dir-selected">Endorsing <strong>{selected.name}</strong></div>
          )}
        </div>

        {!selected && workers.length > 0 && (
          <input
            className="dir-paste"
            value={workerDID}
            onChange={(e) => setWorkerDID(e.target.value)}
            placeholder="…or enter a worker DID directly"
          />
        )}

        <Field label="Competence being endorsed">
          <input value={competence} onChange={(e) => setCompetence(e.target.value)} placeholder="e.g. Certified welder, level 3" />
        </Field>

        <Button onClick={endorse} busy={busy} disabled={!workerDID.trim() || !competence.trim()}>Anchor Endorsement</Button>
        <ErrorLine msg={err} />
        {credHash && (
          <div className="result">
            <div className="result-row">
              <span>Endorsement hash</span>
              <Copy value={credHash} short />
            </div>
            <p className="hint" style={{ margin: "6px 0 0" }}>
              Your standing is now staked on this endorsement. If it is later disputed and found false, it will be revoked and your standing slashed.
            </p>
          </div>
        )}
      </Card>

      <Card
        title="Dispute an Endorsement"
        tag="Accountability"
        hint="A false endorsement can be challenged. When a dispute is upheld the endorsement is revoked and the endorser's standing is slashed — which is precisely what gives every honest endorsement its weight."
      >
        <Field label="Endorsement hash to dispute">
          <input value={dispHash} onChange={(e) => setDispHash(e.target.value)} placeholder="cred hash…" />
        </Field>
        <Field label="Endorser DID (optional)">
          <input value={dispEndorser} onChange={(e) => setDispEndorser(e.target.value)} placeholder="did:key:… (optional)" />
        </Field>
        <Button onClick={dispute} busy={dispBusy} variant="danger" disabled={!dispHash.trim()}>Dispute Endorsement</Button>
        <ErrorLine msg={dispErr} />
        {dispOut && (
          <div className="result">
            <div className="result-row"><span>Endorsement status</span><strong>{dispOut.status}</strong></div>
            <div className="result-row"><span>Endorser standing (slashed)</span><strong>{dispOut.score}</strong></div>
            <p className="hint" style={{ margin: "6px 0 0" }}>
              The endorsement has been revoked and the endorser's standing reduced.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
