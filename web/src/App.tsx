import { useState } from "react";
import { Issuer } from "./panels/Issuer";
import { Wallet } from "./panels/Wallet";
import { Verifier } from "./panels/Verifier";
import { Admin } from "./panels/Admin";

// Session is shared demo state so the panels chain together: registering a
// worker fills the DID, issuing fills the credHash, and the verifier/wallet
// panels pick them up automatically.
export interface Session {
  did?: string;
  credHash?: string;
}

type Tab = "issuer" | "wallet" | "verifier" | "admin";

const TABS: { id: Tab; label: string }[] = [
  { id: "issuer", label: "Issuer Portal" },
  { id: "wallet", label: "Worker Wallet" },
  { id: "verifier", label: "Verifier Portal" },
  { id: "admin", label: "Admin / BMET" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("issuer");
  const [session, setSession] = useState<Session>({});

  return (
    <>
      <header>
        <h1>🛂 Employment Passport</h1>
        <span>Self-sovereign employment credential network · BCOLBD 2026</span>
      </header>
      <nav>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main>
        {tab === "issuer" && <Issuer session={session} setSession={setSession} />}
        {tab === "wallet" && <Wallet session={session} />}
        {tab === "verifier" && <Verifier session={session} />}
        {tab === "admin" && <Admin session={session} />}
      </main>
    </>
  );
}
