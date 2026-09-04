import { useState, useEffect } from "react";
import { api, type OrgDir } from "../api";
import { useStore } from "../store";
import { Card, Field, Button, Badge, Copy, ErrorLine } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// BFIU portal — anti-money-laundering. It anchors a beneficial-ownership
// THRESHOLD proof (no owner above 25% is sanctioned/PEP) without ever
// publishing the cap table. Only the threshold proof hash goes on-chain.
export function BfiuUBO() {
  const { identityDID, log, toast, openFlow, autoFlow } = useStore();
  const actor = "BFIU";

  const [orgs, setOrgs] = useState<OrgDir[]>([]);
  const [dirErr, setDirErr] = useState("");

  const [companyDID, setCompanyDID] = useState("");
  const [sel, setSel] = useState("Yes");
  const [note, setNote] = useState("");
  const [out, setOut] = useState<{ credHash: string; proofHash: string; thresholdOk: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function loadOrgs() {
    setDirErr("");
    try {
      setOrgs(await api.listOrgs("company"));
    } catch (e) {
      setDirErr((e as Error).message);
    }
  }
  useEffect(() => { loadOrgs(); }, []);

  const org = orgs.find((o) => o.did === companyDID);

  async function prove() {
    if (!org) return;
    setErr("");
    setBusy(true);
    try {
      const r = await api.proveUBO(org.did, { thresholdOk: sel === "Yes", note: note.trim() });
      setOut(r);
      const entry = log({ kind: "ubo", actor, title: `UBO threshold proof: ${org.name}`, detail: r.proofHash, ok: true });
      toast("success", "UBO threshold proof anchored");
      if (autoFlow) openFlow(subjectFromActivity(entry));
    } catch (e) {
      const m = (e as Error).message;
      setErr(m);
      toast("error", m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-narrow">
      <Card
        title="Beneficial-Ownership Threshold Proof"
        tag="AML / BFIU"
        hint="The cap table stays off-chain; only the threshold proof is anchored."
      >
        <div className="issuer-id">
          <span>Analyst</span>
          <Copy value={identityDID || "did:key:bfiu"} short />
        </div>
        <Field label="Company">
          <select value={companyDID} onChange={(e) => setCompanyDID(e.target.value)}>
            <option value="">Select a company…</option>
            {orgs.map((o) => (
              <option key={o.did} value={o.did}>{o.name}</option>
            ))}
          </select>
        </Field>
        <ErrorLine msg={dirErr} />
        {orgs.length === 0 && (
          <div className="empty" style={{ marginTop: 10 }}>
            <div className="empty-ico"><Icon name="building" size={28} /></div>
            No companies have registered yet — a company must first register from the login page.
          </div>
        )}
        <Field label="Threshold holds? (no owner &gt;25% sanctioned/PEP)">
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </Field>
        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reviewer note (off-chain)" />
        </Field>
        <Button onClick={prove} busy={busy} disabled={!companyDID}>Anchor Threshold Proof</Button>
        <ErrorLine msg={err} />
        {out && (
          <div className="result">
            <div className="result-row">
              <span>Threshold</span>
              <Badge status={out.thresholdOk ? "OK" : "REVOKED"} />
            </div>
            <div className="result-row"><span>Proof hash</span><Copy value={out.proofHash} short /></div>
            <p className="hint" style={{ margin: "6px 0 0" }}>
              Only this threshold proof was anchored. The full ownership structure was never published.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
