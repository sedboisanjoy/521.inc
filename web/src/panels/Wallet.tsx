import { useState } from "react";
import { api, type WalletEntry } from "../api";
import type { Session } from "../App";

// Worker Wallet — lists the credentials a worker holds, joined with their live
// on-chain status (ACTIVE / REVOKED) and corroboration score.
export function Wallet({ session }: { session: Session }) {
  const [subjectDID, setSubjectDID] = useState(session.did || "");
  const [entries, setEntries] = useState<WalletEntry[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setErr("");
    try {
      setEntries(await api.wallet(subjectDID));
      setLoaded(true);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  function badge(status: string) {
    const cls = status === "ACTIVE" ? "active" : status === "REVOKED" ? "revoked" : "unknown";
    return <span className={`badge ${cls}`}>{status}</span>;
  }

  return (
    <div className="card">
      <h2>Worker Wallet <span className="mono">(off-chain body + on-chain status)</span></h2>
      <p className="hint">Enter a worker DID (auto-filled after registration) to see their credentials.</p>
      <label>Worker DID</label>
      <input value={subjectDID} onChange={(e) => setSubjectDID(e.target.value)} />
      <button className="go" onClick={load} disabled={!subjectDID}>Load wallet</button>
      {err && <div className="err">{err}</div>}
      {loaded && entries.length === 0 && <p className="hint" style={{ marginTop: 16 }}>No credentials yet.</p>}
      {entries.map((e) => (
        <div key={e.credHash} style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{e.schemaId}</strong>
            {badge(e.anchor.status)}
          </div>
          <p className="mono">{e.credHash}</p>
          <div className="hint">
            Claims: {Object.entries(e.claims).map(([k, v]) => `${k}=${v}`).join(" · ")}
          </div>
          <div className="hint">
            Issuer standing: {e.anchor.issuerStanding}/100 · Corroboration: {e.anchor.corroborationScore}
          </div>
        </div>
      ))}
    </div>
  );
}
