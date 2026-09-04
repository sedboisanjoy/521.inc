import { useState, useEffect } from "react";
import { api, type Digest } from "../api";
import { useStore } from "../store";
import { Card, Field, Button, Copy, ErrorLine } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

interface Reviewable {
  companyDID: string;
  company: string;
}

const VIOLATIONS = ["none", "wage", "contract", "overtime", "safety", "termination"];

// Worker — write a verified-anonymous review of an employer you hold an
// Employment Proof for. A deterministic nullifier keeps it one voice per
// employer, while the review itself stays unlinkable to your identity.
export function WorkerReviews() {
  const { identityDID, session, log, toast, openFlow, autoFlow } = useStore();
  const myDID = identityDID || session.did || "";

  const [employers, setEmployers] = useState<Reviewable[]>([]);
  const [companyDID, setCompanyDID] = useState("");
  const [rating, setRating] = useState("5");
  const [recommend, setRecommend] = useState("Yes");
  const [violation, setViolation] = useState("none");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [nullifier, setNullifier] = useState("");
  const [digest, setDigest] = useState<Digest | null>(null);
  const [escalation, setEscalation] = useState<{ escalated: boolean; reason: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const wallet = await api.wallet(myDID);
        const seen = new Set<string>();
        const list: Reviewable[] = [];
        for (const e of wallet) {
          if (e.schemaId !== "EmploymentProof") continue;
          const cDID = String(e.claims.employerDID);
          if (seen.has(cDID)) continue;
          seen.add(cDID);
          list.push({ companyDID: cDID, company: String(e.claims.employer ?? "Employer") });
        }
        setEmployers(list);
        if (list.length && !companyDID) setCompanyDID(list[0].companyDID);
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [myDID]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    const emp = employers.find((x) => x.companyDID === companyDID);
    if (!emp) return toast("error", "Choose an employer to review.");
    setBusy(true);
    setErr("");
    setNullifier("");
    setDigest(null);
    setEscalation(null);
    try {
      const linkSecret = `${myDID}:${companyDID}`;
      const violationCode = violation === "none" ? "" : violation;
      const r = await api.submitReview({
        companyDID,
        company: emp.company,
        workerDID: myDID,
        linkSecret,
        rating: Number(rating),
        recommend: recommend === "Yes",
        violationCode,
        text,
      });
      setNullifier(r.nullifier);
      if (violationCode) setEscalation({ escalated: r.escalated, reason: r.reason });
      const entry = log({
        kind: violationCode ? "violation" : "review",
        actor: "Worker",
        title: violationCode
          ? (r.escalated ? `Escalated ${violationCode} → Ministry` : `Flagged ${violationCode} (held, not escalated)`)
          : `Reviewed ${emp.company}`,
        detail: r.reviewHash,
        ok: true,
      });
      if (violationCode && !r.escalated) {
        toast("info", "Review recorded — the flag did not meet the escalation policy, so it was not routed to the Ministry.");
      } else if (violationCode) {
        toast("success", "Review recorded — the flag met the policy and was escalated to the Ministry.");
      } else {
        toast("success", "Your verified review was recorded.");
      }
      if (autoFlow) openFlow(subjectFromActivity(entry));
      try {
        const d = await api.companyDigest(companyDID);
        setDigest(d);
      } catch {
        // digest is best-effort
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (/409|duplicate|already/i.test(msg)) {
        toast("error", "You have already reviewed this employer.");
      } else {
        toast("error", msg);
      }
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Review an Employer"
      tag="Verified & Anonymous"
      hint="Hold an Employment Proof from an employer, and you get one verified voice about them. Your review is unlinkable to you, but a hidden nullifier stops anyone reviewing the same employer twice."
    >
      {employers.length === 0 ? (
        <div className="empty">
          <div className="empty-ico"><Icon name="review" size={28} /></div>
          You can review an employer once they have issued you an Employment Proof.
        </div>
      ) : (
        <>
          <Field label="Employer">
            <select value={companyDID} onChange={(e) => setCompanyDID(e.target.value)}>
              {employers.map((emp) => (
                <option key={emp.companyDID} value={emp.companyDID}>{emp.company}</option>
              ))}
            </select>
          </Field>

          <Field label="Rating (1–5)">
            <input type="number" min={1} max={5} value={rating} onChange={(e) => setRating(e.target.value)} />
          </Field>

          <Field label="Would you recommend this employer?">
            <select value={recommend} onChange={(e) => setRecommend(e.target.value)}>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </Field>

          <Field label="Labour-law violation" hint="A flag is checked before it escalates: wage claims against the bank-rail payroll, others against corroboration by other verified workers. One click alone does not reach the Ministry.">
            <select value={violation} onChange={(e) => setViolation(e.target.value)}>
              {VIOLATIONS.map((v) => (
                <option key={v} value={v}>{v === "none" ? "None" : v.charAt(0).toUpperCase() + v.slice(1)}</option>
              ))}
            </select>
          </Field>

          <Field label="Your review">
            <textarea
              className="report-reason"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Describe your experience working for this employer."
            />
          </Field>

          <ErrorLine msg={err} />

          <div className="applicant-actions">
            <Button onClick={submit} busy={busy}>Submit Verified Review</Button>
          </div>

          {nullifier && (
            <div className="verdict verdict-ok" style={{ marginTop: 16 }}>
              <span className="verdict-ico">✓</span>
              <div>
                <div className="verdict-title">Nullifier <Copy value={nullifier} short /></div>
                <div className="verdict-sub">One verified voice per employer — a second review is rejected.</div>
              </div>
            </div>
          )}

          {escalation && (
            <div className={`verdict ${escalation.escalated ? "verdict-no" : "verdict-ok"}`} style={{ marginTop: 12 }}>
              <span className="verdict-ico">{escalation.escalated ? "!" : "✓"}</span>
              <div>
                <div className="verdict-title">{escalation.escalated ? "Escalated to the Ministry" : "Not escalated"}</div>
                <div className="verdict-sub">{escalation.reason}</div>
              </div>
            </div>
          )}

          {digest && (
            <div className="report-form" style={{ marginTop: 16 }}>
              <div className="report-form-title">Employer transparency digest</div>
              <div className="result-row"><span>Reviewers</span><strong>{digest.reviewers}</strong></div>
              <div className="result-row"><span>Recommend</span><strong>{digest.recommendPct}%</strong></div>
              <div className="result-row"><span>Open conduct signals</span><strong>{digest.openConduct}</strong></div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
