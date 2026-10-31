import { createClient, type Session } from '@supabase/supabase-js';
import { useEffect, useState, type ReactNode } from 'react';
import './design/auth.css';

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

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [error, setError] = useState('');
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [attempt, setAttempt] = useState(0);
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
    void fetch('/api/session').then(async response => {
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Unable to verify access.');
      }
      const contractResponse = await fetch('/api/reference-contracts');
      if (!contractResponse.ok) throw new Error('Unable to load protected report references. Retry.');
      const references = await contractResponse.json();
      const reference = await import('./report/reference-standard.mjs');
      reference.setReferenceTemplates(references);
      if (active) { setError(''); setAccess('allowed'); }
    }).catch(err => { if (active) { setError(String(err.message || err)); setAccess('denied'); } });
    return () => { active = false; };
  }, [session?.access_token, attempt]);
  if (!supabase) return <main className="auth-screen"><section className="auth-card"><h1>Atlas sign-in unavailable</h1><p>Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild the app.</p></section></main>;
  if (loading) return <main className="auth-screen"><p role="status">Checking your session…</p></main>;
  if (!session) return <main className="auth-screen"><section className="auth-card"><p className="auth-eyebrow">ATLAS STUDIO INTELLIGENCE</p><h1>Welcome to Atlas</h1><p>Sign in with Google to access your studio workspace.</p>{error && <p role="alert">{error}</p>}<button onClick={async () => {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname + window.location.search } });
    if (error) setError(error.message);
  }}>Continue with Google</button></section></main>;
  if (access === 'checking') return <main className="auth-screen"><p role="status">Verifying access…</p></main>;
  if (access === 'denied') return <main className="auth-screen"><section className="auth-card"><h1>Access unavailable</h1><p role="alert">{error}</p><button onClick={() => setAttempt(n => n + 1)}>Retry</button>{' '}<button onClick={() => void supabase.auth.signOut()}>Sign out</button></section></main>;
  return <>{children}<button className="auth-signout" onClick={() => void supabase.auth.signOut()} title={session.user.email || 'Signed in'}>Sign out</button></>;
}
