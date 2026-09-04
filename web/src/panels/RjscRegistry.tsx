import { useState, useEffect } from "react";
import { api, type OrgDir } from "../api";
import { useStore } from "../store";
import { Card, Field, Button, Copy, ErrorLine } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// RJSC portal — the corporate registry. It attests a company's legal existence
// on-chain (Company Registration) and anchors publicly-verifiable procurement
// awards, each carrying an off-chain conflict-of-interest check result.
export function RjscRegistry() {
  const { identityDID, log, toast, openFlow, autoFlow } = useStore();
  const actor = "RJSC";

  const [orgs, setOrgs] = useState<OrgDir[]>([]);
  const [dirErr, setDirErr] = useState("");

  // Section (a) — Company Registration
  const [regDID, setRegDID] = useState("");
  const [legalName, setLegalName] = useState("");
  const [regNo, setRegNo] = useState("");
  const [regOut, setRegOut] = useState<{ credHash: string } | null>(null);
  const [busyReg, setBusyReg] = useState(false);
  const [errReg, setErrReg] = useState("");

  // Section (b) — Procurement Award
  const [procDID, setProcDID] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState(0);
  const [conflict, setConflict] = useState("Yes");
  const [procOut, setProcOut] = useState<{ credHash: string; conflictHash: string } | null>(null);
  const [busyProc, setBusyProc] = useState(false);
  const [errProc, setErrProc] = useState("");

  async function loadOrgs() {
    setDirErr("");
    try {
      setOrgs(await api.listOrgs("company"));
    } catch (e) {
      setDirErr((e as Error).message);
    }
  }
  useEffect(() => { loadOrgs(); }, []);

  const regOrg = orgs.find((o) => o.did === regDID);
  const procOrg = orgs.find((o) => o.did === procDID);

  async function registerCompany() {
    if (!regOrg) return;
    setErrReg("");
    setBusyReg(true);
    try {
      const r = await api.registerCompanyOnChain({ companyDID: regOrg.did, legalName: legalName.trim(), regNo: regNo.trim() });
      setRegOut(r);
      const entry = log({ kind: "company_reg", actor, title: `Company registered: ${legalName || regOrg.name}`, detail: r.credHash, ok: true });
      toast("success", "Company registered on-chain");
      if (autoFlow) openFlow(subjectFromActivity(entry));
    } catch (e) {
      const m = (e as Error).message;
      setErrReg(m);
      toast("error", m);
    } finally {
      setBusyReg(false);
    }
  }

  async function awardProcurement() {
    if (!procOrg) return;
    setErrProc("");
    setBusyProc(true);
    try {
      const r = await api.anchorProcurement({ companyDID: procOrg.did, title: title.trim(), amount: Number(amount), conflictOk: conflict === "Yes" });
      setProcOut(r);
      const entry = log({ kind: "procurement", actor, title: `Procurement award: ${title}`, detail: r.credHash, ok: true });
      toast("success", "Procurement award anchored on-chain");
      if (autoFlow) openFlow(subjectFromActivity(entry));
    } catch (e) {
      const m = (e as Error).message;
      setErrProc(m);
      toast("error", m);
    } finally {
      setBusyProc(false);
    }
  }

  return (
    <div className="panel-grid">
      <Card
        title="Company Registration"
        tag="Corporate identity"
        hint="RJSC attests a company's legal existence on-chain. Only a registration credential hash is anchored — the registry record stays authoritative off-chain."
      >
        <div className="issuer-id">
          <span>Registrar</span>
          <Copy value={identityDID || "did:key:rjsc"} short />
        </div>
        <Field label="Company">
          <select
            value={regDID}
            onChange={(e) => {
              const did = e.target.value;
              setRegDID(did);
              const o = orgs.find((x) => x.did === did);
              if (o) setLegalName(o.name);
            }}
          >
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
        <Field label="Legal name">
          <input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Registered legal name" />
        </Field>
        <Field label="Registration number">
          <input value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="e.g. C-123456" />
        </Field>
        <Button onClick={registerCompany} busy={busyReg} disabled={!regDID}>Register Company</Button>
        <ErrorLine msg={errReg} />
        {regOut && (
          <div className="result">
            <div className="result-row"><span>Registration hash</span><Copy value={regOut.credHash} short /></div>
          </div>
        )}
      </Card>

      <Card
        title="Procurement Award"
        tag="Public procurement"
        hint="Anchor a publicly-verifiable procurement award. The conflict-of-interest check is performed off-chain; only its result is committed alongside the award."
      >
        <Field label="Company">
          <select value={procDID} onChange={(e) => setProcDID(e.target.value)}>
            <option value="">Select a company…</option>
            {orgs.map((o) => (
              <option key={o.did} value={o.did}>{o.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Award title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Road works — Phase 2" />
        </Field>
        <Field label="Amount">
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="Conflict check passed?">
          <select value={conflict} onChange={(e) => setConflict(e.target.value)}>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </Field>
        <Button onClick={awardProcurement} busy={busyProc} disabled={!procDID}>Anchor Award</Button>
        <ErrorLine msg={errProc} />
        {procOut && (
          <div className="result">
            <div className="result-row"><span>Award hash</span><Copy value={procOut.credHash} short /></div>
            <div className="result-row"><span>Conflict-check hash</span><Copy value={procOut.conflictHash} short /></div>
          </div>
        )}
      </Card>
    </div>
  );
}
