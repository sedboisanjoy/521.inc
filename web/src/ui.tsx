import { useState, type ReactNode } from "react";
import { useStore } from "./store";

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
      toast("error", "Clipboard unavailable");
    }
  }
  return (
    <button className="copy" onClick={copy} title={value}>
      <span className="mono">{shown}</span>
      <span className="copy-ico">{done ? "✓" : "⧉"}</span>
    </button>
  );
}

// --- Status badge ----------------------------------------------------------
export function Badge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cls = s === "ACTIVE" || s === "OK" || s === "ONLINE" ? "active" : s === "REVOKED" ? "revoked" : "unknown";
  return <span className={`badge ${cls}`}>{s}</span>;
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
      {busy && <span className="spinner" />}
      {children}
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
export function JsonDetails({ data, label = "Raw response" }: { data: unknown; label?: string }) {
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
}: {
  title: string;
  tag?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        {tag && <span className="tag">{tag}</span>}
      </div>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  );
}

// --- Inline error ----------------------------------------------------------
export function ErrorLine({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="err">⚠ {msg}</div>;
}

// --- Contract signing stepper ---------------------------------------------
const CONTRACT_STEPS = [
  { key: "PENDING", label: "Drafted" },
  { key: "WORKER_SIGNED", label: "Worker signed" },
  { key: "SIGNED", label: "Employer approved" },
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
          <span className="toast-ico">{t.kind === "success" ? "✓" : t.kind === "error" ? "✕" : "ℹ"}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
