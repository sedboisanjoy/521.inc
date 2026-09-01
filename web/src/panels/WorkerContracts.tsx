import { useEffect, useState } from "react";
import { api, type ContractEntry } from "../api";
import { useStore } from "../store";
import { Card, Button, ErrorLine, Copy, ContractStepper } from "../ui";

// Worker — the contract inbox. Review the terms an employer drafted and sign
// (PENDING → WORKER_SIGNED). The exact terms are read from the off-chain body;
// the ledger holds only the hash + status, so nothing can be swapped later.
export function WorkerContracts() {
  const { identityDID, session, log, toast } = useStore();
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
      log({ kind: "sign", actor: "Worker", title: `Signed contract · ${c.position}`, detail: c.contractHash, ok: true });
      toast("success", "Contract signed — sent back to the employer");
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
      tag="UC3 · review & sign"
      hint="Employers draft contracts here. Read the exact terms and sign — the signed version is anchored immutably, so no one can hand you a worse contract on arrival."
    >
      <ErrorLine msg={err} />
      {contracts.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">📄</div>
          No contracts yet — once a company hires you, the offer appears here.
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
                    <div className="job-company">🏢 {c.employer}</div>
                  </div>
                  <div className="job-wage">{c.salary.toLocaleString()} <span>{c.currency}</span></div>
                </div>
                <div className="contract-terms">
                  <span className="claim"><span className="claim-k">term</span><span className="claim-v">{c.term}</span></span>
                  <span className="claim"><span className="claim-k">employer DID</span><span className="claim-v mono">{c.employerDID.slice(0, 16)}…</span></span>
                </div>
                <ContractStepper status={status} />
                <div className="result-row"><span>Contract hash</span><Copy value={c.contractHash} short /></div>
                {status === "PENDING" && (
                  <Button onClick={() => sign(c)} busy={busy === c.contractHash}>Review &amp; sign</Button>
                )}
                {status === "WORKER_SIGNED" && <div className="hint" style={{ marginTop: 12 }}>Signed ✓ — awaiting employer approval.</div>}
                {status === "SIGNED" && <div className="job-applied" style={{ marginTop: 12 }}>✓ Fully signed &amp; anchored</div>}
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}
