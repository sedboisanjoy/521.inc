import { useState } from "react";
import { api, type VerifyResult } from "../api";
import type { Session } from "../App";

// Verifier Portal — UC4 (verify the on-chain anchor) and selective disclosure
// (prove a predicate over a hidden attribute like wage without revealing it).
export function Verifier({ session }: { session: Session }) {
  const [credHash, setCredHash] = useState(session.credHash || "");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [err, setErr] = useState("");

  const [attribute, setAttribute] = useState("wageAmount");
  const [op, setOp] = useState(">=");
  const [value, setValue] = useState(25000);
  const [proof, setProof] = useState<{ predicate: string; result: boolean } | null>(null);
  const [perr, setPerr] = useState("");

  async function verify() {
    setErr(""); setResult(null);
    try {
      setResult(await api.verify(credHash));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function prove() {
    setPerr(""); setProof(null);
    try {
      const r = await api.disclose({ credHash, attribute, op, value: Number(value), verifierDID: "did:key:employer" });
      setProof(r);
    } catch (e) {
      setPerr((e as Error).message);
    }
  }

  function badge(status: string) {
    const cls = status === "ACTIVE" ? "active" : status === "REVOKED" ? "revoked" : "unknown";
    return <span className={`badge ${cls}`}>{status}</span>;
  }

  return (
    <>
      <div className="card">
        <h2>Verify Credential <span className="mono">(UC4 → VerifyAnchor)</span></h2>
        <p className="hint">Checks the on-chain anchor in one read — no call to Bangladesh, no trust in our servers.</p>
        <label>Credential hash</label>
        <input value={credHash} onChange={(e) => setCredHash(e.target.value)} placeholder="issue a credential first" />
        <button className="go" onClick={verify} disabled={!credHash}>Verify</button>
        {err && <div className="err">{err}</div>}
        {result && (
          <div style={{ marginTop: 16 }}>
            {result.found ? (
              <>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  Status: {badge(result.status)}
                </div>
                <div className="hint" style={{ marginTop: 8 }}>
                  Issuer: <span className="mono">{result.issuerDID}</span><br />
                  Issuer standing: <strong>{result.issuerStanding}/100</strong> ·
                  Corroboration: <strong>{result.corroborationScore}</strong><br />
                  Issued: {result.issuedAt}
                  {result.reasonCode && <><br />Revoked reason: <strong>{result.reasonCode}</strong></>}
                </div>
              </>
            ) : (
              <div className="result-no">Not found on ledger — do NOT trust.</div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Selective Disclosure <span className="mono">(ZK-style predicate)</span></h2>
        <p className="hint">Prove a hidden attribute satisfies a predicate. The exact value never leaves the wallet.</p>
        <div className="row">
          <div><label>Attribute</label><input value={attribute} onChange={(e) => setAttribute(e.target.value)} /></div>
          <div>
            <label>Operator</label>
            <select value={op} onChange={(e) => setOp(e.target.value)}>
              <option>&gt;=</option><option>&gt;</option><option>&lt;=</option><option>&lt;</option><option>==</option>
            </select>
          </div>
          <div><label>Value</label><input type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} /></div>
        </div>
        <button className="go" onClick={prove} disabled={!credHash}>Prove predicate</button>
        {perr && <div className="err">{perr}</div>}
        {proof && (
          <div style={{ marginTop: 16 }}>
            Predicate <span className="mono">{proof.predicate}</span> →{" "}
            {proof.result ? <span className="result-ok">TRUE ✓</span> : <span className="result-no">FALSE ✗</span>}
            <p className="hint">The verifier learns only this yes/no — not the underlying value.</p>
          </div>
        )}
      </div>
    </>
  );
}
