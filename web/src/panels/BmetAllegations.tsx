import { useCallback, useEffect, useState } from "react";
import { api, type Allegation } from "../api";
import { useStore } from "../store";
import { Card, Button, Badge, Copy } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// BMET portal — resolving mismatch allegations (§3.8). No party can move an
// agency's standing alone: a standing adjustment needs a regulator AND an
// independent observer (2-of-2). Only on the full pair does an upheld allegation
// slash standing. (Honest caveat: the 2-of-2 is enforced by the app here — two
// genuine distinct signatures — rather than by a live Fabric endorsement policy.)
export function BmetAllegations() {
  const { log, toast, openFlow, autoFlow } = useStore();
  const [items, setItems] = useState<Allegation[]>([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try { setItems(await api.listAllegations("all")); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function endorse(a: Allegation, by: "regulator" | "observer", outcome?: string) {
    setBusy(a.id + by);
    try {
      const r = await api.endorseAllegation(a.id, { by, outcome });
      const resolved = r.allegation.status === "upheld" || r.allegation.status === "dismissed";
      const entry = log({
        kind: resolved ? "resolve" : "respond",
        actor: "BMET",
        title: resolved ? `${r.allegation.status.toUpperCase()}: ${a.agency} (${a.claim})` : `${by} signed ${a.id}`,
        detail: a.allegationHash,
        ok: r.allegation.status !== "upheld",
      });
      toast(resolved ? "success" : "info", resolved ? `Resolved: ${r.allegation.status} · standing ${r.score}/100` : `${by} signature recorded`);
      if (autoFlow && resolved) openFlow(subjectFromActivity(entry));
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function closeWindow(a: Allegation) {
    setBusy(a.id + "close");
    try {
      const r = await api.closeAllegationWindow(a.id);
      const entry = log({ kind: "resolve", actor: "BMET", title: `Uncontested: ${a.agency} (${a.claim})`, detail: a.allegationHash, ok: false });
      toast("success", `Window closed — uncontested · standing ${r.score}/100`);
      if (autoFlow) openFlow(subjectFromActivity(entry));
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const pending = items.filter((a) => a.status === "open" || a.status === "responded");
  const resolved = items.filter((a) => a.status === "upheld" || a.status === "dismissed" || a.status === "uncontested");
  const pastDeadline = (a: Allegation) => Date.now() / 1000 > a.responseDeadline;

  function Row({ a }: { a: Allegation }) {
    const done = a.status === "upheld" || a.status === "dismissed" || a.status === "uncontested";
    return (
      <article className="applicant">
        <div className="job-head">
          <div>
            <div className="job-title">{a.id} · {a.agency}</div>
            <div className="job-company">disputes “{a.claim}” — {a.detail}</div>
          </div>
          <Badge status={a.status === "open" || a.status === "responded" ? "PENDING" : a.status.toUpperCase()} />
        </div>
        <div className="result-row"><span>Application</span><Copy value={a.applicationId} short /></div>
        <div className="result-row"><span>Anchor</span><Copy value={a.allegationHash} short /></div>
        {!done && (
          <>
            <div className="endorse-row">
              <span className={`sig-pill ${a.regulatorOK ? "sig-on" : ""}`}>{a.regulatorOK ? "✓" : "○"} Regulator</span>
              <span className={`sig-pill ${a.observerOK ? "sig-on" : ""}`}>{a.observerOK ? "✓" : "○"} Observer</span>
            </div>
            <div className="applicant-actions">
              <Button variant="danger" onClick={() => endorse(a, "regulator", "upheld")} busy={busy === a.id + "regulator"} disabled={a.regulatorOK}>Regulator: uphold</Button>
              <Button variant="ghost" onClick={() => endorse(a, "observer", "upheld")} busy={busy === a.id + "observer"} disabled={a.observerOK}>Observer: co-sign</Button>
              {a.status === "open" && pastDeadline(a) && (
                <Button variant="ghost" onClick={() => closeWindow(a)} busy={busy === a.id + "close"}>Close window (unanswered)</Button>
              )}
            </div>
            <p className="hint" style={{ margin: "4px 0 0" }}>
              Standing moves only on the full 2-of-2. Enforced by the app here (two real signatures), not yet by a live Fabric endorsement policy.
            </p>
          </>
        )}
        {done && a.outcome && (
          <div className="result-row"><span>Outcome</span><strong>{a.status}</strong></div>
        )}
      </article>
    );
  }

  return (
    <Card title="Allegations" tag="Regulator + Observer (2-of-2)"
      hint="A worker's or employer's allegation is anchored as an allegation, not a finding. It becomes a finding — and moves standing — only after the response window and a regulator + observer dual sign-off.">
      <div className="dir-head" style={{ marginBottom: 8 }}>
        <span className="hint">{pending.length} awaiting resolution</span>
        <button className="dir-refresh" onClick={load}>↻ Refresh</button>
      </div>
      {pending.length === 0 ? (
        <div className="empty"><div className="empty-ico"><Icon name="gavel" size={28} /></div>No allegations awaiting resolution.</div>
      ) : (
        <div className="job-list">{pending.map((a) => <Row key={a.id} a={a} />)}</div>
      )}

      {resolved.length > 0 && (
        <>
          <div className="section-sep">Resolved</div>
          <div className="job-list">{resolved.map((a) => <Row key={a.id} a={a} />)}</div>
        </>
      )}
    </Card>
  );
}
