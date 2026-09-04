import { useEffect, useState } from "react";
import { Animator } from "@arwes/react-animator";
import { Text } from "@arwes/react-text";
import { api, type WorkerDir, type OrgDir } from "./api";
import { useStore } from "./store";
import { Icon } from "./icons";
import { Panel } from "./arwes";
import { ROLE_LIST, ROLES, type Role } from "./roles";

// Role-based login. Workers and organisations (training centers / companies)
// either pick an existing account from a directory or create a new one — so
// many training centers and many companies can coexist. BMET is a single fixed
// regulator account.
export function Login() {
  const { login, setSession, session, health, toast } = useStore();
  const [role, setRole] = useState<Role>("ttc");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  // Worker sign-up fields.
  const [name, setName] = useState("Rahim Uddin");
  const [nid, setNid] = useState("1990123456");
  const [address, setAddress] = useState("Sylhet, Bangladesh");

  // Org sign-up fields.
  const [orgName, setOrgName] = useState("");
  const [orgEmail, setOrgEmail] = useState("");

  const [workers, setWorkers] = useState<WorkerDir[]>([]);
  const [orgs, setOrgs] = useState<OrgDir[]>([]);

  const def = ROLES[role];
  const isWorker = role === "worker";
  const isOrg = role === "ttc" || role === "employer" || role === "agency";
  const orgType: "ttc" | "company" | "agency" = role === "ttc" ? "ttc" : role === "agency" ? "agency" : "company";

  useEffect(() => {
    setPassword("");
    setErr("");
    setMode("signin");
    setOrgName("");
    setOrgEmail("");
    if (isWorker) {
      setUsername(session.did || "");
      api.listWorkers().then(setWorkers).catch(() => setWorkers([]));
    } else if (isOrg) {
      setUsername("");
      api.listOrgs(orgType).then(setOrgs).catch(() => setOrgs([]));
    } else {
      setUsername(def.user);
    }
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setErr("");
    if (password !== def.pass) return setErr("Incorrect password.");

    // ── Sign-up flows ──
    if (mode === "signup" && isWorker) {
      if (!name.trim() || !nid.trim()) return setErr("Enter your name and National ID number.");
      setBusy(true);
      try {
        const r = await api.registerWorker({ name, nid, address });
        login("worker", r.did);
        setSession({ workerName: name });
        toast("success", `Welcome, ${name} — your ID has been created`);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mode === "signup" && isOrg) {
      if (!orgName.trim()) return setErr("Enter the organisation name.");
      setBusy(true);
      try {
        const o = await api.registerOrg({ name: orgName.trim(), type: orgType, email: orgEmail.trim() });
        login(role, o.did);
        setSession({ orgName: o.name });
        toast("success", `Welcome, ${o.name}`);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }

    // ── Sign-in flows ──
    if (isWorker) {
      if (!username.trim().startsWith("did:")) return setErr("Select your worker account.");
      login("worker", username.trim());
    } else if (isOrg) {
      if (!username.startsWith("did:")) return setErr("Select your organisation.");
      const org = orgs.find((o) => o.did === username);
      login(role, username);
      setSession({ orgName: org?.name });
    } else {
      if (username.trim().toLowerCase() !== def.user.toLowerCase()) return setErr("The username does not match this identity.");
      login(role, def.did);
    }
    toast("success", `Signed in as ${def.short}`);
  }

  const newLabel = isWorker ? "New Worker" : role === "ttc" ? "New Center" : role === "agency" ? "New Agency" : "New Company";
  const orgNoun = role === "ttc" ? "Training center" : role === "agency" ? "Agency" : "Company";

  return (
    <Animator active manager="stagger">
    <div className="login">
      <div className="login-hero">
        <div className="brand">
          <div className="brand-mark"><Icon name="passport" size={22} /></div>
          <div>
            <div className="brand-name">Employment Passport</div>
            <div className="brand-sub">BCOLBD 2026</div>
          </div>
        </div>
        <h1 className="login-headline">
          <Text manager="decipher">Verified skills.<br />Trusted hiring.</Text>
        </h1>
        <p className="login-blurb">
          Training centers issue skill certificates to workers, workers apply for jobs abroad, and companies
          verify the certificate on the blockchain before hiring — no forged papers, no need to call Dhaka.
        </p>
        <ul className="login-points">
          <li><span className="pt-ico"><Icon name="school" size={17} /></span> Training centers issue tamper-proof skill certificates.</li>
          <li><span className="pt-ico"><Icon name="worker" size={17} /></span> Workers own their certificates and apply directly.</li>
          <li><span className="pt-ico"><Icon name="building" size={17} /></span> Companies verify applicants in one click.</li>
        </ul>
        <div className={`conn conn-${health}`} style={{ marginTop: 8 }}>
          <span className="conn-dot" />
          {health === "online" ? "Server connected" : health === "offline" ? "Server offline" : "Connecting…"}
        </div>
      </div>

      <Panel className="login-panel" frame="corners">
        <h2><Text as="span" manager="decipher">Sign in</Text></h2>
        <p className="hint">Select who you are.</p>

        <div className="role-grid">
          {ROLE_LIST.map((r) => (
            <button key={r.id} className={`role-card ${role === r.id ? "active" : ""}`} onClick={() => setRole(r.id)}>
              <span className="role-ico"><Icon name={r.icon} size={18} /></span>
              <span className="role-name">{r.short}</span>
            </button>
          ))}
        </div>

        <div className="login-form">
          <div className="role-tagline">
            <span className="role-ico-lg"><Icon name={def.icon} size={22} /></span>
            <div>
              <div className="role-full">{def.name}</div>
              <div className="role-desc">{def.tagline}</div>
            </div>
          </div>

          {(isWorker || isOrg) && (
            <div className="seg">
              <button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>I have an account</button>
              <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>{newLabel}</button>
            </div>
          )}

          {mode === "signup" && isWorker ? (
            <>
              <div className="row">
                <div className="field">
                  <label>Full name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="field">
                  <label>National ID number</label>
                  <input value={nid} onChange={(e) => setNid(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>Address</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            </>
          ) : mode === "signup" && isOrg ? (
            <>
              <div className="field">
                <label>{orgNoun} name</label>
                <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder={role === "ttc" ? "e.g. Dhaka Technical Center" : role === "agency" ? "e.g. Prime Recruitment Ltd" : "e.g. Gulf Construction"} />
              </div>
              <div className="field">
                <label>Email (optional)</label>
                <input value={orgEmail} onChange={(e) => setOrgEmail(e.target.value)} placeholder="office@example.com" />
              </div>
            </>
          ) : isWorker ? (
            <div className="field">
              <label>Your worker account</label>
              {workers.length > 0 ? (
                <select value={username} onChange={(e) => setUsername(e.target.value)}>
                  <option value="">— Select an account —</option>
                  {workers.map((w) => (
                    <option key={w.did} value={w.did}>{w.name} · {w.workerId}</option>
                  ))}
                </select>
              ) : (
                <span className="field-hint">No workers registered yet — choose “{newLabel}”.</span>
              )}
            </div>
          ) : isOrg ? (
            <div className="field">
              <label>Your {orgNoun.toLowerCase()}</label>
              {orgs.length > 0 ? (
                <select value={username} onChange={(e) => setUsername(e.target.value)}>
                  <option value="">— Select —</option>
                  {orgs.map((o) => (
                    <option key={o.did} value={o.did}>{o.name} · {o.orgId}</option>
                  ))}
                </select>
              ) : (
                <span className="field-hint">No organisations yet — choose “{newLabel}”.</span>
              )}
            </div>
          ) : (
            <div className="field">
              <label>Office email</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="you@example.com"
                autoComplete="username"
              />
            </div>
          )}

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {err && <div className="err">⚠ {err}</div>}

          <button className="btn btn-primary btn-full" onClick={submit} disabled={busy}>
            {busy ? <span className="spinner" /> : null}
            {mode === "signup" ? (isWorker ? "Create account and sign in" : "Create organisation and sign in") : `Sign in as ${def.short}`}
          </button>

          <div className="creds">
            <span className="creds-key">Demo details</span>
            {!isWorker && !isOrg && (
              <div className="creds-row">
                <span>Email</span>
                <code>{def.user}</code>
              </div>
            )}
            <div className="creds-row">
              <span>Password</span>
              <code>{def.pass}</code>
            </div>
          </div>
        </div>
      </Panel>
    </div>
    </Animator>
  );
}
