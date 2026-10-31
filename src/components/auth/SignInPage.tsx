import { ArrowUpRight, LockKeyhole, Sparkles } from 'lucide-react';

function GoogleMark() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.7-4 6.1v5.1h6.5c3.8-3.5 6.1-8.7 6.1-14.9Z"/>
    <path fill="#34A853" d="M24 44.4c5.5 0 10.1-1.8 13.5-5l-6.5-5.1c-1.8 1.2-4.1 2-7 2-5.3 0-9.9-3.6-11.5-8.5H5.8v5.3A20.4 20.4 0 0 0 24 44.4Z"/>
    <path fill="#FBBC05" d="M12.5 27.8a12.3 12.3 0 0 1 0-7.6v-5.3H5.8a20.4 20.4 0 0 0 0 18.2l6.7-5.3Z"/>
    <path fill="#EA4335" d="M24 11.7c3 0 5.6 1 7.7 3l5.9-5.9A19.6 19.6 0 0 0 24 3.6 20.4 20.4 0 0 0 5.8 14.9l6.7 5.3c1.6-4.9 6.2-8.5 11.5-8.5Z"/>
  </svg>;
}

/** Google handles both first-time signup and returning users through the same OAuth flow. */
export function SignInPage({ onSignIn, configured, pending = false, error = '' }: {
  onSignIn: () => void;
  configured: boolean;
  pending?: boolean;
  error?: string;
}) {
  return <main className="auth-shell">
    <div className="auth-frame">
      <header className="auth-header">
        <div className="auth-brand" aria-label="Atlas, Physique 57 India">
          <span className="auth-brand-mark" aria-hidden="true"><i/><i/><i/><b/></span>
          <span className="auth-wordmark">Atlas<span>.</span></span>
          <span className="auth-brand-divider" aria-hidden="true" />
          <span className="auth-brand-sub">PHYSIQUE 57 INDIA <small>STUDIO INTELLIGENCE</small></span>
        </div>
        <span className="auth-header-label"><span/> YOUR STUDIO WORKSPACE</span>
      </header>

      <div className="auth-main">
        <section className="auth-story" aria-labelledby="auth-story-title">
          <p className="auth-kicker"><span/> THE INTELLIGENCE WORKSPACE</p>
          <h1 id="auth-story-title">A clearer view<br/>of <em>what moves us.</em></h1>
          <p className="auth-story-copy">Your studio data, brought together. Find the signals, see the bigger picture, and move forward with confidence.</p>
          <div className="auth-preview" aria-hidden="true">
            <div className="auth-preview-head"><span><i/> WORKSPACE OVERVIEW</span><span>ILLUSTRATIVE <ArrowUpRight size={13}/></span></div>
            <div className="auth-preview-body">
              <div className="auth-preview-label"><span>THE BIG PICTURE</span><strong>Everything in<br/>one place<span>.</span></strong><small>Made for better decisions</small></div>
              <div className="auth-visual">
                <div className="auth-visual-grid"/>
                <svg viewBox="0 0 340 135" preserveAspectRatio="none"><defs><linearGradient id="authArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#35d9e6" stopOpacity=".2"/><stop offset="1" stopColor="#35d9e6" stopOpacity="0"/></linearGradient></defs><path d="M0 114 C30 111 41 87 72 91 S111 99 140 73 S174 80 203 53 S236 65 259 40 S306 50 340 14 L340 135 L0 135 Z" fill="url(#authArea)"/><path d="M0 114 C30 111 41 87 72 91 S111 99 140 73 S174 80 203 53 S236 65 259 40 S306 50 340 14" fill="none" stroke="#62dce6" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg>
                <div className="auth-visual-key"><span><i/> ATTENDANCE</span><span><i/> REVENUE</span><span><i/> MEMBERS</span></div>
              </div>
            </div>
          </div>
          <div className="auth-story-foot"><Sparkles size={15}/><span>Less searching. More understanding.</span></div>
        </section>

        <section className="auth-login-card" aria-labelledby="auth-login-title">
          <div className="auth-card-top"><span className="auth-card-icon"><LockKeyhole size={18}/></span><span className="auth-card-index">YOUR ACCOUNT <span> / 01</span></span></div>
          <div className="auth-card-content">
            <p className="auth-card-eyebrow">WELCOME TO ATLAS</p>
            <h2 id="auth-login-title">Let's get you<br/>signed in<span>.</span></h2>
            <p className="auth-card-copy">Everything you need to understand your studio, all in one place.</p>
            <div className="auth-login-divider"><span>CONTINUE WITH YOUR ACCOUNT</span></div>
            <button className="auth-google" type="button" onClick={onSignIn} disabled={!configured || pending}>
              <GoogleMark/><span>{pending ? 'Connecting to Google…' : 'Continue with Google'}</span><ArrowUpRight size={16} aria-hidden="true"/>
            </button>
            <p className="auth-signup-copy">New to Atlas? <strong>Sign up with Google</strong> using the same button.</p>
            {error && <p className="auth-error" role="alert">{error}</p>}
            {!configured && <p className="auth-error" role="alert">Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild the app.</p>}
          </div>
          <div className="auth-card-footer"><LockKeyhole size={14}/><span>You'll continue securely with Google. Access may be restricted to approved accounts.</span></div>
        </section>
      </div>
      <footer className="auth-footer"><span>© PHYSIQUE 57 INDIA <i/> ATLAS</span><span>BUILT FOR A BETTER PERSPECTIVE <span>↗</span></span></footer>
    </div>
  </main>;
}
