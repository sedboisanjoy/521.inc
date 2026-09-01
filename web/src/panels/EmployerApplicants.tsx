import { useState } from "react";
import { api, type VerifyResult } from "../api";
import { useStore } from "../store";
import { Card, Button, Badge, Copy } from "../ui";
import type { Tab } from "../roles";

// Company — the hiring desk. For each applicant, verify their presented
// certificate on-chain (UC4) before accepting or rejecting them, then draft
// their employment contract (UC3).
export function EmployerApplicants({ goTo }: { goTo: (t: Tab) => void }) {
  const { jobs, applications, setApplication, setContractDraft, identityDID, log, toast } = useStore();
  const myDID = identityDID || "did:key:employer";
  const myJobIds = new Set(jobs.filter((j) => j.employerDID === myDID).map((j) => j.id));
  const inbox = applications.filter((a) => myJobIds.has(a.jobId));

  const [checks, setChecks] = useState<Record<string, VerifyResult>>({});
  const [busy, setBusy] = useState<string>("");

  async function verify(appId: string, credHash: string) {
    setBusy(appId);
    try {
      const r = await api.verify(credHash);
      setChecks((c) => ({ ...c, [appId]: r }));
      setApplication(appId, { verified: r.found && r.status === "ACTIVE" });
      log({ kind: "verify", actor: "Company", title: r.found ? `Verified applicant — ${r.status}` : "Applicant not on ledger", detail: credHash, ok: r.found });
      toast(r.found ? "success" : "error", r.found ? `Certificate ${r.status}` : "Certificate not found");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  function decide(appId: string, status: "accepted" | "rejected", who: string, job?: string) {
    setApplication(appId, { status });
    log({
      kind: status === "accepted" ? "hire" : "verify",
      actor: "Company",
      title: status === "accepted" ? `Hired ${who}` : `Rejected ${who}`,
      detail: job,
      ok: true,
    });
    toast(status === "accepted" ? "success" : "info", status === "accepted" ? `${who} hired` : `${who} rejected`);
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
    toast("info", "Contract prefilled — review and anchor it");
    goTo("econtracts");
  }

  return (
    <Card
      title="Applicants"
      tag="verify before hiring"
      hint="Each applicant presents a certificate. Verify it on-chain, then accept or reject — no forged papers get through."
    >
      {inbox.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">🧑‍💼</div>
          No applicants yet. Post a job and share it with workers.
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
                    <div className="job-company">applied for {job?.title}</div>
                  </div>
                  <span className={`badge ${a.status === "accepted" ? "active" : a.status === "rejected" ? "revoked" : "unknown"}`}>
                    {a.status}
                  </span>
                </div>
                <div className="result-row"><span>Worker DID</span><Copy value={a.workerDID} short /></div>
                <div className="result-row"><span>Certificate</span><Copy value={a.credHash} short /></div>

                {chk && (
                  chk.found ? (
                    <div className={`verdict ${chk.status === "ACTIVE" ? "verdict-ok" : "verdict-no"}`}>
                      <span className="verdict-ico">{chk.status === "ACTIVE" ? "✓" : "✕"}</span>
                      <div>
                        <div className="verdict-title">Certificate {chk.status}</div>
                        <div className="verdict-sub">
                          Issuer {chk.issuerDID} · standing {chk.issuerStanding}/100 · corroboration {chk.corroborationScore}
                        </div>
                      </div>
                      <Badge status={chk.status} />
                    </div>
                  ) : (
                    <div className="verdict verdict-no">
                      <span className="verdict-ico">✕</span>
                      <div>
                        <div className="verdict-title">Not on ledger</div>
                        <div className="verdict-sub">Do not trust this certificate.</div>
                      </div>
                    </div>
                  )
                )}

                <div className="applicant-actions">
                  <Button onClick={() => verify(a.id, a.credHash)} busy={busy === a.id} variant="ghost">Verify on-chain</Button>
                  <Button onClick={() => decide(a.id, "accepted", a.workerName, job?.title)} disabled={a.status === "accepted"}>Hire</Button>
                  <Button onClick={() => decide(a.id, "rejected", a.workerName, job?.title)} disabled={a.status === "rejected"} variant="danger">Reject</Button>
                  {a.status === "accepted" && (
                    <Button onClick={() => draftContract(a)} variant="ghost">Draft contract →</Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}
