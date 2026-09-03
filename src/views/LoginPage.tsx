import { useState } from "react";
import { TennisBall } from "@phosphor-icons/react";
import { login, type StaffPayload } from "../api.ts";
import "./login.css";

interface DemoEntry {
  readonly name: string;
  readonly role: string;
  readonly pin: string;
  readonly action: string;
}

const DEMO_ENTRIES: readonly DemoEntry[] = [
  { name: "Mia Villanueva", role: "Manager", pin: "1234", action: "Continue as Mia" },
  { name: "Paolo Garcia", role: "Attendant", pin: "1234", action: "Continue as Paolo" },
];

export function LoginPage({ onSignedIn }: { onSignedIn: (session: StaffPayload) => void }) {
  const [staffName, setStaffName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  async function attempt({ name, pin: pinValue }: { name: string; pin: string }): Promise<void> {
    setSigningIn(true);
    setError(null);
    try {
      const session = await login({ name: name.trim(), pin: pinValue });
      onSignedIn(session);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Sign in failed.");
    } finally {
      setSigningIn(false);
    }
  }

  async function submit({ event }: { event: React.FormEvent }): Promise<void> {
    event.preventDefault();
    await attempt({ name: staffName, pin });
  }

  async function quickPick({ entry }: { entry: DemoEntry }): Promise<void> {
    setStaffName(entry.name);
    setPin(entry.pin);
    await attempt({ name: entry.name, pin: entry.pin });
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">
            <TennisBall weight="fill" />
          </span>
          <span>RallyPoint</span>
        </div>
        <h1>Staff sign in</h1>
        <p>Use your staff name and 4-digit PIN.</p>
        <form className="login-form" onSubmit={(event) => void submit({ event })}>
          <input
            aria-label="Staff name"
            placeholder="Staff name"
            value={staffName}
            onChange={(event) => setStaffName(event.target.value)}
          />
          <input
            aria-label="Staff PIN"
            placeholder="PIN"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
          />
          <button className="primary-button" type="submit" disabled={signingIn}>
            {signingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {error !== null && <p className="login-error">{error}</p>}
        <div className="login-demo">
          <strong>Demo sign in</strong>
          {DEMO_ENTRIES.map((entry) => (
            <div className="login-demo-row" key={entry.name}>
              <div>
                <strong>{entry.name}</strong>
                <small>
                  {entry.role} · PIN {entry.pin}
                </small>
              </div>
              <button
                className="secondary-button"
                type="button"
                disabled={signingIn}
                onClick={() => void quickPick({ entry })}
              >
                {entry.action}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
