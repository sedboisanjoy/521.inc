import { useEffect, useState } from "react";
import { api, type WorkerDir } from "./api";
import { useStore } from "./store";
import { ROLE_LIST, ROLES, type Role } from "./roles";

// Role-based login with real credential checks. Orgs sign in with email +
// password; workers either sign in with the DID they already hold or sign up
// (self-sovereign) to mint a fresh DID.
export function Login() {
  const { login, setSession, session, health, toast } = useStore();
  const [role, setRole] = useState<Role>("ttc");
  const [username, setUsername] = useState(ROLES.ttc.user);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Worker sign-up fields.
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("Rahim Uddin");
  const [nid, setNid] = useState("1990123456");
  const [address, setAddress] = useState("Sylhet, Bangladesh");

  // Directory of registered workers, so a worker can pick their account.
  const [workers, setWorkers] = useState<WorkerDir[]>([]);

  const def = ROLES[role];
  const isWorker = role === "worker";

  useEffect(() => {
    setUsername(isWorker ? session.did || "" : def.user);
    setPassword("");
    setErr("");
    setMode("signin");
    if (isWorker) api.listWorkers().then(setWorkers).catch(() => setWorkers([]));
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setErr("");
    if (password !== def.pass) return setErr("Incorrect password.");

    if (isWorker && mode === "signup") {
      if (!name.trim() || !nid.trim()) return setErr("Name and National ID are required.");
      setBusy(true);
      try {
        const r = await api.registerWorker({ name, nid, address });
        login("worker", r.did);
        setSession({ workerName: name });
        toast("success", `Welcome, ${name} — your DID is ready`);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (isWorker) {
      if (!username.trim().startsWith("did:")) return setErr("Enter your worker DID (starts with did:).");
      login("worker", username.trim());
    } else {
      if (username.trim().toLowerCase() !== def.user.toLowerCase()) return setErr("Unknown username for this role.");
      login(role, def.did);
    }
    toast("success", `Signed in as ${def.short}`);
  }

  return (
    <div className="login">
      <div className="login-hero">
        <div className="brand">
          <div className="brand-mark">🛂</div>
          <div>
            <div className="brand-name">Employment Passport</div>
            <div className="brand-sub">BCOLBD 2026</div>
          </div>
        </div>
        <h1 className="login-headline">
          Certified skills.
          <br />
          Trusted hiring.
        </h1>
        <p className="login-blurb">
          Training centers certify a worker's skills, the worker applies to jobs abroad, and the
          company verifies the certificate on-chain before hiring — no forged papers, no calls to
          Dhaka.
        </p>
        <ul className="login-points">
          <li>🏫 Training centers issue tamper-proof skill certificates.</li>
          <li>👷 Workers own their certificates and apply to jobs directly.</li>
          <li>🏢 Companies verify applicants in one on-chain read.</li>
        </ul>
        <div className={`conn conn-${health}`} style={{ marginTop: 8 }}>
          <span className="conn-dot" />
          {health === "online" ? "Ledger API online" : health === "offline" ? "Ledger API offline" : "Connecting…"}
        </div>
      </div>

      <div className="login-panel">
        <h2>Sign in</h2>
        <p className="hint">Choose the organisation you're logging in as.</p>

        <div className="role-grid">
          {ROLE_LIST.map((r) => (
            <button key={r.id} className={`role-card ${role === r.id ? "active" : ""}`} onClick={() => setRole(r.id)}>
              <span className="role-ico">{r.icon}</span>
              <span className="role-name">{r.short}</span>
            </button>
          ))}
        </div>

        <div className="login-form">
          <div className="role-tagline">
            <span className="role-ico-lg">{def.icon}</span>
            <div>
              <div className="role-full">{def.name}</div>
              <div className="role-desc">{def.tagline}</div>
            </div>
          </div>

          {isWorker && (
            <div className="seg">
              <button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>I have a DID</button>
              <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>New worker</button>
            </div>
          )}

          {isWorker && mode === "signup" ? (
            <>
              <div className="row">
                <div className="field">
                  <label>Full name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="field">
                  <label>National ID</label>
                  <input value={nid} onChange={(e) => setNid(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>Address</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            </>
          ) : isWorker ? (
            <div className="field">
              <label>Your worker account</label>
              {workers.length > 0 ? (
                <select value={username} onChange={(e) => setUsername(e.target.value)}>
                  <option value="">— choose your account —</option>
                  {workers.map((w) => (
                    <option key={w.did} value={w.did}>
                      {w.name} · {w.workerId}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="did:key:worker:…"
                  autoComplete="username"
                />
              )}
              <span className="field-hint">
                {workers.length > 0
                  ? "Pick your account, or use “New worker” to register."
                  : "No workers registered yet — switch to “New worker”."}
              </span>
            </div>
          ) : (
            <div className="field">
              <label>Work email</label>
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
            {isWorker && mode === "signup" ? "Create account & enter" : `Sign in as ${def.short}`}
          </button>

          <div className="creds">
            <span className="creds-key">Demo credentials</span>
            {!isWorker && (
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
      </div>
    </div>
  );
}
