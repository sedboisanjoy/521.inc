import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import type { Role } from "./roles";

// Shared demo state so the panels chain together across roles: the training
// center registers a worker (filling the DID), the worker logs in with it, the
// employer verifies the resulting credential hash, and so on.
export interface Session {
  did?: string;
  credHash?: string;
  workerName?: string;
}

export type ActivityKind =
  | "register" | "issue" | "verify" | "revoke" | "disclose" | "corroborate" | "standing"
  | "post" | "apply" | "hire"
  | "contract" | "sign" | "approve";

// A company job opening. Companies post them; workers apply with a credential.
export interface Job {
  id: string;
  title: string;
  company: string;
  employerDID: string;
  skill: string;
  location: string;
  wage: number;
  createdAt: number;
}

// Prefill for drafting a contract, produced when an employer hires an applicant.
export interface ContractDraft {
  workerDID: string;
  workerName: string;
  position: string;
  salary: number;
  currency: string;
  employer: string;
  jobId?: string;
}

export type AppStatus = "applied" | "accepted" | "rejected";

// A worker's application to a job, carrying the credential they're presenting.
export interface Application {
  id: string;
  jobId: string;
  workerDID: string;
  workerName: string;
  credHash: string;
  status: AppStatus;
  verified?: boolean;
  at: number;
}

export interface Activity {
  id: number;
  kind: ActivityKind;
  actor: string;
  title: string;
  detail?: string;
  ok: boolean;
  at: number;
}

export type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

export type Health = "checking" | "online" | "offline";

interface Store {
  role: Role | null;
  identityDID?: string; // the DID the current actor operates as
  login: (role: Role, did?: string) => void;
  logout: () => void;

  session: Session;
  setSession: (patch: Partial<Session>) => void;
  clearSession: () => void;

  activity: Activity[];
  log: (a: Omit<Activity, "id" | "at">) => void;

  jobs: Job[];
  applications: Application[];
  postJob: (j: Omit<Job, "id" | "createdAt">) => Job;
  applyToJob: (a: Omit<Application, "id" | "at" | "status">) => Application | null;
  setApplication: (id: string, patch: Partial<Application>) => void;

  // Transient prefill handed from the employer's Hire action to the contract
  // drafting panel (not persisted).
  contractDraft: ContractDraft | null;
  setContractDraft: (d: ContractDraft | null) => void;

  toasts: Toast[];
  toast: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;

  health: Health;
}

const Ctx = createContext<Store | null>(null);

let seq = 1;

// Lightweight localStorage helpers (safe if storage is unavailable).
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore */
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(() => load<Role | null>("ep_role", null));
  const [identityDID, setIdentityDID] = useState<string | undefined>(() => load<string | undefined>("ep_identity", undefined));
  const [session, setSessionState] = useState<Session>(() => load<Session>("ep_session", {}));
  const [activity, setActivity] = useState<Activity[]>([]);
  const [jobs, setJobs] = useState<Job[]>(() => load<Job[]>("ep_jobs", []));
  const [applications, setApplications] = useState<Application[]>(() => load<Application[]>("ep_apps", []));
  const [contractDraft, setContractDraft] = useState<ContractDraft | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [health, setHealth] = useState<Health>("checking");
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const login = useCallback((r: Role, did?: string) => {
    setRole(r);
    setIdentityDID(did);
    save("ep_role", r);
    save("ep_identity", did);
    if (did) {
      setSessionState((s) => {
        const next = { ...s, did };
        save("ep_session", next);
        return next;
      });
    }
  }, []);

  const logout = useCallback(() => {
    setRole(null);
    setIdentityDID(undefined);
    save("ep_role", null);
    save("ep_identity", undefined);
  }, []);

  const setSession = useCallback((patch: Partial<Session>) => {
    setSessionState((s) => {
      const next = { ...s, ...patch };
      save("ep_session", next);
      return next;
    });
  }, []);
  const clearSession = useCallback(() => {
    setSessionState({});
    save("ep_session", {});
  }, []);

  const log = useCallback((a: Omit<Activity, "id" | "at">) => {
    setActivity((list) => [{ ...a, id: seq++, at: Date.now() }, ...list].slice(0, 50));
  }, []);

  const postJob = useCallback((j: Omit<Job, "id" | "createdAt">) => {
    const job: Job = { ...j, id: `job_${Date.now()}_${seq++}`, createdAt: Date.now() };
    setJobs((list) => {
      const next = [job, ...list];
      save("ep_jobs", next);
      return next;
    });
    return job;
  }, []);

  const applyToJob = useCallback((a: Omit<Application, "id" | "at" | "status">) => {
    let created: Application | null = null;
    setApplications((list) => {
      // One application per worker per job.
      if (list.some((x) => x.jobId === a.jobId && x.workerDID === a.workerDID)) {
        return list;
      }
      created = { ...a, id: `app_${Date.now()}_${seq++}`, status: "applied", at: Date.now() };
      const next = [created, ...list];
      save("ep_apps", next);
      return next;
    });
    return created;
  }, []);

  const setApplication = useCallback((id: string, patch: Partial<Application>) => {
    setApplications((list) => {
      const next = list.map((x) => (x.id === id ? { ...x, ...patch } : x));
      save("ep_apps", next);
      return next;
    });
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const toast = useCallback(
    (kind: ToastKind, message: string) => {
      const id = seq++;
      setToasts((list) => [...list, { id, kind, message }]);
      timers.current[id] = setTimeout(() => dismiss(id), 4200);
    },
    [dismiss]
  );

  // Poll backend health so the UI shows a live connection indicator.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        await api.health();
        if (alive) setHealth("online");
      } catch {
        if (alive) setHealth("offline");
      }
    };
    check();
    const iv = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const value = useMemo<Store>(
    () => ({
      role, identityDID, login, logout,
      session, setSession, clearSession,
      activity, log,
      jobs, applications, postJob, applyToJob, setApplication,
      contractDraft, setContractDraft,
      toasts, toast, dismiss, health,
    }),
    [role, identityDID, login, logout, session, setSession, clearSession, activity, log, jobs, applications, postJob, applyToJob, setApplication, contractDraft, toasts, toast, dismiss, health]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used within StoreProvider");
  return s;
}
