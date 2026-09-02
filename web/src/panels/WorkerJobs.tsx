import { useEffect, useState } from "react";
import { api, type WalletEntry } from "../api";
import { useStore } from "../store";
import { Card, Button, ErrorLine } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// Worker — browse open job postings and apply, attaching a skill certificate
// from the wallet. The company will verify that certificate before hiring.
export function WorkerJobs() {
  const { jobs, applications, applyToJob, identityDID, session, log, toast, openFlow, autoFlow } = useStore();
  const myDID = identityDID || session.did || "";
  const myName = session.workerName || "Worker";

  const [creds, setCreds] = useState<WalletEntry[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setCreds(await api.wallet(myDID));
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [myDID]);

  const appliedJobIds = new Set(applications.filter((a) => a.workerDID === myDID).map((a) => a.jobId));

  function apply(jobId: string) {
    const credHash = picks[jobId] || creds[0]?.credHash;
    if (!credHash) return toast("error", "You don't have any certificate yet.");
    const created = applyToJob({ jobId, workerDID: myDID, workerName: myName, credHash });
    if (!created) return toast("info", "You have already applied to this job.");
    const job = jobs.find((j) => j.id === jobId);
    const entry = log({ kind: "apply", actor: "Worker", title: `Application: ${job?.title}`, detail: `${myName} → ${job?.company}`, ok: true });
    toast("success", `Application sent to ${job?.company}`);
    if (autoFlow) openFlow(subjectFromActivity(entry));
  }

  return (
    <Card
      title="Open Jobs"
      tag="Job Marketplace"
      hint="Apply using one of your certificates. The company will verify it on the blockchain before hiring."
    >
      <ErrorLine msg={err} />
      {creds.length === 0 && (
        <div className="banner" style={{ margin: "0 0 16px" }}>
          You don't have any certificate yet — before applying, a training center must issue you a skill certificate.
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="empty">
          <div className="empty-ico"><Icon name="briefcase" size={28} /></div>
          There are no open jobs right now. Companies post job openings from their portal.
        </div>
      ) : (
        <div className="job-list">
          {jobs.map((j) => {
            const applied = appliedJobIds.has(j.id);
            return (
              <article key={j.id} className="job">
                <div className="job-head">
                  <div>
                    <div className="job-title">{j.title}</div>
                    <div className="job-company">{j.company} · {j.location}</div>
                  </div>
                  <div className="job-wage">{j.wage.toLocaleString()} <span>BDT</span></div>
                </div>
                <div className="job-tags">
                  <span className="claim"><span className="claim-k">Skill</span><span className="claim-v">{j.skill}</span></span>
                </div>
                {applied ? (
                  <div className="job-applied">✓ Applied</div>
                ) : (
                  <div className="job-apply">
                    <select
                      value={picks[j.id] || creds[0]?.credHash || ""}
                      onChange={(e) => setPicks((p) => ({ ...p, [j.id]: e.target.value }))}
                      disabled={creds.length === 0}
                    >
                      {creds.map((c) => (
                        <option key={c.credHash} value={c.credHash}>
                          {String(c.claims.trade ?? "")} · {c.credHash.slice(0, 8)}…
                        </option>
                      ))}
                    </select>
                    <Button onClick={() => apply(j.id)} disabled={creds.length === 0}>Apply</Button>
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
