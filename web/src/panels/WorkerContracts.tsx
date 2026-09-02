import { useEffect, useState } from "react";
import { api, type ContractEntry } from "../api";
import { useStore } from "../store";
import { Card, Button, ErrorLine, Copy, ContractStepper } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity, subjectFromRecord } from "../flow";

// Worker — the contract inbox. Review the terms an employer drafted and sign
// (PENDING → WORKER_SIGNED). The exact terms are read from the off-chain body;
// the ledger holds only the hash + status, so nothing can be swapped later.
export function WorkerContracts() {
  const { identityDID, session, log, toast, openFlow, autoFlow } = useStore();
  const myDID = identityDID || session.did || "";

  const [contracts, setContracts] = useState<ContractEntry[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    setErr("");
    try {
      setContracts(await api.listContractsBy(myDID));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    if (myDID) load();
  }, [myDID]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sign(c: ContractEntry) {
    setBusy(c.contractHash);
    try {
      await api.signContract({ contractHash: c.contractHash, workerDID: myDID });
      const entry = log({ kind: "sign", actor: "Worker", title: `Contract Signed · ${c.position}`, detail: c.contractHash, ok: true });
      toast("success", "Contract signed — sent back to the company");
      if (autoFlow) openFlow(subjectFromActivity(entry));
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <Card
      title="My Contracts"
      tag="Read & Sign"
      hint="Companies create contracts here. Read the terms carefully and sign — a signed contract is stored permanently on the blockchain, so no one can hand you a different contract once you're abroad."
    >
      <ErrorLine msg={err} />
      {contracts.length === 0 ? (
        <div className="empty">
          <div className="empty-ico"><Icon name="document" size={28} /></div>
          No contracts yet — when a company hires you, the contract offer will appear here.
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
                    <div className="job-company">{c.employer}</div>
                  </div>
                  <div className="job-wage">{c.salary.toLocaleString()} <span>{c.currency}</span></div>
                </div>
                <div className="contract-terms">
                  <span className="claim"><span className="claim-k">Term</span><span className="claim-v">{c.term}</span></span>
                </div>
                <ContractStepper status={status} />
                <div className="result-row"><span>Contract Hash</span><Copy value={c.contractHash} short /></div>
                {status === "PENDING" && (
                  <Button onClick={() => sign(c)} busy={busy === c.contractHash}>Read & Sign</Button>
                )}
                {status === "WORKER_SIGNED" && <div className="hint" style={{ marginTop: 12 }}>Signed ✓ — awaiting company approval.</div>}
                {status === "SIGNED" && <div className="job-applied" style={{ marginTop: 12 }}>✓ Fully signed & recorded</div>}
                <button className="flow-link-btn" onClick={() => openFlow(subjectFromRecord("contract", c))}>
                  <Icon name="flow" size={14} /> View Data Flow
                </button>
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}
