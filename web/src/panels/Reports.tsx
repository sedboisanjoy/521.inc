import { useEffect, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { Card, Button, Copy } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

const PENALTY = -15; // weight drop per upheld complaint (whitepaper §7.4)

// BMET — review company complaints that a hired worker wasn't as competent as
// the certificate claimed, and lower the issuing training center's trust weight.
export function Reports() {
  const { reports, setReport, log, toast, openFlow, autoFlow } = useStore();
  const actor = "BMET";
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState("");

  const open = reports.filter((r) => r.status === "open");
  const resolved = reports.filter((r) => r.status === "resolved");

  // Load the current trust weight for every training center named in a report.
  async function loadWeights() {
    const dids = Array.from(new Set(reports.map((r) => r.issuerDID)));
    const out: Record<string, number> = {};
    await Promise.all(
      dids.map(async (d) => {
        try {
          out[d] = (await api.getStanding(d)).score;
        } catch {
          out[d] = 0;
        }
      })
    );
    setWeights(out);
  }
  useEffect(() => {
    loadWeights();
  }, [reports.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function penalise(id: string, issuerDID: string) {
    setBusy(id);
    try {
      const r = await api.updateStanding({ agencyDID: issuerDID, delta: PENALTY, evidenceHash: "report-" + id });
      setReport(id, { status: "resolved" });
      setWeights((w) => ({ ...w, [issuerDID]: r.score }));
      const entry = log({ kind: "standing", actor, title: `Complaint weight ${PENALTY} → ${r.score}/100`, detail: issuerDID, ok: true });
      toast("success", `Training center's weight is now ${r.score}/100`);
      if (autoFlow) openFlow(subjectFromActivity(entry));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  function dismiss(id: string) {
    setReport(id, { status: "resolved" });
    toast("info", "Complaint closed (no action taken)");
  }

  return (
    <Card
      title="Company Complaints"
      tag="Against training centers"
      hint="A company reported that a worker isn't as skilled as their certificate claims. Verify the complaint and lower the training center's trust weight — so everyone trusts it less in the future."
    >
      {open.length === 0 && resolved.length === 0 && (
        <div className="empty">
          <div className="empty-ico"><Icon name="check" size={28} /></div>
          No complaints.
        </div>
      )}

      {open.length > 0 && (
        <div className="job-list">
          {open.map((r) => (
            <article key={r.id} className="report-card">
              <div className="job-head">
                <div>
                  <div className="job-title">{r.workerName} — not competent</div>
                  <div className="job-company">Reported by {r.company}</div>
                </div>
                <span className="badge unknown">Open</span>
              </div>
              <p className="report-reason-text">“{r.reason}”</p>
              <div className="result-row">
                <span>Training Center</span>
                <Copy value={r.issuerDID} short />
              </div>
              <div className="result-row">
                <span>Current weight</span>
                <strong>{weights[r.issuerDID] ?? "…"}/100</strong>
              </div>
              <div className="applicant-actions">
                <Button onClick={() => penalise(r.id, r.issuerDID)} busy={busy === r.id} variant="danger">
                  Lower weight ({PENALTY})
                </Button>
                <Button onClick={() => dismiss(r.id)} variant="ghost">Close without action</Button>
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
            {resolved.map((r) => (
              <article key={r.id} className="report-card resolved">
                <div className="job-head">
                  <div>
                    <div className="job-title">{r.workerName}</div>
                    <div className="job-company">{r.company}</div>
                  </div>
                  <span className="badge active">Resolved</span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
