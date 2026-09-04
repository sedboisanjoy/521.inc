import { useState } from "react";
import { api, type MatchResult } from "../api";
import { useStore } from "../store";
import { Card, Field, Button, Copy, ErrorLine } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// Company portal — privacy-preserving matching. The employer states the
// requirements it cares about (trade, minimum level, clean conduct) and gets
// back only the DIDs that satisfy that predicate. It never sees the underlying
// certificate claims: workers prove they match through selective disclosure,
// so no private skill data is exposed just to be shortlisted.
export function EmployerSearch() {
  const { log, toast, openFlow, autoFlow } = useStore();

  const [trade, setTrade] = useState("Welding");
  const [minLevel, setMinLevel] = useState(3);
  const [noConduct, setNoConduct] = useState(true);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function search() {
    setErr("");
    setBusy(true);
    try {
      const r = await api.match({ trade: trade.trim(), minLevel: Number(minLevel), noConduct });
      setResult(r);
      setSearched(true);
      const entry = log({ kind: "match", actor: "Company", title: `Match: ${r.count} worker(s)`, detail: r.predicate || `${r.count} matches`, ok: true });
      toast("success", `${r.count} worker(s) satisfy the predicate`);
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
        title="Find Workers"
        tag="Privacy-Preserving Match"
        hint="Only DIDs that satisfy your predicate are returned. You never see the underlying certificate claims — workers prove they qualify through selective disclosure, keeping their private data off your desk."
      >
        <Field label="Trade / skill required">
          <input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. Welding" />
        </Field>
        <div className="row">
          <Field label="Minimum skill level">
            <input type="number" min={1} max={5} value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))} />
          </Field>
          <Field label="Require clean conduct record">
            <select value={noConduct ? "yes" : "no"} onChange={(e) => setNoConduct(e.target.value === "yes")}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
        </div>

        <Button onClick={search} busy={busy} disabled={!trade.trim()}>Search</Button>
        <ErrorLine msg={err} />

        {result && (
          <div className="result">
            <div className="result-row"><span>Predicate</span><span className="mono">{result.predicate}</span></div>
            <div className="result-row"><span>Matches</span><strong>{result.count}</strong></div>
            {result.count === 0 ? (
              <div className="empty" style={{ marginTop: 10 }}>
                <div className="empty-ico"><Icon name="users" size={28} /></div>
                No workers match this predicate.
              </div>
            ) : (
              <div className="dir-list" style={{ marginTop: 10 }}>
                {result.matches.map((did) => (
                  <div key={did} className="result-row">
                    <span>Worker</span>
                    <Copy value={did} short />
                  </div>
                ))}
              </div>
            )}
            <p className="hint" style={{ margin: "6px 0 0" }}>
              These DIDs proved they satisfy the predicate without revealing their actual certificate claims to you.
            </p>
          </div>
        )}

        {searched && !result && (
          <div className="empty" style={{ marginTop: 10 }}>
            <div className="empty-ico"><Icon name="users" size={28} /></div>
            No workers match this predicate.
          </div>
        )}
      </Card>
    </div>
  );
}
