import { useState } from "react";
import { api, type VerifyResult } from "../api";
import { useStore } from "../store";
import { Card, Button, Badge, Copy } from "../ui";
import { Icon } from "../icons";
import type { Tab } from "../roles";
import { subjectFromActivity } from "../flow";

// Company — the hiring desk. For each applicant, verify their presented
// certificate on-chain (UC4) before accepting or rejecting them, then draft
// their employment contract (UC3).
export function EmployerApplicants({ goTo }: { goTo: (t: Tab) => void }) {
  const { jobs, applications, setApplication, setContractDraft, fileReport, identityDID, log, toast, openFlow, autoFlow } = useStore();
  const myDID = identityDID || "did:key:employer";
  const myJobIds = new Set(jobs.filter((j) => j.employerDID === myDID).map((j) => j.id));
  const inbox = applications.filter((a) => myJobIds.has(a.jobId));

  const [checks, setChecks] = useState<Record<string, VerifyResult>>({});
  const [busy, setBusy] = useState<string>("");
  const [reportFor, setReportFor] = useState<string>("");
  const [reason, setReason] = useState("The worker is not skilled enough compared to the skill level stated on the certificate.");
  const [busyReport, setBusyReport] = useState(false);

  async function submitReport(a: (typeof inbox)[number]) {
    if (!reason.trim()) return toast("error", "Enter a reason for the complaint.");
    setBusyReport(true);
    try {
      // Find which training center issued the presented certificate.
      const v = await api.verify(a.credHash);
      const issuerDID = v.issuerDID || "unknown";
      const job = jobs.find((j) => j.id === a.jobId);
      fileReport({
        credHash: a.credHash,
        workerName: a.workerName,
        workerDID: a.workerDID,
        issuerDID,
        company: job?.company || "Company",
        reason: reason.trim(),
      });
      const entry = log({ kind: "report", actor: "Company", title: `Complaint: ${a.workerName} incompetent`, detail: issuerDID, ok: true });
      toast("success", "Complaint sent to BMET");
      setReportFor("");
      if (autoFlow) openFlow(subjectFromActivity(entry));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusyReport(false);
    }
  }

  async function verify(appId: string, credHash: string) {
    setBusy(appId);
    try {
      const r = await api.verify(credHash);
      setChecks((c) => ({ ...c, [appId]: r }));
      setApplication(appId, { verified: r.found && r.status === "ACTIVE" });
      const entry = log({ kind: "verify", actor: "Company", title: r.found ? `Verify — ${r.status}` : "Certificate not on blockchain", detail: credHash, ok: r.found });
      toast(r.found ? "success" : "error", r.found ? `Certificate: ${r.status}` : "Certificate not found");
      if (autoFlow) openFlow(subjectFromActivity(entry));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  function decide(appId: string, status: "accepted" | "rejected", who: string, job?: string) {
    setApplication(appId, { status });
    const entry = log({
      kind: status === "accepted" ? "hire" : "verify",
      actor: "Company",
      title: status === "accepted" ? `Hire: ${who}` : `Reject: ${who}`,
      detail: job,
      ok: true,
    });
    toast(status === "accepted" ? "success" : "info", status === "accepted" ? `${who} has been hired` : `${who} has been rejected`);
    if (autoFlow && status === "accepted") openFlow(subjectFromActivity(entry));
  }

  function draftContract(a: (typeof inbox)[number]) {
    const job = jobs.find((j) => j.id === a.jobId);
    setContractDraft({
      workerDID: a.workerDID,
      workerName: a.workerName,
      position: job?.title || "Worker",
      salary: job?.wage || 0,
      currency: "BDT",
      employer: job?.company || "Company",
      jobId: a.jobId,
    });
    toast("info", "Contract details filled in — review and save");
    goTo("econtracts");
  }

  return (
    <Card
      title="Applicants"
      tag="Verify Before Hiring"
      hint="Each applicant presents a certificate. Verify it on the blockchain, then hire or reject — no forged document gets through."
    >
      {inbox.length === 0 ? (
        <div className="empty">
          <div className="empty-ico"><Icon name="users" size={28} /></div>
          No applicants yet. Post a job to let workers know.
        </div>
      ) : (
        <div className="job-list">
          {inbox.map((a) => {
            const job = jobs.find((j) => j.id === a.jobId);
            const chk = checks[a.id];
            return (
              <article key={a.id} className="applicant">
                <div className="job-head">
                  <div>
                    <div className="job-title">{a.workerName}</div>
                    <div className="job-company">Applied for: {job?.title}</div>
                  </div>
                  <Badge status={a.status} />
                </div>
                <div className="result-row"><span>Worker ID</span><Copy value={a.workerDID} short /></div>
                <div className="result-row"><span>Certificate</span><Copy value={a.credHash} short /></div>

                {chk && (
                  chk.found ? (
                    <div className={`verdict ${chk.status === "ACTIVE" ? "verdict-ok" : "verdict-no"}`}>
                      <span className="verdict-ico">{chk.status === "ACTIVE" ? "✓" : "✕"}</span>
                      <div>
                        <div className="verdict-title">Certificate <Badge status={chk.status} /></div>
                        <div className="verdict-sub">
                          Issuer Trust {chk.issuerStanding}/100 · Corroboration {chk.corroborationScore}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="verdict verdict-no">
                      <span className="verdict-ico">✕</span>
                      <div>
                        <div className="verdict-title">Not on blockchain</div>
                        <div className="verdict-sub">Do not trust this certificate.</div>
                      </div>
                    </div>
                  )
                )}

                <div className="applicant-actions">
                  <Button onClick={() => verify(a.id, a.credHash)} busy={busy === a.id} variant="ghost">Verify Certificate</Button>
                  <Button onClick={() => decide(a.id, "accepted", a.workerName, job?.title)} disabled={a.status === "accepted"}>Hire</Button>
                  <Button onClick={() => decide(a.id, "rejected", a.workerName, job?.title)} disabled={a.status === "rejected"} variant="danger">Reject</Button>
                  {a.status === "accepted" && (
                    <Button onClick={() => draftContract(a)} variant="ghost">Create Contract →</Button>
                  )}
                  {a.status === "accepted" && (
                    <Button onClick={() => setReportFor(reportFor === a.id ? "" : a.id)} variant="danger"><Icon name="alert" size={16} /> Report as Incompetent</Button>
                  )}
                </div>

                {reportFor === a.id && (
                  <div className="report-form">
                    <div className="report-form-title">File a Complaint with BMET</div>
                    <p className="hint" style={{ margin: "0 0 8px" }}>
                      The worker's skill does not match the certificate — enter a reason. Based on this, BMET will reduce the training center's weight.
                    </p>
                    <textarea
                      className="report-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                    />
                    <div className="applicant-actions">
                      <Button onClick={() => submitReport(a)} busy={busyReport} variant="danger">Send Complaint</Button>
                      <Button onClick={() => setReportFor("")} variant="ghost">Cancel</Button>
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
