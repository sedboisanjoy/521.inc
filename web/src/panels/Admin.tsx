import { useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { Card, Field, Button, ErrorLine, JsonDetails } from "../ui";

// Admin / BMET — UC7 (adjust and view issuer/agency trust scores) and UC6
// (revoke a fraudulent credential).
export function Admin() {
  const { session, log, toast } = useStore();
  const actor = "BMET";

  const [agencyDID, setAgencyDID] = useState("did:key:ttc-dhaka");
  const [delta, setDelta] = useState(80);
  const [score, setScore] = useState<number | null>(null);
  const [busyA, setBusyA] = useState(false);
  const [busyL, setBusyL] = useState(false);
  const [err1, setErr1] = useState("");

  const [credHash, setCredHash] = useState(session.credHash || "");
  const [reason, setReason] = useState("FRAUD_AUDIT");
  const [revOut, setRevOut] = useState<{ status: string; credHash: string } | null>(null);
  const [busyR, setBusyR] = useState(false);
  const [err2, setErr2] = useState("");

  async function adjust() {
    setErr1("");
    setBusyA(true);
    try {
      const r = await api.updateStanding({ agencyDID, delta: Number(delta), evidenceHash: "audit-" + Date.now() });
      setScore(r.score);
      log({ kind: "standing", actor, title: `Standing ${delta >= 0 ? "+" : ""}${delta} → ${r.score}/100`, detail: agencyDID, ok: true });
      toast("success", `Standing now ${r.score}/100`);
    } catch (e) {
      const m = (e as Error).message;
      setErr1(m);
      toast("error", m);
    } finally {
      setBusyA(false);
    }
  }

  async function lookup() {
    setErr1("");
    setBusyL(true);
    try {
      const r = await api.getStanding(agencyDID);
      setScore(r.score);
      toast("info", `Standing: ${r.score}/100`);
    } catch (e) {
      const m = (e as Error).message;
      setErr1(m);
      toast("error", m);
    } finally {
      setBusyL(false);
    }
  }

  async function revoke() {
    setErr2("");
    setBusyR(true);
    try {
      const r = await api.revoke({ credHash, reasonCode: reason });
      setRevOut(r);
      log({ kind: "revoke", actor, title: `Revoked (${reason})`, detail: credHash, ok: true });
      toast("success", "Credential revoked on ledger");
    } catch (e) {
      const m = (e as Error).message;
      setErr2(m);
      toast("error", m);
    } finally {
      setBusyR(false);
    }
  }

  const tone = score === null ? "" : score >= 70 ? "score-good" : score >= 40 ? "score-mid" : "score-bad";

  return (
    <div className="panel-grid">
      <Card
        title="Trust Score"
        tag="UC7 · UpdateAgencyStanding"
        hint="Reputation is derived only from ledger events (clamped 0–100), so it can't be self-asserted."
      >
        <Field label="Agency / issuer DID">
          <input value={agencyDID} onChange={(e) => setAgencyDID(e.target.value)} />
        </Field>
        <div className="row row-end">
          <Field label="Delta (+ / −)">
            <input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} />
          </Field>
          <Button onClick={adjust} busy={busyA}>Apply</Button>
          <Button onClick={lookup} busy={busyL} variant="ghost">Lookup</Button>
        </div>
        <ErrorLine msg={err1} />
        {score !== null && (
          <div className={`score-panel ${tone}`}>
            <div className="score-num">{score}<span>/100</span></div>
            <div className="meter-track">
              <div className="meter-fill" style={{ width: `${score}%` }} />
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Revoke Credential"
        tag="UC6 · RevokeCredential"
        hint="Nothing is deleted — the ledger is immutable. Only the status bit flips to REVOKED."
      >
        <Field label="Credential hash">
          <input value={credHash} onChange={(e) => setCredHash(e.target.value)} placeholder="did:key:… credential hash" />
        </Field>
        <Field label="Reason code">
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button onClick={revoke} busy={busyR} disabled={!credHash} variant="danger">Revoke credential</Button>
        <ErrorLine msg={err2} />
        {revOut && (
          <div className="result">
            <div className="result-row"><span>Status</span><strong className="danger-text">{revOut.status}</strong></div>
            <JsonDetails data={revOut} />
          </div>
        )}
      </Card>
    </div>
  );
}
