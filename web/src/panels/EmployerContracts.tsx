import { useEffect, useState } from "react";
import { api, type ContractEntry } from "../api";
import { useStore } from "../store";
import { Card, Field, Button, ErrorLine, Copy, ContractStepper } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity, subjectFromRecord } from "../flow";

// Company — draft an employment contract for a hired worker and approve it once
// the worker has signed (WORKER_SIGNED → SIGNED). A draft is normally seeded
// from the Hire action on the Applicants screen.
export function EmployerContracts() {
  const { identityDID, session, contractDraft, setContractDraft, log, toast, openFlow, autoFlow } = useStore();
  const myDID = identityDID || "did:key:employer";

  const [workerDID, setWorkerDID] = useState("");
  const [employer, setEmployer] = useState(session.orgName || "Company");
  const [position, setPosition] = useState("Welder");
  const [salary, setSalary] = useState(2000);
  const [currency, setCurrency] = useState("SAR");
  const [term, setTerm] = useState("2 years");
  const [jobId, setJobId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [contracts, setContracts] = useState<ContractEntry[]>([]);
  const [busyApprove, setBusyApprove] = useState("");

  // Consume a draft handed over from the Hire action, then clear it.
  useEffect(() => {
    if (contractDraft) {
      setWorkerDID(contractDraft.workerDID);
      setEmployer(contractDraft.employer);
      setPosition(contractDraft.position);
      setSalary(contractDraft.salary);
      setCurrency(contractDraft.currency);
      setJobId(contractDraft.jobId);
      setContractDraft(null);
    }
  }, [contractDraft, setContractDraft]);

  async function load() {
    setErr("");
    try {
      setContracts(await api.listContractsBy(myDID));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  // Poll so a worker's signature (done in their own session) surfaces here and
  // the "approve" button appears without a manual reload.
  useEffect(() => {
    load();
    const iv = setInterval(load, 4000);
    return () => clearInterval(iv);
  }, [myDID]); // eslint-disable-line react-hooks/exhaustive-deps

  async function draft() {
    if (!workerDID.trim()) return toast("error", "Enter the Worker ID.");
    setBusy(true);
    try {
      const r = await api.createContract({
        workerDID: workerDID.trim(), employerDID: myDID, employer,
        position, salary: Number(salary), currency, term, jobId,
      });
      const entry = log({ kind: "contract", actor: "Company", title: `Contract Created · ${position}`, detail: r.contractHash, ok: true });
      toast("success", "Contract created — sent to the worker for signing");
      if (autoFlow) openFlow(subjectFromActivity(entry));
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function approve(c: ContractEntry) {
    setBusyApprove(c.contractHash);
    try {
      await api.approveContract({ contractHash: c.contractHash, employerDID: myDID });
      const entry = log({ kind: "approve", actor: "Company", title: `Contract Approved · ${c.position}`, detail: c.contractHash, ok: true });
      toast("success", "Contract approved and recorded");
      if (autoFlow) openFlow(subjectFromActivity(entry));
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusyApprove("");
    }
  }

  return (
    <div className="panel-grid">
      <Card
        title="Create a Contract"
        tag="New Contract"
        hint="Draft a contract offer for a hired worker. Only a secret hash of the terms goes on the blockchain; the worker signs, then you approve."
      >
        <Field label="Worker ID" hint={workerDID ? undefined : "This fills in automatically when you hire an applicant."}>
          <input value={workerDID} onChange={(e) => setWorkerDID(e.target.value)} placeholder="did:key:worker:…" />
        </Field>
        <Field label="Position">
          <input value={position} onChange={(e) => setPosition(e.target.value)} />
        </Field>
        <div className="row">
          <Field label="Salary">
            <input type="number" value={salary} onChange={(e) => setSalary(Number(e.target.value))} />
          </Field>
          <Field label="Currency">
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </Field>
          <Field label="Term">
            <input value={term} onChange={(e) => setTerm(e.target.value)} />
          </Field>
        </div>
        <Button onClick={draft} busy={busy} disabled={!workerDID.trim()}>Create Contract</Button>
        <ErrorLine msg={err} />
      </Card>

      <Card title="Your Contracts" tag={`${contracts.length}`} hint="The contracts you've created and their signing progress. Approve once the worker signs.">
        <div className="dir-head" style={{ marginBottom: 10 }}>
          <span className="field-hint" style={{ margin: 0 }}>Updates automatically every 4 seconds</span>
          <button className="dir-refresh" onClick={load}>↻ Refresh</button>
        </div>
        {contracts.length === 0 ? (
          <div className="empty">
            <div className="empty-ico"><Icon name="document" size={28} /></div>
            No contracts yet — create one for a hired worker.
          </div>
        ) : (
          <div className="job-list">
            {contracts.map((c) => {
              const status = c.anchor?.status || "PENDING";
              return (
                <article key={c.contractHash} className="contract">
                  <div className="job-head">
                    <div>
                      <div className="job-title">{c.position}</div>
                      <div className="job-company">{c.salary.toLocaleString()} {c.currency} · {c.term}</div>
                    </div>
                  </div>
                  <div className="result-row"><span>Worker</span><Copy value={c.workerDID} short /></div>
                  <ContractStepper status={status} />
                  {status === "WORKER_SIGNED" && (
                    <Button onClick={() => approve(c)} busy={busyApprove === c.contractHash}>Approve</Button>
                  )}
                  {status === "PENDING" && <div className="hint" style={{ marginTop: 12 }}>Awaiting the worker's signature.</div>}
                  {status === "SIGNED" && <div className="job-applied" style={{ marginTop: 12 }}>✓ Completed & recorded</div>}
                  <button className="flow-link-btn" onClick={() => openFlow(subjectFromRecord("contract", c))}>
                    <Icon name="flow" size={14} /> View Data Flow
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
