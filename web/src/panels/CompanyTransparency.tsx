import { useState, useEffect } from "react";
import { api, type Digest, type Reconciliation } from "../api";
import { useStore } from "../store";
import { Card, Field, Button, ErrorLine } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// Employer portal — a company's public transparency view. It surfaces the
// verified-review digest and reconciles the wage bill the company discloses
// against the sum of CONFIRMED (employer + bank co-signed) wage events on-chain.
export function CompanyTransparency() {
  const { identityDID, session, log, toast, openFlow, autoFlow } = useStore();
  const actor = "Company";
  const myDID = identityDID || "did:key:employer";
  const companyName = session.orgName || "Company";

  const [digest, setDigest] = useState<Digest | null>(null);
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [amount, setAmount] = useState(0);
  const [busyDisc, setBusyDisc] = useState(false);
  const [errDisc, setErrDisc] = useState("");

  async function loadAll() {
    setErr("");
    setBusy(true);
    try {
      const [d, r] = await Promise.all([api.companyDigest(myDID), api.reconciliation(myDID)]);
      setDigest(d);
      setRecon(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { loadAll(); }, []);

  async function disclose() {
    setErrDisc("");
    setBusyDisc(true);
    try {
      await api.discloseWageBill(myDID, Number(amount));
      const entry = log({ kind: "wagebill", actor, title: `Wage bill disclosed: ${amount}`, detail: myDID, ok: true });
      toast("success", "Wage bill disclosed");
      if (autoFlow) openFlow(subjectFromActivity(entry));
      setRecon(await api.reconciliation(myDID));
    } catch (e) {
      const m = (e as Error).message;
      setErrDisc(m);
      toast("error", m);
    } finally {
      setBusyDisc(false);
    }
  }

  return (
    <div className="panel-grid">
      <Card
        title="Transparency digest"
        tag={companyName}
        hint="An aggregate of verified-anonymous reviews from confirmed employees. Individual reviews stay private; only the digest is public."
      >
        <div className="issuer-id">
          <span>Company</span>
          <button className="dir-refresh" onClick={loadAll} title="Refresh">↻ Refresh</button>
        </div>
        <ErrorLine msg={err} />
        {digest ? (
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-ico"><Icon name="users" size={20} /></div>
              <div className="stat-val">{digest.reviewers}</div>
              <div className="stat-label">reviewers</div>
            </div>
            <div className="stat">
              <div className="stat-ico"><Icon name="review" size={20} /></div>
              <div className="stat-val">{digest.recommendPct}%</div>
              <div className="stat-label">recommend</div>
            </div>
            <div className="stat">
              <div className="stat-ico"><Icon name="alert" size={20} /></div>
              <div className="stat-val">{digest.openConduct}</div>
              <div className="stat-label">open conduct findings</div>
            </div>
            <div className="stat">
              <div className="stat-ico"><Icon name="wage" size={20} /></div>
              <div className="stat-val">{digest.wageEvents}</div>
              <div className="stat-label">wage events</div>
            </div>
          </div>
        ) : !busy ? (
          <div className="empty" style={{ marginTop: 10 }}>
            <div className="empty-ico"><Icon name="chart" size={28} /></div>
            No transparency data yet.
          </div>
        ) : null}
      </Card>

      <Card
        title="Wage-bill reconciliation"
        tag="Accountability"
        hint="Disclose your total wage bill. It is reconciled against the sum of CONFIRMED wage events — those independently co-signed by both the employer and the bank."
      >
        <Field label="Disclosed wage bill">
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Button onClick={disclose} busy={busyDisc}>Disclose</Button>
        <ErrorLine msg={errDisc} />
        {recon && (
          <div className="result">
            <div className="result-row"><span>Disclosed</span><strong>{recon.disclosed}</strong></div>
            <div className="result-row"><span>Anchored (CONFIRMED)</span><strong>{recon.anchored}</strong></div>
            <div className="result-row">
              <span>Status</span>
              <span className={`badge ${recon.reconciled ? "active" : "unknown"}`}>
                {recon.reconciled ? "Reconciled" : "Mismatch"}
              </span>
            </div>
            <p className="hint" style={{ margin: "6px 0 0" }}>
              {recon.reconciled
                ? "Reconciled — the disclosed wage bill matches the on-chain CONFIRMED wage events."
                : "Mismatch — the disclosed wage bill does not match the on-chain CONFIRMED wage events."}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
