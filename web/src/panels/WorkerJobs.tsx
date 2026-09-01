import { useEffect, useState } from "react";
import { api, type WalletEntry } from "../api";
import { useStore } from "../store";
import { Card, Button, ErrorLine } from "../ui";

// Worker — browse open job postings and apply, attaching a skill certificate
// from the wallet. The company will verify that certificate before hiring.
export function WorkerJobs() {
  const { jobs, applications, applyToJob, identityDID, session, log, toast } = useStore();
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
    if (!credHash) return toast("error", "You have no certificate to present yet.");
    const created = applyToJob({ jobId, workerDID: myDID, workerName: myName, credHash });
    if (!created) return toast("info", "You already applied to this job.");
    const job = jobs.find((j) => j.id === jobId);
    log({ kind: "apply", actor: "Worker", title: `Applied to ${job?.title}`, detail: `${myName} → ${job?.company}`, ok: true });
    toast("success", `Application sent to ${job?.company}`);
  }

  return (
    <Card
      title="Open Jobs"
      tag="marketplace"
      hint="Apply with one of your certificates. The employer verifies it on-chain before making an offer."
    >
      <ErrorLine msg={err} />
      {creds.length === 0 && (
        <div className="banner" style={{ margin: "0 0 16px" }}>
          You have no certificates yet — a training center must certify a skill for your DID before you can apply.
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">🧳</div>
          No open jobs right now. Companies post openings from their portal.
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
                    <div className="job-company">🏢 {j.company} · 📍 {j.location}</div>
                  </div>
                  <div className="job-wage">{j.wage.toLocaleString()} <span>BDT</span></div>
                </div>
                <div className="job-tags">
                  <span className="claim"><span className="claim-k">skill</span><span className="claim-v">{j.skill}</span></span>
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
                          {c.schemaId} · {String(c.claims.trade ?? "")} · {c.credHash.slice(0, 8)}…
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
