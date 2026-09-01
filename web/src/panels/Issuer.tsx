import { useState } from "react";
import { api } from "../api";
import type { Session } from "../App";

// Issuer Portal — UC1 (register worker) and UC2/3/5 (issue a credential). The
// wage is embedded in the credential claims so the Verifier panel can later
// prove a predicate over it without revealing it.
export function Issuer({ session, setSession }: { session: Session; setSession: (s: Session) => void }) {
  const [name, setName] = useState("Rahim Uddin");
  const [nid, setNid] = useState("1990123456");
  const [address, setAddress] = useState("Sylhet, Bangladesh");
  const [regOut, setRegOut] = useState<string>("");
  const [err1, setErr1] = useState("");

  const [issuerDID, setIssuerDID] = useState("did:key:ttc-dhaka");
  const [subjectDID, setSubjectDID] = useState(session.did || "");
  const [trade, setTrade] = useState("Welding");
  const [level, setLevel] = useState(3);
  const [wage, setWage] = useState(32000);
  const [employer, setEmployer] = useState("SaudiCo");
  const [credOut, setCredOut] = useState<string>("");
  const [err2, setErr2] = useState("");

  async function register() {
    setErr1("");
    try {
      const r = await api.registerWorker({ name, nid, address });
      setRegOut(JSON.stringify(r, null, 2));
      setSubjectDID(r.did);
      setSession({ ...session, did: r.did });
    } catch (e) {
      setErr1((e as Error).message);
    }
  }

  async function issue() {
    setErr2("");
    try {
      const r = await api.issueCredential({
        schemaId: "SkillCredential-v1",
        issuerDID,
        subjectDID,
        claims: { trade, level: Number(level), wageAmount: Number(wage), employer },
      });
      setCredOut(JSON.stringify(r, null, 2));
      setSession({ ...session, did: subjectDID, credHash: r.credHash });
    } catch (e) {
      setErr2((e as Error).message);
    }
  }

  return (
    <>
      <div className="card">
        <h2>1 · Register Worker <span className="mono">(UC1 → RegisterDID)</span></h2>
        <p className="hint">PII is stored off-chain; only the DID pointer + doc hash are anchored on the ledger.</p>
        <div className="row">
          <div><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label>NID</label><input value={nid} onChange={(e) => setNid(e.target.value)} /></div>
        </div>
        <label>Address</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} />
        <button className="go" onClick={register}>Register &amp; create DID</button>
        {err1 && <div className="err">{err1}</div>}
        {regOut && <pre>{regOut}</pre>}
      </div>

      <div className="card">
        <h2>2 · Issue Skill Credential <span className="mono">(UC2 → IssueCredential)</span></h2>
        <p className="hint">The wage is embedded in the credential — the verifier will prove it's ≥ a threshold without seeing it.</p>
        <label>Issuer DID</label>
        <input value={issuerDID} onChange={(e) => setIssuerDID(e.target.value)} />
        <label>Subject (Worker) DID</label>
        <input value={subjectDID} onChange={(e) => setSubjectDID(e.target.value)} placeholder="register a worker first" />
        <div className="row">
          <div><label>Trade</label><input value={trade} onChange={(e) => setTrade(e.target.value)} /></div>
          <div><label>Level</label><input type="number" value={level} onChange={(e) => setLevel(Number(e.target.value))} /></div>
        </div>
        <div className="row">
          <div><label>Wage (BDT)</label><input type="number" value={wage} onChange={(e) => setWage(Number(e.target.value))} /></div>
          <div><label>Employer</label><input value={employer} onChange={(e) => setEmployer(e.target.value)} /></div>
        </div>
        <button className="go" onClick={issue} disabled={!subjectDID}>Issue credential</button>
        {err2 && <div className="err">{err2}</div>}
        {credOut && <pre>{credOut}</pre>}
      </div>
    </>
  );
}
