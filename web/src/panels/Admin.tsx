import { useState } from "react";
import { api } from "../api";
import type { Session } from "../App";

// Admin / BMET — UC7 (adjust and view issuer/agency trust scores) and UC6
// (revoke a fraudulent credential).
export function Admin({ session }: { session: Session }) {
  const [agencyDID, setAgencyDID] = useState("did:key:ttc-dhaka");
  const [delta, setDelta] = useState(80);
  const [score, setScore] = useState<number | null>(null);
  const [err1, setErr1] = useState("");

  const [credHash, setCredHash] = useState(session.credHash || "");
  const [reason, setReason] = useState("FRAUD_AUDIT");
  const [revOut, setRevOut] = useState("");
  const [err2, setErr2] = useState("");

  async function adjust() {
    setErr1("");
    try {
      const r = await api.updateStanding({ agencyDID, delta: Number(delta), evidenceHash: "audit-" + Date.now() });
      setScore(r.score);
    } catch (e) {
      setErr1((e as Error).message);
    }
  }

  async function lookup() {
    setErr1("");
    try {
      const r = await api.getStanding(agencyDID);
      setScore(r.score);
    } catch (e) {
      setErr1((e as Error).message);
    }
  }

  async function revoke() {
    setErr2("");
    try {
      const r = await api.revoke({ credHash, reasonCode: reason });
      setRevOut(JSON.stringify(r, null, 2));
    } catch (e) {
      setErr2((e as Error).message);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Trust Score <span className="mono">(UC7 → UpdateAgencyStanding)</span></h2>
        <p className="hint">Reputation is derived only from ledger events (clamped 0–100), so it can't be self-asserted.</p>
        <label>Agency / Issuer DID</label>
        <input value={agencyDID} onChange={(e) => setAgencyDID(e.target.value)} />
        <div className="row">
          <div><label>Delta (+/-)</label><input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} /></div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <button className="go" style={{ marginTop: 0 }} onClick={adjust}>Apply</button>
            <button className="go" style={{ marginTop: 0, background: "var(--panel2)" }} onClick={lookup}>Lookup</button>
          </div>
        </div>
        {err1 && <div className="err">{err1}</div>}
        {score !== null && (
          <div style={{ marginTop: 16, fontSize: 22 }}>
            Score: <strong>{score}/100</strong>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Revoke Credential <span className="mono">(UC6 → RevokeCredential)</span></h2>
        <p className="hint">Nothing is deleted — the ledger is immutable. Only the status bit flips to REVOKED.</p>
        <label>Credential hash</label>
        <input value={credHash} onChange={(e) => setCredHash(e.target.value)} />
        <label>Reason code</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="go" onClick={revoke} disabled={!credHash} style={{ background: "var(--red)" }}>Revoke</button>
        {err2 && <div className="err">{err2}</div>}
        {revOut && <pre>{revOut}</pre>}
      </div>
    </>
  );
}
