import { useEffect, useMemo, useState } from "react";
import { api, type WorkerDir, type OrgDir } from "../api";
import { useStore, type ActivityKind } from "../store";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";
import { Panel } from "../arwes";

const KIND_ICON: Record<ActivityKind, string> = {
  register: "userPlus", issue: "certificate", verify: "search", revoke: "ban",
  disclose: "eyeOff", corroborate: "check", standing: "chart", post: "clipboard",
  apply: "inbox", hire: "check", contract: "document", sign: "pen", approve: "check",
  report: "alert",
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// BMET regulator overview — reads real registered workers + participants from
// the backend, plus a live activity feed.
export function Dashboard({ goToGovernance }: { goToGovernance: () => void }) {
  const { activity, openFlow } = useStore();
  const [workers, setWorkers] = useState<WorkerDir[]>([]);
  const [orgs, setOrgs] = useState<OrgDir[]>([]);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      const [w, o] = await Promise.all([api.listWorkers(), api.listOrgs()]);
      setWorkers(w);
      setOrgs(o);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    const iv = setInterval(load, 5000); // keep the registry fresh
    return () => clearInterval(iv);
  }, []);

  const ttcCount = orgs.filter((o) => o.type === "ttc").length;
  const companyCount = orgs.filter((o) => o.type === "company").length;
  const issued = useMemo(() => activity.filter((a) => a.kind === "issue" && a.ok).length, [activity]);

  return (
    <>
      <div className="stat-grid">
        <Stat label="Registered Workers" value={workers.length} icon="worker" />
        <Stat label="Training Centers" value={ttcCount} icon="school" />
        <Stat label="Companies" value={companyCount} icon="building" />
        <Stat label="Certificates Issued" value={issued} icon="certificate" />
      </div>

      <div className="dash-cols">
        <Panel className="card">
          <div className="card-head">
            <h2>Participating Organizations</h2>
            <span className="tag">{orgs.length}</span>
          </div>
          {orgs.length === 0 ? (
            <div className="empty">
              <div className="empty-ico"><Icon name="building" size={28} /></div>
              No training centers or companies have registered yet.
            </div>
          ) : (
            <div className="party-list">
              {orgs.map((o) => (
                <div key={o.did} className="party">
                  <span className="party-ico"><Icon name={o.type === "ttc" ? "school" : "building"} size={20} /></span>
                  <div className="party-body">
                    <div className="party-name">{o.name} <span className="dir-id">{o.orgId}</span></div>
                    <div className="party-did mono">{o.did}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card-head" style={{ marginTop: 18 }}>
            <h2>Registered Workers</h2>
            <span className="tag">{workers.length}</span>
          </div>
          {err && <div className="err">⚠ {err}</div>}
          {workers.length === 0 ? (
            <div className="empty">
              <div className="empty-ico"><Icon name="users" size={28} /></div>
              No workers have registered yet.
            </div>
          ) : (
            <div className="worker-list">
              {workers.map((w) => (
                <div key={w.did} className="worker-row">
                  <span className="dir-avatar">{w.name.charAt(0).toUpperCase()}</span>
                  <div className="worker-info">
                    <div className="worker-name">{w.name} <span className="dir-id">{w.workerId}</span></div>
                    <div className="worker-meta mono">NID {w.nidMasked}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={goToGovernance}>Open Governance →</button>
        </Panel>

        <Panel className="card">
          <div className="card-head">
            <h2>Recent Activity</h2>
            <span className="tag">{activity.length}</span>
          </div>
          {activity.length === 0 ? (
            <div className="empty">
              <div className="empty-ico"><Icon name="grid" size={28} /></div>
              No activity yet — events from every portal will appear here.
            </div>
          ) : (
            <ul className="feed">
              {activity.map((a) => (
                <li key={a.id} className={`feed-click ${a.ok ? "" : "feed-err"}`} onClick={() => openFlow(subjectFromActivity(a))} title="View data flow">
                  <span className="feed-ico"><Icon name={KIND_ICON[a.kind]} size={17} /></span>
                  <div className="feed-body">
                    <div className="feed-title">
                      {a.title}
                      {!a.ok && <span className="feed-fail">Failed</span>}
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
        </Panel>
      </div>
    </>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="stat">
      <div className="stat-ico"><Icon name={icon} size={20} /></div>
      <div className="stat-val">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
