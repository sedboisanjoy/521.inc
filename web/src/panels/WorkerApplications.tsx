import { useStore } from "../store";
import { Card, Copy } from "../ui";
import { Icon } from "../icons";

const STATUS_LABEL: Record<string, string> = { applied: "Under Verification", accepted: "Hired", rejected: "Not Selected" };

// Worker — track the status of every job application.
export function WorkerApplications() {
  const { applications, jobs, identityDID, session } = useStore();
  const myDID = identityDID || session.did || "";
  const mine = applications.filter((a) => a.workerDID === myDID);

  return (
    <Card title="My Applications" tag="Status" hint="The jobs you have applied to and their current status.">
      {mine.length === 0 ? (
        <div className="empty">
          <div className="empty-ico"><Icon name="inbox" size={28} /></div>
          You haven't applied to any jobs yet — go to the “Find Jobs” page.
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
                    <div className="job-title">{job?.title || "Job Removed"}</div>
                    <div className="job-company">{job?.company} · {job?.location}</div>
                  </div>
                  <span className={`badge ${cls}`}>{STATUS_LABEL[a.status]}</span>
                </div>
                <div className="result-row">
                  <span>Certificate Submitted</span>
                  <Copy value={a.credHash} short />
                </div>
                {a.verified !== undefined && (
                  <div className="result-row">
                    <span>Company Verification</span>
                    <strong className={a.verified ? "result-ok" : "danger-text"}>
                      {a.verified ? "Verified ✓" : "Verification Failed ✕"}
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
