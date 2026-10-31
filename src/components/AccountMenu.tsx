import { useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { useAccount } from "../auth";

/** Account actions live in the current page's navigation, never over the content. */
export function AccountMenu() {
  const account = useAccount();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!account) return null;
  return <details className="account-menu">
    <summary className="button" aria-label="Account menu"><UserRound size={14} /> <span>Account</span></summary>
    <div className="account-menu-panel">
      <span className="account-menu-email">{account.email}</span>
      <button className="button" disabled={busy} onClick={async () => {
        setError(""); setBusy(true);
        try { await account.signOut(); } catch (e) { setError(e instanceof Error ? e.message : "Could not sign out."); setBusy(false); }
      }}><LogOut size={14} />{busy ? "Signing out…" : "Sign out"}</button>
      {error && <p role="alert">{error}</p>}
    </div>
  </details>;
}
