import { useCallback, useEffect, useState } from "react";
import { api, type AppRecord, type VerifyResult, type AgencyDigest } from "../api";
import { useStore } from "../store";
import { Card, Button, Badge, Copy } from "../ui";
import { Icon } from "../icons";
import type { Tab } from "../roles";
import { subjectFromActivity } from "../flow";

// Employer portal — agency-mediated applications (§3.8). Every application is
// shown in two columns: ATTESTED (pointers to anchored credentials, auto-verified
// here — no agency risk) and ASSERTED (the agency's own word, where its standing
// is staked). The submitting agency's computed standing is shown so the employer
// can judge that word before committing. If an asserted claim does not hold up,
// the employer files an allegation — anchored as an allegation, not a finding.
export function EmployerAgencyApps({ goTo }: { goTo: (t: Tab) => void }) {
  const { identityDID, setContractDraft, log, toast, openFlow, autoFlow } = useStore();
  const myDID = identityDID || "did:key:employer";

  const [apps, setApps] = useState<AppRecord[]>([]);
  const [verifs, setVerifs] = useState<Record<string, VerifyResult>>({}); // credHash -> result
  const [digests, setDigests] = useState<Record<string, AgencyDigest>>({}); // agencyDID -> digest
  const [claimFor, setClaimFor] = useState<string>(""); // application id with the allege form open
  const [claimField, setClaimField] = useState<string>("");
  const [claimDetail, setClaimDetail] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const list = await api.applicationsByEmployer(myDID);
    setApps(list);
    // Auto-verify every attested ref (the left column carries no agency risk).
    const refs = new Set<string>();
    const agencies = new Set<string>();
    list.forEach((a) => { a.attestedRefs.forEach((r) => refs.add(r)); agencies.add(a.agencyDID); });
    const vs: Record<string, VerifyResult> = {};
    await Promise.all([...refs].map(async (h) => { try { vs[h] = await api.verify(h); } catch { /* skip */ } }));
    setVerifs(vs);
    const ds: Record<string, AgencyDigest> = {};
    await Promise.all([...agencies].map(async (d) => { try { ds[d] = await api.agencyDigest(d); } catch { /* skip */ } }));
    setDigests(ds);
  }, [myDID]);

  useEffect(() => { load(); }, [load]);

  async function hire(a: AppRecord) {
    setBusy(a.id);
    try {
      await api.hireApplication(a.id);
      setContractDraft({
        workerDID: a.workerDID, workerName: a.workerName,
        position: String(a.asserted.trade || "Worker"), salary: 0, currency: "BDT",
        employer: a.employer, jobId: a.orderRef,
      });
      const entry = log({ kind: "hire", actor: "Company", title: `Hire via ${a.agency}: ${a.workerName}`, detail: a.appHash, ok: true });
      toast("success", `${a.workerName} hired — contract details filled in`);
      if (autoFlow) openFlow(subjectFromActivity(entry));
      await load();
      goTo("econtracts");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function allege(a: AppRecord) {
    if (!claimField) return toast("error", "Choose which asserted claim you dispute.");
    setBusy(a.id);
    try {
      await api.allegeMismatch({ applicationId: a.id, claim: claimField, detail: claimDetail.trim() || `Asserted ${claimField} did not hold up on the job.` });
      const entry = log({ kind: "allege", actor: "Company", title: `Allege mismatch: ${a.agency} (${claimField})`, detail: a.id, ok: true });
      toast("success", "Allegation filed — anchored as an allegation, not a finding.");
      setClaimFor(""); setClaimField(""); setClaimDetail("");
      if (autoFlow) openFlow(subjectFromActivity(entry));
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const scoreTone = (n: number) => (n >= 70 ? "score-good" : n >= 40 ? "score-mid" : "score-bad");
  const assertedEntries = (a: AppRecord) => Object.entries(a.asserted).filter(([k]) => k !== "");

  return (
    <Card
      title="Agency Applications"
      tag="Attested vs Asserted"
      hint="Left column = proven against the ledger (no agency risk). Right column = the agency's own word, staked on its standing. Check the agency's standing before you trust the right column — and allege a mismatch if it does not hold up."
    >
      {apps.length === 0 ? (
        <div className="empty">
          <div className="empty-ico"><Icon name="users" size={28} /></div>
          No agency-mediated applications yet.
        </div>
      ) : (
        <div className="job-list">
          {apps.map((a) => {
            const dg = digests[a.agencyDID];
            return (
              <article key={a.id} className={`applicant ${a.contradiction ? "applicant-flagged" : ""}`}>
                <div className="job-head">
                  <div>
                    <div className="job-title">{a.workerName} <span className="mono" style={{ opacity: 0.6 }}>· {a.id}</span></div>
                    <div className="job-company">via {a.agency}</div>
                  </div>
                  <Badge status={a.status === "submitted" ? "APPLIED" : a.status.toUpperCase()} />
                </div>

                {/* Agency standing — the checkable answer before committing. */}
                {dg && (
                  <div className="agency-standing-line">
                    <span className="col-tag"><Icon name="agency" size={13} /> {a.agency}</span>
                    <span className={`standing-pill ${scoreTone(dg.score)}`}>standing {dg.score}/100</span>
                    <span className="hint">{dg.placements} placements · {dg.corroborationPct}% corroborated · {dg.upheldDisputes} upheld</span>
                  </div>
                )}

                {a.contradiction && (
                  <div className="verdict verdict-no">
                    <span className="verdict-ico">✕</span>
                    <div>
                      <div className="verdict-title">Automatic contradiction</div>
                      <div className="verdict-sub">{a.contradictionNote}</div>
                    </div>
                  </div>
                )}

                <div className="split-cols">
                  <div className="split-col split-col-attested">
                    <div className="col-tag col-tag-attested"><Icon name="check" size={14} /> Attested — proven, no agency risk</div>
                    {a.attestedRefs.length === 0 ? (
                      <span className="field-hint">No attested credentials.</span>
                    ) : a.attestedRefs.map((h) => {
                      const v = verifs[h];
                      const ok = v?.found && v.status === "ACTIVE";
                      return (
                        <div key={h} className={`attref ${ok ? "attref-ok" : "attref-no"}`}>
                          <span className="attref-ico">{ok ? "✓" : "✕"}</span>
                          <span className="attref-main">
                            <span>{v?.schemaId || "credential"}</span>
                            <Copy value={h} short />
                          </span>
                          {v && <Badge status={v.status} />}
                        </div>
                      );
                    })}
                  </div>

                  <div className="split-col split-col-asserted">
                    <div className="col-tag col-tag-asserted"><Icon name="pen" size={14} /> Asserted — agency's word, standing staked</div>
                    {assertedEntries(a).map(([k, val]) => (
                      <div key={k} className="result-row">
                        <span>{k}</span>
                        <strong>{typeof val === "boolean" ? (val ? "yes" : "no") : String(val)}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="applicant-actions">
                  <Button onClick={() => hire(a)} busy={busy === a.id} disabled={a.status === "hired"}>
                    {a.status === "hired" ? "Hired" : "Hire → Contract"}
                  </Button>
                  <Button variant="danger" onClick={() => { setClaimFor(claimFor === a.id ? "" : a.id); setClaimField(""); setClaimDetail(""); }}>
                    <Icon name="gavel" size={16} /> Allege mismatch
                  </Button>
                </div>

                {claimFor === a.id && (
                  <div className="report-form">
                    <div className="report-form-title">Allege a mismatch (tier-3)</div>
                    <p className="hint" style={{ margin: "0 0 8px" }}>
                      This anchors as an allegation, not a finding. The agency gets a 14-day window; a regulator + observer then resolve it.
                    </p>
                    <select value={claimField} onChange={(e) => setClaimField(e.target.value)} style={{ marginBottom: 8 }}>
                      <option value="">— Which asserted claim? —</option>
                      {assertedEntries(a).map(([k]) => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <textarea className="report-reason" rows={2} placeholder="What did not hold up?" value={claimDetail} onChange={(e) => setClaimDetail(e.target.value)} />
                    <div className="applicant-actions">
                      <Button variant="danger" onClick={() => allege(a)} busy={busy === a.id}>File allegation</Button>
                      <Button variant="ghost" onClick={() => setClaimFor("")}>Cancel</Button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}
