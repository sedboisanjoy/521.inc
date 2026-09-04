import { useState, useEffect } from "react";
import { api, type WageEntry } from "../api";
import { useStore } from "../store";
import { Card, Button, Badge, Copy } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// Bank — co-signing desk. A wage record is only trustworthy when BOTH the payer
// (employer) and an independent bank have signed it. This panel lists every
// wage event still awaiting the bank's counter-signature.
export function BankWages() {
  const { identityDID, log, toast, openFlow, autoFlow } = useStore();
  const bankDID = identityDID || "did:key:bank";

  const [pending, setPending] = useState<WageEntry[]>([]);
  const [busy, setBusy] = useState<string>("");

  async function load() {
    try {
      setPending(await api.pendingWages());
    } catch {
      /* keep last known */
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  async function cosign(ev: WageEntry) {
    setBusy(ev.credHash);
    try {
      await api.cosignWageEvent({ credHash: ev.credHash, bankDID });
      const entry = log({ kind: "wage_cosign", actor: "Bank", title: `Wage event co-signed`, detail: ev.credHash, ok: true });
      toast("success", "Wage event confirmed (employer + bank)");
      if (autoFlow) openFlow(subjectFromActivity(entry));
      load();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <Card
      title="Co-sign Wage Events"
      tag="Employer + Bank"
      hint="A wage record needs the payer AND an independent bank to co-sign before it can be trusted. Co-sign the events below to turn them into confirmed salary history."
    >
      <div className="dir-head" style={{ marginBottom: 8 }}>
        <span className="hint" style={{ margin: 0 }}>{pending.length} awaiting co-sign · auto-refreshing</span>
        <button className="dir-refresh" onClick={load} title="Refresh">↻ Refresh</button>
      </div>
      {pending.length === 0 ? (
        <div className="empty">
          <div className="empty-ico"><Icon name="wage" size={28} /></div>
          No wage events awaiting co-sign.
        </div>
      ) : (
        <div className="job-list">
          {pending.map((ev) => {
            const c = ev.claims as { amount?: number; currency?: string; month?: string; employer?: string };
            return (
              <article key={ev.credHash} className="applicant">
                <div className="result-row"><span>Worker</span><Copy value={ev.workerDID || ""} short /></div>
                <div className="result-row"><span>Employer</span><span>{c.employer}</span></div>
                <div className="result-row"><span>Amount</span><strong>{c.amount} {c.currency || "BDT"}</strong></div>
                <div className="result-row"><span>Month</span><span>{c.month}</span></div>
                <div className="result-row"><span>Status</span><Badge status="UNKNOWN" /> <span className="mono">PENDING_BANK</span></div>
                <div className="applicant-actions">
                  <Button onClick={() => cosign(ev)} busy={busy === ev.credHash}>Co-sign</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}
