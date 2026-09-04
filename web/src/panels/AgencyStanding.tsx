import { useCallback, useEffect, useState } from "react";
import { api, type AgencyDigest, type Allegation } from "../api";
import { useStore } from "../store";
import { Card, Button, Badge, Copy } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// Agency portal — the agency's own computed standing (§3.8). Standing is derived
// from anchored events (placements, corroboration, upheld disputes, counterparty
// diversity), so it is recomputed rather than tallied — the agency cannot edit
// it and no client can buy it. Open allegations can be answered here, inside the
// 14-day window.
export function AgencyStanding() {
  const { identityDID, log, toast, openFlow, autoFlow } = useStore();
  const myDID = identityDID || "did:key:agency";

  const [digest, setDigest] = useState<AgencyDigest | null>(null);
  const [allegations, setAllegations] = useState<Allegation[]>([]);
  const [counter, setCounter] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setDigest(await api.agencyDigest(myDID));
      setAllegations(await api.allegationsByAgency(myDID));
    } catch {
      /* ignore */
    }
  }, [myDID]);

  useEffect(() => { load(); }, [load]);

  async function respond(a: Allegation) {
    setBusy(a.id);
    try {
      await api.respondAllegation(a.id, { agencyDID: myDID, counterClaim: counter[a.id] || "Supporting evidence on file." });
      const entry = log({ kind: "respond", actor: "Agency", title: `Responded to ${a.id}`, detail: a.responseHash || a.allegationHash, ok: true });
      toast("success", `Response filed for ${a.id}`);
      if (autoFlow) openFlow(subjectFromActivity(entry));
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const scoreTone = (n: number) => (n >= 70 ? "score-good" : n >= 40 ? "score-mid" : "score-bad");
  const inWindow = (a: Allegation) => a.status === "open" && Date.now() / 1000 < a.responseDeadline;
  const daysLeft = (a: Allegation) => Math.max(0, Math.ceil((a.responseDeadline - Date.now() / 1000) / 86400));

  return (
    <div className="panel-grid">
      <Card title="My Standing" tag="Computed, not tallied" color="gold"
        hint="Derived from anchored events — any party can recompute the same number. It cannot be bought or edited; that is the point.">
        {!digest ? (
          <div className="empty"><div className="empty-ico"><Icon name="chart" size={28} /></div>Loading…</div>
        ) : (
          <>
            <div className={`big-score ${scoreTone(digest.score)}`}>
              {digest.score}<span className="big-score-max">/100</span>
              {!digest.rated && <span className="score-note"> · unrated</span>}
            </div>
            <div className="result-row"><span>Placements</span><strong>{digest.placements}</strong></div>
            <div className="result-row"><span>Distinct employers</span><strong>{digest.distinctEmployers}</strong></div>
            <div className="result-row"><span>Asserted claims corroborated</span><strong>{digest.corroborationPct}%</strong></div>
            <div className="result-row"><span>Contradictions</span><strong>{digest.contradictions}</strong></div>
            <div className="result-row"><span>Upheld disputes</span><strong>{digest.upheldDisputes}</strong></div>
            <button className="dir-refresh" onClick={load} style={{ marginTop: 8 }}>↻ Recompute</button>
          </>
        )}
      </Card>

      <Card title="Allegations Against Me" tag="Respond in window"
        hint="An employer can allege that an asserted claim did not hold up. Answer inside the 14-day window; a regulator + observer then resolve it.">
        {allegations.length === 0 ? (
          <div className="empty"><div className="empty-ico"><Icon name="gavel" size={28} /></div>No allegations. Keep asserting only what holds up.</div>
        ) : (
          <div className="job-list">
            {allegations.map((a) => (
              <article key={a.id} className="applicant">
                <div className="job-head">
                  <div>
                    <div className="job-title">{a.id} · {a.claim}</div>
                    <div className="job-company">{a.detail}</div>
                  </div>
                  <Badge status={a.status === "open" ? "PENDING" : a.status.toUpperCase()} />
                </div>
                <div className="result-row"><span>Application</span><Copy value={a.applicationId} short /></div>
                <div className="result-row"><span>Window</span><strong>{inWindow(a) ? `${daysLeft(a)} day(s) left` : "closed"}</strong></div>
                {inWindow(a) ? (
                  <>
                    <textarea className="report-reason" rows={2} placeholder="Your counter-claim / evidence"
                      value={counter[a.id] || ""} onChange={(e) => setCounter((c) => ({ ...c, [a.id]: e.target.value }))} />
                    <div className="applicant-actions">
                      <Button onClick={() => respond(a)} busy={busy === a.id}>Respond</Button>
                    </div>
                  </>
                ) : (
                  <p className="hint" style={{ margin: "4px 0 0" }}>
                    {a.status === "responded" ? "Response filed — awaiting regulator + observer." : `Resolved: ${a.status}.`}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
