import { useEffect, useState } from "react";
import { api, type ContractEntry } from "../api";
import { useStore } from "../store";
import { Card, Field, Button, ErrorLine, Copy, ContractStepper } from "../ui";

// Company — draft an employment contract for a hired worker and approve it once
// the worker has signed (WORKER_SIGNED → SIGNED). A draft is normally seeded
// from the Hire action on the Applicants screen.
export function EmployerContracts() {
  const { identityDID, contractDraft, setContractDraft, log, toast } = useStore();
  const myDID = identityDID || "did:key:employer";

  const [workerDID, setWorkerDID] = useState("");
  const [employer, setEmployer] = useState("SaudiCo Ltd");
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
  useEffect(() => { load(); }, [myDID]); // eslint-disable-line react-hooks/exhaustive-deps

  async function draft() {
    if (!workerDID.trim()) return toast("error", "A worker DID is required.");
    setBusy(true);
    try {
      const r = await api.createContract({
        workerDID: workerDID.trim(), employerDID: myDID, employer,
        position, salary: Number(salary), currency, term, jobId,
      });
      log({ kind: "contract", actor: "Company", title: `Drafted contract · ${position}`, detail: r.contractHash, ok: true });
      toast("success", "Contract drafted — sent to the worker to sign");
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
      log({ kind: "approve", actor: "Company", title: `Approved contract · ${c.position}`, detail: c.contractHash, ok: true });
      toast("success", "Contract approved & anchored SIGNED");
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
        title="Draft a Contract"
        tag="UC3 · CreateContract"
        hint="Draft an offer for a hired worker. Only a salted hash of the terms goes on-chain; the worker signs, then you approve."
      >
        <Field label="Worker DID" hint={workerDID ? undefined : "Hire an applicant to prefill this, or paste a DID."}>
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
        <Button onClick={draft} busy={busy} disabled={!workerDID.trim()}>Draft &amp; anchor</Button>
        <ErrorLine msg={err} />
      </Card>

      <Card title="Your Contracts" tag={`${contracts.length}`} hint="Contracts you've drafted and their signing progress. Approve once the worker has signed.">
        {contracts.length === 0 ? (
          <div className="empty">
            <div className="empty-ico">📑</div>
            No contracts yet — draft one for a hired worker.
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
                    <Button onClick={() => approve(c)} busy={busyApprove === c.contractHash}>Approve &amp; finalise</Button>
                  )}
                  {status === "PENDING" && <div className="hint" style={{ marginTop: 12 }}>Awaiting the worker's signature.</div>}
                  {status === "SIGNED" && <div className="job-applied" style={{ marginTop: 12 }}>✓ SIGNED &amp; anchored</div>}
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
