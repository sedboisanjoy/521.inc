import { useMemo } from "react";
import { useStore, type ActivityKind } from "../store";

const KIND_META: Record<ActivityKind, { icon: string; label: string }> = {
  register: { icon: "🪪", label: "Worker registered" },
  issue: { icon: "📜", label: "Credential issued" },
  verify: { icon: "🔍", label: "Anchor verified" },
  revoke: { icon: "⛔", label: "Credential revoked" },
  disclose: { icon: "🕶", label: "Selective disclosure" },
  corroborate: { icon: "🤝", label: "Corroboration" },
  standing: { icon: "📊", label: "Trust score updated" },
  post: { icon: "📋", label: "Job posted" },
  apply: { icon: "📨", label: "Job application" },
  hire: { icon: "🎉", label: "Worker hired" },
  contract: { icon: "📄", label: "Contract drafted" },
  sign: { icon: "✍️", label: "Worker signed contract" },
  approve: { icon: "🤝", label: "Contract approved" },
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// BMET's regulator overview — a read-only window on everything happening across
// the network, plus quick access to governance.
export function Dashboard({ goToGovernance }: { goToGovernance: () => void }) {
  const { activity } = useStore();

  const stats = useMemo(() => {
    const count = (k: ActivityKind) => activity.filter((a) => a.kind === k && a.ok).length;
    return {
      workers: count("register"),
      issued: count("issue"),
      verified: count("verify"),
      revoked: count("revoke"),
    };
  }, [activity]);

  return (
    <>
      <div className="stat-grid">
        <Stat label="Workers registered" value={stats.workers} icon="🪪" />
        <Stat label="Credentials issued" value={stats.issued} icon="📜" />
        <Stat label="Verifications" value={stats.verified} icon="🔍" />
        <Stat label="Revocations" value={stats.revoked} icon="⛔" tone="danger" />
      </div>

      <div className="dash-cols">
        <section className="card">
          <div className="card-head">
            <h2>Credential lifecycle</h2>
            <span className="tag">7 use cases</span>
          </div>
          <p className="hint">
            As regulator, BMET observes the whole flow but only acts at governance points.
          </p>
          <ol className="steps steps-static">
            <li><span className="step-n">1</span><div><div className="step-title">Training center registers a worker</div><div className="step-body">A DID is minted; PII stays off-chain.</div></div></li>
            <li><span className="step-n">2</span><div><div className="step-title">Skill / wage credential is issued</div><div className="step-body">Only a salted hash is anchored.</div></div></li>
            <li><span className="step-n">3</span><div><div className="step-title">Employer verifies & workers disclose</div><div className="step-body">Claims proven without revealing values.</div></div></li>
            <li><span className="step-n">4</span><div><div className="step-title">BMET governs trust & revokes fraud</div><div className="step-body">Reputation derived from ledger events.</div></div></li>
          </ol>
          <button className="btn btn-primary" onClick={goToGovernance}>Open Governance →</button>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Network activity</h2>
            <span className="tag">{activity.length} events</span>
          </div>
          {activity.length === 0 ? (
            <div className="empty">
              <div className="empty-ico">🗒</div>
              No activity yet this session — events from every portal will stream in here.
            </div>
          ) : (
            <ul className="feed">
              {activity.map((a) => (
                <li key={a.id} className={a.ok ? "" : "feed-err"}>
                  <span className="feed-ico">{KIND_META[a.kind].icon}</span>
                  <div className="feed-body">
                    <div className="feed-title">
                      {a.title}
                      {!a.ok && <span className="feed-fail">failed</span>}
                    </div>
                    <div className="feed-detail">
                      <span className="feed-actor">{a.actor}</span>
                      {a.detail && <span className="mono"> · {a.detail}</span>}
                    </div>
                  </div>
                  <span className="feed-time">{timeAgo(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: string; tone?: "danger" }) {
  return (
    <div className={`stat ${tone === "danger" && value > 0 ? "stat-danger" : ""}`}>
      <div className="stat-ico">{icon}</div>
      <div className="stat-val">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
