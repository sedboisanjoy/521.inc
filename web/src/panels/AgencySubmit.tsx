import { useEffect, useState } from "react";
import { api, type WorkerDir, type OrgDir, type WalletEntry, type AppRecord } from "../api";
import { useStore } from "../store";
import { Card, Field, Button, Copy, Badge, ErrorLine } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// Credential schemas that are internal §3.8 records, not attestable worker skills.
const INTERNAL_SCHEMAS = new Set(["ApplicationRecord", "MismatchAllegation", "AllegationResponse"]);

// Agency portal — the two-part application (§3.8). The agency selects an
// employer, a worker, the worker's already-anchored credentials to ATTEST
// (auto-verified, no agency risk), and then adds its own ASSERTED claims — the
// column where the agency stakes its standing. If an asserted claim contradicts
// an attested certificate, the backend flags it automatically (tier-1).
export function AgencySubmit() {
  const { identityDID, log, toast, openFlow, autoFlow } = useStore();
  const myDID = identityDID || "did:key:agency";

  const [companies, setCompanies] = useState<OrgDir[]>([]);
  const [workers, setWorkers] = useState<WorkerDir[]>([]);
  const [employerDID, setEmployerDID] = useState("");
  const [workerDID, setWorkerDID] = useState("");
  const [wallet, setWallet] = useState<WalletEntry[]>([]);
  const [attested, setAttested] = useState<Record<string, boolean>>({});

  // Asserted claims — the agency's own word.
  const [trade, setTrade] = useState("Welding");
  const [claimedLevel, setClaimedLevel] = useState(3);
  const [experienceYears, setExperienceYears] = useState(2);
  const [relocate, setRelocate] = useState(true);
  const [languages, setLanguages] = useState("Bangla, basic Arabic");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<AppRecord | null>(null);

  useEffect(() => {
    api.listOrgs("company").then(setCompanies).catch(() => setCompanies([]));
    api.listWorkers().then(setWorkers).catch(() => setWorkers([]));
  }, []);

  useEffect(() => {
    setAttested({});
    setWallet([]);
    if (workerDID) {
      api.wallet(workerDID)
        // Only real, attestable credentials belong here — hide the §3.8 internal
        // records (applications/allegations/responses) that also land in the wallet.
        .then((w) => setWallet(w.filter((e) => !INTERNAL_SCHEMAS.has(e.schemaId))))
        .catch(() => setWallet([]));
    }
  }, [workerDID]);

  const worker = workers.find((w) => w.did === workerDID);
  const company = companies.find((c) => c.did === employerDID);
  const chosenRefs = wallet.filter((e) => attested[e.credHash]).map((e) => e.credHash);

  async function submit() {
    setErr("");
    if (!employerDID || !workerDID) return setErr("Select both an employer and a worker.");
    setBusy(true);
    try {
      const app = await api.submitApplication({
        employerDID,
        employer: company?.name || "Company",
        agencyDID: myDID,
        workerDID,
        workerName: worker?.name || "Worker",
        attestedRefs: chosenRefs,
        asserted: {
          trade: trade.trim(),
          claimedLevel: Number(claimedLevel),
          experienceYears: Number(experienceYears),
          willingToRelocate: relocate,
          spokenLanguages: languages.trim(),
        },
      });
      setResult(app);
      const kind = app.contradiction ? "contradiction" : "application";
      const entry = log({
        kind,
        actor: "Agency",
        title: app.contradiction ? `Auto-flagged: ${app.id}` : `Application ${app.id} → ${company?.name || "employer"}`,
        detail: app.contradiction ? app.contradictionNote : app.appHash,
        ok: !app.contradiction,
      });
      if (app.contradiction) {
        toast("error", `Contradiction flagged — ${app.contradictionNote}`);
      } else {
        toast("success", `Application ${app.id} submitted`);
      }
      if (autoFlow) openFlow(subjectFromActivity(entry));
    } catch (e) {
      const m = (e as Error).message;
      setErr(m);
      toast("error", m);
    } finally {
      setBusy(false);
    }
  }

  // The agency attaches a credential as a POINTER — it must not see the private
  // claim values (the level, the score). Otherwise an honest agency would just
  // copy them and the asserted column could never be tested for honesty. So show
  // only the credential type; the real values stay sealed until the employer
  // verifies them on-chain.
  function schemaLabel(schemaId: string): string {
    const map: Record<string, string> = {
      "SkillCredential-v1": "Skill Certificate",
      EmploymentProof: "Employment Proof",
      WageEvent: "Wage Event",
      Endorsement: "Endorsement",
    };
    return map[schemaId] || schemaId;
  }

  return (
    <div className="panel-narrow">
      <Card
        title="Submit Application"
        tag="Attested + Asserted"
        hint="An application is two kinds of claim. Attested = pointers to the worker's anchored credentials (auto-verified, no agency risk). Asserted = your own word — this is the column your agency stakes its standing on."
      >
        <div className="row">
          <Field label="Employer">
            <select value={employerDID} onChange={(e) => setEmployerDID(e.target.value)}>
              <option value="">— Select an employer —</option>
              {companies.map((c) => (
                <option key={c.did} value={c.did}>{c.name} · {c.orgId}</option>
              ))}
            </select>
          </Field>
          <Field label="Worker">
            <select value={workerDID} onChange={(e) => setWorkerDID(e.target.value)}>
              <option value="">— Select a worker —</option>
              {workers.map((w) => (
                <option key={w.did} value={w.did}>{w.name} · {w.workerId}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="attested-block">
          <div className="col-tag col-tag-attested"><Icon name="check" size={14} /> Attested — proven, no agency risk</div>
          {!workerDID ? (
            <span className="field-hint">Select a worker to load their anchored credentials.</span>
          ) : wallet.length === 0 ? (
            <span className="field-hint">This worker holds no anchored credentials yet.</span>
          ) : (
            <div className="dir-list">
              {wallet.map((e) => (
                <label key={e.credHash} className="check-row">
                  <input
                    type="checkbox"
                    checked={!!attested[e.credHash]}
                    onChange={(ev) => setAttested((a) => ({ ...a, [e.credHash]: ev.target.checked }))}
                  />
                  <span className="check-main">
                    <strong>{schemaLabel(e.schemaId)}</strong>
                    <span className="check-sub">anchored credential · values sealed until verified</span>
                  </span>
                  <Badge status={e.anchor?.status || "UNKNOWN"} />
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="asserted-block">
          <div className="col-tag col-tag-asserted"><Icon name="pen" size={14} /> Asserted — your word, staked on your standing</div>
          <div className="row">
            <Field label="Trade">
              <input value={trade} onChange={(e) => setTrade(e.target.value)} />
            </Field>
            <Field label="Claimed level" hint="Above the attested certificate → auto-contradiction">
              <input type="number" min={1} max={5} value={claimedLevel} onChange={(e) => setClaimedLevel(Number(e.target.value))} />
            </Field>
          </div>
          <div className="row">
            <Field label="Informal experience (years)">
              <input type="number" min={0} max={40} value={experienceYears} onChange={(e) => setExperienceYears(Number(e.target.value))} />
            </Field>
            <Field label="Willing to relocate">
              <select value={relocate ? "yes" : "no"} onChange={(e) => setRelocate(e.target.value === "yes")}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
          </div>
          <Field label="Spoken languages">
            <input value={languages} onChange={(e) => setLanguages(e.target.value)} />
          </Field>
        </div>

        <Button onClick={submit} busy={busy} disabled={!employerDID || !workerDID}>Submit application</Button>
        <ErrorLine msg={err} />

        {result && (
          <div className={`result ${result.contradiction ? "verdict-no" : ""}`} style={{ marginTop: 10 }}>
            <div className="result-row"><span>Application</span><strong>{result.id}</strong></div>
            <div className="result-row"><span>Anchor</span><Copy value={result.appHash} short /></div>
            <div className="result-row"><span>Attested refs</span><strong>{result.attestedRefs.length}</strong></div>
            {result.contradiction ? (
              <div className="verdict verdict-no" style={{ marginTop: 8 }}>
                <span className="verdict-ico">✕</span>
                <div>
                  <div className="verdict-title">Automatic contradiction</div>
                  <div className="verdict-sub">{result.contradictionNote} — flagged against anchored data, standing slashed immediately.</div>
                </div>
              </div>
            ) : (
              <p className="hint" style={{ margin: "6px 0 0" }}>
                Submitted. The employer sees proven claims and your asserted claims side by side — and can allege a mismatch if your word does not hold up.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
