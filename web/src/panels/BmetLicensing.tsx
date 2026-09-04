import { useCallback, useEffect, useState } from "react";
import { api, type AgencyLicenceRow } from "../api";
import { useStore } from "../store";
import { Card, Field, Button, Badge, Copy, ErrorLine } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// BMET portal — agency licensing + the public standing board (§3.8). Only a
// licensed agency may submit applications; each licensed agency's computed
// standing is published here so a worker or employer can check it before
// committing.
export function BmetLicensing() {
  const { log, toast, openFlow, autoFlow } = useStore();

  const [rows, setRows] = useState<AgencyLicenceRow[]>([]);
  const [agencyDID, setAgencyDID] = useState("did:key:agency");
  const [legalName, setLegalName] = useState("Prime Recruitment Ltd");
  const [corridors, setCorridors] = useState("KSA, UAE, Qatar");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setRows(await api.listAgencyLicences()); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function issue() {
    setErr("");
    if (!agencyDID.trim() || !legalName.trim()) return setErr("Agency DID and legal name are required.");
    setBusy(true);
    try {
      const r = await api.issueAgencyLicence({ agencyDID: agencyDID.trim(), legalName: legalName.trim(), corridors: corridors.trim() });
      const entry = log({ kind: "licence", actor: "BMET", title: `Licensed ${legalName}`, detail: r.credHash, ok: true });
      toast("success", `${legalName} licensed`);
      if (autoFlow) openFlow(subjectFromActivity(entry));
      await load();
    } catch (e) {
      const m = (e as Error).message;
      setErr(m);
      toast("error", m);
    } finally {
      setBusy(false);
    }
  }

  const scoreTone = (n: number) => (n >= 70 ? "score-good" : n >= 40 ? "score-mid" : "score-bad");

  return (
    <div className="panel-grid">
      <Card title="License an Agency" tag="BMET" color="gold"
        hint="A regulator-verified licence is the gate: only a licensed agency may submit applications on a worker's behalf.">
        <Field label="Agency DID">
          <input value={agencyDID} onChange={(e) => setAgencyDID(e.target.value)} placeholder="did:key:agency" />
        </Field>
        <Field label="Legal name">
          <input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        </Field>
        <Field label="Permitted corridors">
          <input value={corridors} onChange={(e) => setCorridors(e.target.value)} />
        </Field>
        <Button onClick={issue} busy={busy}>Issue licence</Button>
        <ErrorLine msg={err} />
      </Card>

      <Card title="Standing Board" tag="Published digest"
        hint="Each licensed agency's computed standing — derived from anchored events, verifiable by anyone, editable by no one.">
        {rows.length === 0 ? (
          <div className="empty"><div className="empty-ico"><Icon name="agency" size={28} /></div>No agencies licensed yet.</div>
        ) : (
          <div className="job-list">
            {rows.map((r) => (
              <article key={r.credHash} className="applicant">
                <div className="job-head">
                  <div>
                    <div className="job-title">{r.legalName}</div>
                    <Copy value={r.agencyDID} short />
                  </div>
                  <span className={`standing-pill ${scoreTone(r.digest.score)}`}>{r.digest.score}/100</span>
                </div>
                <div className="result-row"><span>Licence</span><Badge status={r.status === "active" ? "ACTIVE" : r.status.toUpperCase()} /></div>
                <div className="result-row"><span>Placements</span><strong>{r.digest.placements}</strong></div>
                <div className="result-row"><span>Corroborated</span><strong>{r.digest.corroborationPct}%</strong></div>
                <div className="result-row"><span>Distinct employers</span><strong>{r.digest.distinctEmployers}</strong></div>
                <div className="result-row"><span>Upheld disputes</span><strong>{r.digest.upheldDisputes}</strong></div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
