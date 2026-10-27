import { useState, type FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Brand } from './Sidebar';
import { Segmented } from './Segmented';

const MODES = ['Sign in', 'Create account'] as const;
type Mode = (typeof MODES)[number];

/** Turns Convex Auth errors into something a person can act on. */
function friendly(err: unknown, mode: Mode): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/valid email/i.test(msg)) return 'Enter a valid email address.';
  if (/at least 8|Invalid password/i.test(msg)) return 'Password must be at least 8 characters.';
  if (/128 characters/i.test(msg)) return 'Password must be 128 characters or fewer.';
  if (mode === 'Create account' && /already exists/i.test(msg)) return 'An account with this email already exists. Sign in instead.';
  if (/fetch|network|Failed to connect/i.test(msg)) return 'Couldn’t reach the server. Check your connection and try again.';
  return mode === 'Sign in' ? 'Email or password is incorrect.' : 'Couldn’t create the account. Try again.';
}

export function AuthScreen() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<Mode>('Sign in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signUp = mode === 'Create account';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return setError('Enter a valid email address.');
    if (signUp && password.length < 8) return setError('Password must be at least 8 characters.');
    if (!password) return setError('Enter your password.');
    setBusy(true);
    setError('');
    try {
      await signIn('password', { email: em, password, flow: signUp ? 'signUp' : 'signIn' });
      // On success the app re-renders as signed in; nothing else to do here.
    } catch (err) {
      setError(friendly(err, mode));
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-card card">
        <Brand />
        <div className="col" style={{ gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 28 }}>{signUp ? 'Create your account' : 'Welcome back'}</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
            {signUp ? 'Register with any email and a password to start planning.' : 'Sign in to see your events.'}
          </p>
        </div>
        <Segmented name="auth-mode" options={MODES} value={mode} onChange={(m) => { setMode(m); setError(''); }} style={{ alignSelf: 'flex-start' }} />
        <form className="col" style={{ gap: 'var(--space-3)' }} onSubmit={(e) => void submit(e)} noValidate>
          <div className="field">
            <label htmlFor="auth-email">Email</label>
            <input id="auth-email" className="input" type="email" autoComplete="email" placeholder="hello@event.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="input"
              type="password"
              autoComplete={signUp ? 'new-password' : 'current-password'}
              placeholder={signUp ? 'At least 8 characters' : ''}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--color-accent-700)' }}>{error}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? (signUp ? 'Creating account…' : 'Signing in…') : signUp ? 'Create account' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
