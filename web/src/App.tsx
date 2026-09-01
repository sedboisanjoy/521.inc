import { useEffect, useState } from "react";
import { StoreProvider, useStore } from "./store";
import { Toaster, Copy, Badge } from "./ui";
import { Login } from "./Login";
import { ROLES, type Tab } from "./roles";
import { Dashboard } from "./panels/Dashboard";
import { Issuer } from "./panels/Issuer";
import { Wallet } from "./panels/Wallet";
import { WorkerJobs } from "./panels/WorkerJobs";
import { WorkerApplications } from "./panels/WorkerApplications";
import { EmployerPostings } from "./panels/EmployerPostings";
import { EmployerApplicants } from "./panels/EmployerApplicants";
import { WorkerContracts } from "./panels/WorkerContracts";
import { EmployerContracts } from "./panels/EmployerContracts";
import { Admin } from "./panels/Admin";

function Shell() {
  const { role, identityDID, logout, session, clearSession, health } = useStore();
  const def = role ? ROLES[role] : null;
  const [tab, setTab] = useState<Tab>(def ? def.nav[0].id : "dashboard");

  // When the role changes (login), snap to that role's first portal.
  useEffect(() => {
    if (def) setTab(def.nav[0].id);
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!role || !def) return <Login />;

  const current = def.nav.find((n) => n.id === tab) || def.nav[0];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">🛂</div>
          <div>
            <div className="brand-name">Employment Passport</div>
            <div className="brand-sub">BCOLBD 2026</div>
          </div>
        </div>

        <div className="who">
          <span className="who-ico">{def.icon}</span>
          <div className="who-text">
            <div className="who-name">{def.short}</div>
            <div className="who-role">{def.name}</div>
          </div>
        </div>

        <nav>
          {def.nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${tab === n.id ? "active" : ""}`}
              onClick={() => setTab(n.id)}
            >
              <span className="nav-ico">{n.icon}</span>
              <span className="nav-text">
                <span className="nav-label">{n.label}</span>
                <span className="nav-sub">{n.sub}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className={`conn conn-${health}`}>
            <span className="conn-dot" />
            {health === "online" ? "Ledger API online" : health === "offline" ? "API offline" : "Connecting…"}
          </div>
          <button className="logout" onClick={logout}>⤶ Sign out</button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div>
            <h1>{current.label}</h1>
            <p className="topbar-sub">{def.name}</p>
          </div>
          <div className="session">
            {identityDID && (
              <div className="session-chip">
                <span className="chip-key">You</span>
                <Copy value={identityDID} short />
              </div>
            )}
            {session.credHash && (
              <div className="session-chip">
                <span className="chip-key">Credential</span>
                <Copy value={session.credHash} short />
              </div>
            )}
            {session.credHash && (
              <button className="session-clear" onClick={clearSession} title="Clear working credential">
                Clear
              </button>
            )}
          </div>
        </header>

        {health === "offline" && (
          <div className="banner">
            <Badge status="offline" />
            Backend not reachable at <span className="mono">/api</span>. Start it with{" "}
            <span className="mono">make backend</span> (mock mode, no Fabric needed).
          </div>
        )}

        <main>
          {tab === "dashboard" && <Dashboard goToGovernance={() => setTab("admin")} />}
          {tab === "issuer" && <Issuer />}
          {tab === "wallet" && <Wallet />}
          {tab === "jobs" && <WorkerJobs />}
          {tab === "applications" && <WorkerApplications />}
          {tab === "postings" && <EmployerPostings />}
          {tab === "applicants" && <EmployerApplicants goTo={setTab} />}
          {tab === "wcontracts" && <WorkerContracts />}
          {tab === "econtracts" && <EmployerContracts />}
          {tab === "admin" && <Admin />}
        </main>
      </div>

      <Toaster />
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
