import { useState, useEffect } from "react";
import { api, type Violation } from "../api";
import { useStore } from "../store";
import { Card, Button, Badge, Copy } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// Outcome → trust-score delta applied to the EMPLOYER on inspection. A worker is
// never penalised for a good-faith complaint (ILO / UNGP-31 grievance-mechanism
// protection): "Not substantiated" carries no penalty for anyone, and only a
// distinct "Fabricated" finding flags the orchestrator to the regulator — never
// the (possibly coerced) complainant.
const DELTA: Record<string, number> = {
  Fined: -20,
  Warned: -8,
  "Not substantiated": 0,
  "Fabricated (bad faith)": 0,
};
const OUTCOMES = Object.keys(DELTA);

// Ministry — act on labour-law violation signals routed from worker reviews.
// New signals stream in automatically; each inspection adjusts the employer's
// on-chain conduct score.
export function MinistryEnforcement() {
  const { log, toast, openFlow, autoFlow } = useStore();

  const [open, setOpen] = useState<Violation[]>([]);
  const [resolved, setResolved] = useState<Violation[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  async function reload() {
    try {
      const [o, r] = await Promise.all([
        api.listViolations("open"),
        api.listViolations("resolved"),
      ]);
      setOpen(o);
      setResolved(r);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  useEffect(() => {
    reload();
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function inspect(v: Violation) {
    const outcome = outcomes[v.id] || "Not substantiated";
    setBusy(v.id);
    try {
      const r = await api.recordInspection({
        violationId: v.id,
        companyDID: v.companyDID,
        outcome,
        delta: DELTA[outcome] ?? 0,
      });
      const entry = log({
        kind: "inspection",
        actor: "Ministry",
        title: `${outcome}: ${v.company} (${v.code})`,
        detail: r.inspectionHash,
        ok: true,
      });
      toast("success", `Inspection recorded — ${v.company} conduct score is now ${r.score}.`);
      if (autoFlow) openFlow(subjectFromActivity(entry));
      await reload();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <Card
      title="Labour Enforcement"
      tag="Corroborated signals only"
      hint="Only signals that pass the escalation policy reach this queue — wage claims contradicted by the bank rail bounce, and opinion-based claims need corroboration by multiple verified workers. The platform supplies evidence; you adjudicate. Good-faith complainants are never penalised."
    >
      {open.length === 0 && resolved.length === 0 && (
        <div className="empty">
          <div className="empty-ico"><Icon name="gavel" size={28} /></div>
          No violation signals. Worker reviews that flag a violation appear here automatically.
        </div>
      )}

      {open.length > 0 && (
        <div className="job-list">
          {open.map((v) => (
            <article key={v.id} className="report-card">
              <div className="job-head">
                <div>
                  <div className="job-title">{v.company}</div>
                  <div className="job-company">Reported: {new Date(v.at).toLocaleString()}</div>
                </div>
                <Badge status={v.code} />
              </div>
              <div className="result-row"><span>Company</span><Copy value={v.companyDID} short /></div>
              <div className="result-row"><span>Review</span><Copy value={v.reviewHash} short /></div>
              {v.escalationReason && (
                <div className="escalation-why">
                  <span className="col-tag"><Icon name="info" size={13} /> Why this escalated</span>
                  <span>{v.escalationReason}</span>
                </div>
              )}
              <p className="hint" style={{ margin: "2px 0 6px" }}>
                Investigate under your own authority. A good-faith complaint that isn't substantiated carries <strong>no penalty for the worker</strong>.
              </p>
              <div className="applicant-actions">
                <select
                  value={outcomes[v.id] || "Not substantiated"}
                  onChange={(e) => setOutcomes((o) => ({ ...o, [v.id]: e.target.value }))}
                >
                  {OUTCOMES.map((o) => (
                    <option key={o} value={o}>{o}{DELTA[o] !== 0 ? ` (${DELTA[o]})` : ""}</option>
                  ))}
                </select>
                <Button onClick={() => inspect(v)} busy={busy === v.id} variant="danger">Record Inspection</Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <>
          <div className="card-head" style={{ marginTop: 20 }}>
            <h2>Resolved</h2>
            <span className="tag">{resolved.length}</span>
          </div>
          <div className="job-list">
            {resolved.map((v) => (
              <article key={v.id} className="report-card resolved">
                <div className="job-head">
                  <div>
                    <div className="job-title">{v.company}</div>
                    <div className="job-company">{v.code}{v.outcome ? ` — ${v.outcome}` : ""}</div>
                  </div>
                  <Badge status="resolved" />
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
