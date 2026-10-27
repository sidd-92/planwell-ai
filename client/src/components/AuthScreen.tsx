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
  // 'forgot' asks for the email, 'reset' takes the emailed code and a new password.
  const [step, setStep] = useState<'main' | 'forgot' | 'reset'>('main');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
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

  async function requestReset(e: FormEvent) {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return setError('Enter a valid email address.');
    setBusy(true);
    setError('');
    try {
      await signIn('password', { email: em, flow: 'reset' });
      setNotice(`If ${em} has an account, a 6-digit code is on its way.`);
      setPassword('');
      setStep('reset');
    } catch {
      setError('Couldn’t send the code. Try again in a moment.');
    }
    setBusy(false);
  }

  async function confirmReset(e: FormEvent) {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from the email.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    setError('');
    try {
      // Signs the user in on success.
      await signIn('password', { email: em, code: code.trim(), newPassword: password, flow: 'reset-verification' });
    } catch {
      setError('That code is wrong or has expired. Check it or request a new one.');
      setBusy(false);
    }
  }

  function back() { setStep('main'); setError(''); setNotice(''); setCode(''); setPassword(''); }

  if (step !== 'main') {
    return (
      <div className="auth">
        <div className="auth-card card">
          <Brand />
          <div className="col" style={{ gap: 4 }}>
            <h2 style={{ margin: 0, fontSize: 28 }}>Reset your password</h2>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              {step === 'forgot' ? 'Enter your email and we’ll send a 6-digit code.' : notice}
            </p>
          </div>
          <form className="col" style={{ gap: 'var(--space-3)' }} onSubmit={(e) => void (step === 'forgot' ? requestReset(e) : confirmReset(e))} noValidate>
            <div className="field">
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={step === 'reset'} autoFocus={step === 'forgot'} />
            </div>
            {step === 'reset' && (
              <>
                <div className="field">
                  <label htmlFor="auth-code">Code</label>
                  <input id="auth-code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
                </div>
                <div className="field">
                  <label htmlFor="auth-new">New password</label>
                  <input id="auth-new" className="input" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              </>
            )}
            {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--color-accent-700)' }}>{error}</p>}
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {step === 'forgot' ? (busy ? 'Sending…' : 'Send code') : busy ? 'Saving…' : 'Set new password'}
            </button>
            <button className="btn btn-ghost btn-block" type="button" onClick={back}>Back to sign in</button>
          </form>
        </div>
      </div>
    );
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
          {!signUp && <button className="btn btn-ghost" type="button" style={{ alignSelf: 'flex-start', padding: '2px 8px' }} onClick={() => { setStep('forgot'); setError(''); }}>Forgot password?</button>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? (signUp ? 'Creating account…' : 'Signing in…') : signUp ? 'Create account' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
