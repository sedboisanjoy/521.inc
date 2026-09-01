import { useEffect, useState } from "react";
import { api, type WalletEntry } from "../api";
import { useStore } from "../store";
import { Card, Field, Button, ErrorLine, Badge, Copy } from "../ui";

// Worker Wallet — the worker's own portal. Lists the credentials they hold
// (joined with live on-chain status) and lets them prove a claim to a verifier
// without revealing the underlying value (selective disclosure = their consent).
export function Wallet() {
  const { session, identityDID, toast, log } = useStore();
  const actor = "Worker";
  const myDID = identityDID || session.did || "";

  const [entries, setEntries] = useState<WalletEntry[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [selected, setSelected] = useState("");
  const [attribute, setAttribute] = useState("level");
  const [op, setOp] = useState(">=");
  const [value, setValue] = useState(3);
  const [proof, setProof] = useState<{ predicate: string; result: boolean; consentHash: string } | null>(null);
  const [busyP, setBusyP] = useState(false);
  const [perr, setPerr] = useState("");

  async function load() {
    if (!myDID) return;
    setErr("");
    setBusy(true);
    try {
      const list = await api.wallet(myDID);
      setEntries(list);
      setLoaded(true);
      if (list.length && !selected) setSelected(list[0].credHash);
    } catch (e) {
      const m = (e as Error).message;
      setErr(m);
      toast("error", m);
    } finally {
      setBusy(false);
    }
  }

  // The worker sees their own wallet immediately on entry.
  useEffect(() => {
    if (myDID) load();
  }, [myDID]); // eslint-disable-line react-hooks/exhaustive-deps

  async function prove() {
    setPerr("");
    setProof(null);
    setBusyP(true);
    try {
      const r = await api.disclose({ credHash: selected, attribute, op, value: Number(value), verifierDID: "did:key:employer" });
      setProof(r);
      log({ kind: "disclose", actor, title: `Shared proof: ${r.predicate} → ${r.result}`, detail: r.consentHash, ok: true });
      toast("success", `Predicate ${r.result ? "holds" : "fails"} — value stayed private`);
    } catch (e) {
      const m = (e as Error).message;
      setPerr(m);
      toast("error", m);
    } finally {
      setBusyP(false);
    }
  }

  return (
    <div className="panel-grid">
      <Card
        title="My Credentials"
        tag="off-chain body + on-chain status"
        hint="Everything issued to your DID, with its live ledger status and trust signals."
      >
        <div className="who-line">
          <span>Signed in as</span>
          <Copy value={myDID || "—"} short />
          <Button onClick={load} busy={busy} variant="ghost">Refresh</Button>
        </div>
        <ErrorLine msg={err} />

        {loaded && entries.length === 0 && (
          <div className="empty">
            <div className="empty-ico">🗂</div>
            No credentials yet — ask your training center to issue one to your DID.
          </div>
        )}

        <div className="cred-list">
          {entries.map((e) => (
            <article key={e.credHash} className="cred">
              <div className="cred-head">
                <span className="cred-schema">{e.schemaId}</span>
                <Badge status={e.anchor.status} />
              </div>
              <div className="cred-hash">
                <Copy value={e.credHash} short />
              </div>
              <div className="claims">
                {Object.entries(e.claims).map(([k, v]) => (
                  <span key={k} className="claim">
                    <span className="claim-k">{k}</span>
                    <span className="claim-v">{String(v)}</span>
                  </span>
                ))}
              </div>
              <div className="cred-meta">
                <div className="meter">
                  <div className="meter-label">
                    Issuer standing <strong>{e.anchor.issuerStanding}/100</strong>
                  </div>
                  <div className="meter-track">
                    <div className="meter-fill" style={{ width: `${e.anchor.issuerStanding}%` }} />
                  </div>
                </div>
                <div className="corr">🤝 Corroboration <strong>{e.anchor.corroborationScore}</strong></div>
              </div>
            </article>
          ))}
        </div>
      </Card>

      <Card
        title="Share a claim privately"
        tag="selective disclosure · your consent"
        hint="Prove something about a certificate (e.g. level ≥ 3) to an employer without revealing the exact number."
      >
        <Field label="Credential">
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">— select a credential —</option>
            {entries.map((e) => (
              <option key={e.credHash} value={e.credHash}>
                {e.schemaId} · {e.credHash.slice(0, 10)}…
              </option>
            ))}
          </select>
        </Field>
        <div className="row">
          <Field label="Attribute">
            <input value={attribute} onChange={(e) => setAttribute(e.target.value)} />
          </Field>
          <Field label="Operator">
            <select value={op} onChange={(e) => setOp(e.target.value)}>
              <option>&gt;=</option>
              <option>&gt;</option>
              <option>&lt;=</option>
              <option>&lt;</option>
              <option>==</option>
            </select>
          </Field>
          <Field label="Value">
            <input type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} />
          </Field>
        </div>
        <Button onClick={prove} busy={busyP} disabled={!selected}>Generate proof</Button>
        <ErrorLine msg={perr} />
        {proof && (
          <div className="result">
            <div className={`verdict ${proof.result ? "verdict-ok" : "verdict-no"}`}>
              <span className="verdict-ico">{proof.result ? "✓" : "✕"}</span>
              <div>
                <div className="verdict-title">
                  <span className="mono">{proof.predicate}</span> → {proof.result ? "TRUE" : "FALSE"}
                </div>
                <div className="verdict-sub">This is all the employer sees — never the raw value.</div>
              </div>
            </div>
            <div className="result-row"><span>Consent receipt</span><Copy value={proof.consentHash} short /></div>
          </div>
        )}
      </Card>
    </div>
  );
}
