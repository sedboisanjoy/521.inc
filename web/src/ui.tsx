import { useState, type ReactNode } from "react";
import { useStore } from "./store";
import { Icon } from "./icons";
import { Text } from "@arwes/react-text";
import { FrameUnderline } from "@arwes/react-frames";
import { Panel, type FrameColor } from "./arwes";

// --- Copyable mono value (DIDs, hashes) -----------------------------------
export function Copy({ value, short }: { value: string; short?: boolean }) {
  const [done, setDone] = useState(false);
  const { toast } = useStore();
  const shown = short && value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      toast("error", "Could not copy");
    }
  }
  return (
    <button className="copy" onClick={copy} title={value}>
      <span className="mono">{shown}</span>
      <span className="copy-ico"><Icon name={done ? "check" : "copy"} size={14} /></span>
    </button>
  );
}

// --- Status badge ----------------------------------------------------------
// English labels for the statuses shown to users.
const STATUS_BN: Record<string, string> = {
  ACTIVE: "Active", ONLINE: "Connected", OK: "OK", REVOKED: "Revoked",
  OFFLINE: "Offline", UNKNOWN: "Unknown", PENDING: "Pending",
  WORKER_SIGNED: "Signed", SIGNED: "Completed", CORROBORATED: "Corroborated",
  APPLIED: "Applied", ACCEPTED: "Accepted", REJECTED: "Rejected",
};
export function Badge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cls = s === "ACTIVE" || s === "OK" || s === "ONLINE" || s === "SIGNED" || s === "ACCEPTED" || s === "CORROBORATED"
    ? "active"
    : s === "REVOKED" || s === "REJECTED" || s === "OFFLINE" ? "revoked" : "unknown";
  return <span className={`badge ${cls}`}>{STATUS_BN[s] || status}</span>;
}

// --- Primary action button with loading state -----------------------------
export function Button({
  children,
  onClick,
  disabled,
  busy,
  variant = "primary",
  full,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "ghost" | "danger";
  full?: boolean;
}) {
  return (
    <button
      className={`btn btn-${variant}${full ? " btn-full" : ""}`}
      onClick={onClick}
      disabled={disabled || busy}
    >
      <FrameUnderline className="btn-frame" style={{ zIndex: 0 }} />
      <span className="btn-label">
        {busy && <span className="spinner" />}
        {children}
      </span>
    </button>
  );
}

// --- Labeled field ---------------------------------------------------------
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

// --- Collapsible raw JSON --------------------------------------------------
export function JsonDetails({ data, label = "Details" }: { data: unknown; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="json-details">
      <button className="json-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} {label}
      </button>
      {open && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}

// --- Card ------------------------------------------------------------------
export function Card({
  title,
  tag,
  hint,
  children,
  color = "cyan",
}: {
  title: string;
  tag?: string;
  hint?: string;
  children: ReactNode;
  color?: FrameColor;
}) {
  return (
    <Panel className="card" color={color}>
      <div className="card-head">
        <h2><Text as="span" manager="decipher">{title}</Text></h2>
        {tag && <span className="tag">{tag}</span>}
      </div>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </Panel>
  );
}

// --- Inline error ----------------------------------------------------------
export function ErrorLine({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="err">⚠ {msg}</div>;
}

// --- Contract signing stepper ---------------------------------------------
const CONTRACT_STEPS = [
  { key: "PENDING", label: "Created" },
  { key: "WORKER_SIGNED", label: "Worker Signed" },
  { key: "SIGNED", label: "Approved" },
];

export function ContractStepper({ status }: { status: string }) {
  // How far along the lifecycle we are (index of the current status).
  const order = ["PENDING", "WORKER_SIGNED", "SIGNED"];
  const at = Math.max(0, order.indexOf(status));
  return (
    <div className="stepper">
      {CONTRACT_STEPS.map((s, i) => {
        const state = i < at ? "done" : i === at ? "current" : "todo";
        return (
          <div key={s.key} className={`step step-${state}`}>
            <span className="step-dot">{i < at || (i === at && status === "SIGNED") ? "✓" : i + 1}</span>
            <span className="step-lbl">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// --- Toast stack -----------------------------------------------------------
export function Toaster() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)}>
          <span className="toast-ico"><Icon name={t.kind === "success" ? "check" : t.kind === "error" ? "x" : "info"} size={13} /></span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
