import { useStore } from "../store";
import { Card, Copy } from "../ui";

const STATUS_LABEL: Record<string, string> = { applied: "Under review", accepted: "Hired 🎉", rejected: "Not selected" };

// Worker — track the status of every job application.
export function WorkerApplications() {
  const { applications, jobs, identityDID, session } = useStore();
  const myDID = identityDID || session.did || "";
  const mine = applications.filter((a) => a.workerDID === myDID);

  return (
    <Card title="My Applications" tag="status tracker" hint="Every job you've applied to and where it stands.">
      {mine.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">📭</div>
          You haven't applied to any jobs yet — head to “Find Jobs”.
        </div>
      ) : (
        <div className="job-list">
          {mine.map((a) => {
            const job = jobs.find((j) => j.id === a.jobId);
            const cls = a.status === "accepted" ? "active" : a.status === "rejected" ? "revoked" : "unknown";
            return (
              <article key={a.id} className="job">
                <div className="job-head">
                  <div>
                    <div className="job-title">{job?.title || "Job removed"}</div>
                    <div className="job-company">🏢 {job?.company} · 📍 {job?.location}</div>
                  </div>
                  <span className={`badge ${cls}`}>{STATUS_LABEL[a.status]}</span>
                </div>
                <div className="result-row">
                  <span>Presented certificate</span>
                  <Copy value={a.credHash} short />
                </div>
                {a.verified !== undefined && (
                  <div className="result-row">
                    <span>Employer check</span>
                    <strong className={a.verified ? "result-ok" : "danger-text"}>
                      {a.verified ? "Verified on-chain ✓" : "Failed verification ✕"}
                    </strong>
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
