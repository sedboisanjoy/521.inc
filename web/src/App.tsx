import { useEffect, useState } from "react";
import { Animator } from "@arwes/react-animator";
import { Text } from "@arwes/react-text";
import { StoreProvider, useStore } from "./store";
import { AppAnimatorProvider, ArwesBackground } from "./arwes";
import { Toaster, Copy, Badge } from "./ui";
import { Icon } from "./icons";
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
import { Reports } from "./panels/Reports";
import { Admin } from "./panels/Admin";
import { FlowExplorer } from "./panels/FlowExplorer";
import { FlowViz } from "./FlowViz";

function Shell() {
  const { role, identityDID, logout, session, clearSession, health, flowSubject, closeFlow, autoFlow, setAutoFlow } = useStore();
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
          <div className="brand-mark"><Icon name="passport" size={22} /></div>
          <div>
            <div className="brand-name"><Text as="span" manager="decipher">Employment Passport</Text></div>
            <div className="brand-sub">BCOLBD 2026</div>
          </div>
        </div>

        <div className="who">
          <span className="who-ico"><Icon name={def.icon} size={20} /></span>
          <div className="who-text">
            <div className="who-name">{session.orgName || session.workerName || def.short}</div>
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
              <span className="nav-ico"><Icon name={n.icon} size={18} /></span>
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
            {health === "online" ? "Server connected" : health === "offline" ? "Server offline" : "Connecting…"}
          </div>
          <button className="logout" onClick={logout}>⤶ Sign out</button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div>
            <h1><Text key={tab} as="span" manager="decipher">{current.label}</Text></h1>
            <p className="topbar-sub">{def.name}</p>
          </div>
          <div className="session">
            <label className="autoflow-toggle" title="Data flow starts automatically on submit">
              <input type="checkbox" checked={autoFlow} onChange={(e) => setAutoFlow(e.target.checked)} />
              <span className="autoflow-track"><span className="autoflow-knob" /></span>
              <span className="autoflow-label"><Icon name="flow" size={14} /> Auto flow</span>
            </label>
            {identityDID && (
              <div className="session-chip">
                <span className="chip-key">You</span>
                <Copy value={identityDID} short />
              </div>
            )}
            {session.credHash && (
              <div className="session-chip">
                <span className="chip-key">Certificate</span>
                <Copy value={session.credHash} short />
              </div>
            )}
            {session.credHash && (
              <button className="session-clear" onClick={clearSession} title="Clear certificate">
                Clear
              </button>
            )}
          </div>
        </header>

        {health === "offline" && (
          <div className="banner">
            <Badge status="offline" />
            No connection to the server. Start it with <span className="mono">make backend</span>.
          </div>
        )}

        {/* Keyed by tab so switching portals re-plays the Arwes assemble. */}
        <Animator key={tab} manager="stagger">
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
            {tab === "reports" && <Reports />}
            {tab === "admin" && <Admin />}
            {tab === "flow" && <FlowExplorer />}
          </main>
        </Animator>
      </div>

      {flowSubject && <FlowViz subject={flowSubject} onClose={closeFlow} />}
      <Toaster />
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <AppAnimatorProvider>
        <Animator root active manager="parallel">
          <ArwesBackground />
          <Shell />
        </Animator>
      </AppAnimatorProvider>
    </StoreProvider>
  );
}
