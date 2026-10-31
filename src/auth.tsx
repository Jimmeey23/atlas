import { createClient, type Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import './design/tokens.css';
import './design/auth.css';
import { SignInPage } from './components/auth/SignInPage';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;

// Attach the current session only to same-origin application APIs. Do not send
// bearer tokens to external hosts, even when their paths happen to start /api/.
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const address = new URL(input instanceof Request ? input.url : String(input), window.location.href);
  if (address.origin !== window.location.origin || !address.pathname.startsWith('/api/')) return originalFetch(input, init);
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  return originalFetch(input, { ...init, headers });
};

type Account = { email: string; signOut: () => Promise<void> };
const AccountContext = createContext<Account | null>(null);
export const useAccount = () => useContext(AccountContext);

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [error, setError] = useState('');
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [attempt, setAttempt] = useState(0);
  const [signingIn, setSigningIn] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (active) { setSession(data.session); setError(error?.message || ''); setLoading(false); }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) { setSession(next); setLoading(false); }
    });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!session) { setAccess('checking'); return; }
    let active = true;
    setAccess('checking');
    // These are independent authenticated requests. The server still verifies each
    // one, and the app remains gated until access and references are both ready.
    const references = Promise.all([fetch('/api/reference-contracts'), import('./report/reference-standard.mjs')])
      .then(value => ({ value }), error => ({ error }));
    void fetch('/api/session').then(async response => {
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Unable to verify access.');
      }
      const result = await references;
      if ('error' in result) throw result.error;
      const [contractResponse, reference] = result.value;
      if (!contractResponse.ok) throw new Error('Unable to load protected report references. Retry.');
      const templates = await contractResponse.json();
      if (active) { reference.setReferenceTemplates(templates); setError(''); setAccess('allowed'); }
    }).catch(err => { if (active) { setError(String(err.message || err)); setAccess('denied'); } });
    return () => { active = false; };
  }, [session?.access_token, attempt]);
  if (!supabase || (!loading && !session)) return <SignInPage configured={!!supabase} pending={signingIn} error={error} onSignIn={async () => {
    if (!supabase || signingIn) return;
    setError(''); setSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname + window.location.search } });
      if (error) { setError(error.message); setSigningIn(false); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to connect to Google.'); setSigningIn(false); }
  }} />;
  if (loading) return <main className="auth-screen"><p role="status">Checking your session…</p></main>;
  if (!session) return null;
  if (access === 'checking') return <main className="auth-screen"><p role="status">Verifying access…</p></main>;
  if (access === 'denied') return <main className="auth-screen"><section className="auth-card"><h1>Access unavailable</h1><p role="alert">{error}</p><button onClick={() => setAttempt(n => n + 1)}>Retry</button>{' '}<button onClick={() => void supabase.auth.signOut()}>Sign out</button></section></main>;
  return <AccountContext.Provider value={{ email: session.user.email || 'Signed in', signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } }}>{children}</AccountContext.Provider>;
}
