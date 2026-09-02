import { useEffect, useState } from "react";
import { api, type WalletEntry, type WorkerDir, type OrgDir, type ContractEntry } from "../api";
import { useStore } from "../store";
import { Card } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity, subjectFromRecord } from "../flow";

type Seg = "recent" | "cert" | "worker" | "org" | "contract";

const SEGS: { id: Seg; label: string; icon: string }[] = [
  { id: "recent", label: "Recent Transactions", icon: "grid" },
  { id: "cert", label: "Certificates", icon: "certificate" },
  { id: "worker", label: "Workers", icon: "worker" },
  { id: "org", label: "Organizations", icon: "building" },
  { id: "contract", label: "Contracts", icon: "document" },
];

// "Any single entry" picker — feed a real record (or a past operation) to the
// flow player and watch how it travels the network and is validated.
export function FlowExplorer() {
  const { activity, openFlow, identityDID, session } = useStore();
  const myDID = identityDID || session.did || "";

  const [seg, setSeg] = useState<Seg>("recent");
  const [certs, setCerts] = useState<WalletEntry[]>([]);
  const [workers, setWorkers] = useState<WorkerDir[]>([]);
  const [orgs, setOrgs] = useState<OrgDir[]>([]);
  const [contracts, setContracts] = useState<ContractEntry[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    setErr("");
    (async () => {
      try {
        if (seg === "worker") setWorkers(await api.listWorkers());
        else if (seg === "org") setOrgs(await api.listOrgs());
        else if (seg === "cert" && myDID) setCerts(await api.wallet(myDID));
        else if (seg === "contract" && myDID) setContracts(await api.listContractsBy(myDID));
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [seg, myDID]);

  return (
    <Card
      title="Data Flow Explorer"
      tag="Pick any entry"
      hint="Pick any single entry — a certificate, worker, organization, contract, or a recent operation — and watch where it travels across the network and how it is validated step by step before being committed to a block. Submitting new data auto-plays it right on that screen."
    >
      <div className="flow-segs">
        {SEGS.map((s) => (
          <button key={s.id} className={`flow-seg ${seg === s.id ? "active" : ""}`} onClick={() => setSeg(s.id)}>
            <Icon name={s.icon} size={16} /> {s.label}
          </button>
        ))}
      </div>

      {err && <div className="err">⚠ {err}</div>}

      {seg === "recent" && (
        activity.length === 0 ? (
          <Empty icon="grid" text="No activity yet — submit something in any portal and it will show up here." />
        ) : (
          <div className="flow-picklist">
            {activity.map((a) => (
              <button key={a.id} className={`flow-pick ${a.ok ? "" : "fail"}`} onClick={() => openFlow(subjectFromActivity(a))}>
                <span className="flow-pick-ico"><Icon name="flow" size={16} /></span>
                <span className="flow-pick-body">
                  <span className="flow-pick-title">{a.title}</span>
                  <span className="flow-pick-sub"><span>{a.actor}</span>{a.detail && <span className="mono"> · {a.detail}</span>}</span>
                </span>
                <span className="flow-pick-go">View flow →</span>
              </button>
            ))}
          </div>
        )
      )}

      {seg === "cert" && (
        !myDID ? (
          <Empty icon="certificate" text="Log in as a worker to see your own certificates. Others' certificates can be viewed from 'Recent Transactions'." />
        ) : certs.length === 0 ? (
          <Empty icon="certificate" text="No certificates on this account." />
        ) : (
          <div className="flow-picklist">
            {certs.map((c) => (
              <button key={c.credHash} className="flow-pick" onClick={() => openFlow(subjectFromRecord("cert", c))}>
                <span className="flow-pick-ico"><Icon name="certificate" size={16} /></span>
                <span className="flow-pick-body">
                  <span className="flow-pick-title">{c.schemaId} · {String(c.claims.trade ?? "")}</span>
                  <span className="flow-pick-sub mono">{c.credHash}</span>
                </span>
                <span className="flow-pick-go">View flow →</span>
              </button>
            ))}
          </div>
        )
      )}

      {seg === "worker" && (
        workers.length === 0 ? (
          <Empty icon="worker" text="No workers registered." />
        ) : (
          <div className="flow-picklist">
            {workers.map((w) => (
              <button key={w.did} className="flow-pick" onClick={() => openFlow(subjectFromRecord("worker", w))}>
                <span className="flow-pick-ico"><Icon name="worker" size={16} /></span>
                <span className="flow-pick-body">
                  <span className="flow-pick-title">{w.name} <span className="dir-id">{w.workerId}</span></span>
                  <span className="flow-pick-sub mono">{w.did}</span>
                </span>
                <span className="flow-pick-go">View flow →</span>
              </button>
            ))}
          </div>
        )
      )}

      {seg === "org" && (
        orgs.length === 0 ? (
          <Empty icon="building" text="No organizations registered." />
        ) : (
          <div className="flow-picklist">
            {orgs.map((o) => (
              <button key={o.did} className="flow-pick" onClick={() => openFlow(subjectFromRecord("org", o))}>
                <span className="flow-pick-ico"><Icon name={o.type === "ttc" ? "school" : "building"} size={16} /></span>
                <span className="flow-pick-body">
                  <span className="flow-pick-title">{o.name} <span className="dir-id">{o.orgId}</span></span>
                  <span className="flow-pick-sub mono">{o.did}</span>
                </span>
                <span className="flow-pick-go">View flow →</span>
              </button>
            ))}
          </div>
        )
      )}

      {seg === "contract" && (
        !myDID ? (
          <Empty icon="document" text="Log in as a worker or company to see contracts." />
        ) : contracts.length === 0 ? (
          <Empty icon="document" text="No contracts on this account." />
        ) : (
          <div className="flow-picklist">
            {contracts.map((c) => (
              <button key={c.contractHash} className="flow-pick" onClick={() => openFlow(subjectFromRecord("contract", c))}>
                <span className="flow-pick-ico"><Icon name="document" size={16} /></span>
                <span className="flow-pick-body">
                  <span className="flow-pick-title">{c.position} · {c.anchor?.status || "PENDING"}</span>
                  <span className="flow-pick-sub mono">{c.contractHash}</span>
                </span>
                <span className="flow-pick-go">View flow →</span>
              </button>
            ))}
          </div>
        )
      )}
    </Card>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="empty">
      <div className="empty-ico"><Icon name={icon} size={28} /></div>
      {text}
    </div>
  );
}
