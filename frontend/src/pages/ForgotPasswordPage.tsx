import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { config } from '../config';
import { validateEmail } from '../utils/validation';
import { SEO } from '../components/SEO';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const err = validateEmail(email);
    setEmailError(err);
    if (err) return;
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <SEO title="Forgot Password" description="Request a secure password reset link for your Villi account." noindex />
      <div className="auth-card">
        <h1>Reset password</h1>
        <p className="sub">We&apos;ll email you a secure reset link.</p>
        {done ? (
          <>
            <div className="alert alert-success">
              If an account exists for <strong>{email}</strong>, a reset link is on its way.
              Check your inbox (and spam folder).
            </div>
            {config.mailInboxUrl && (
              <p className="muted" style={{ fontSize: "0.8125rem", marginTop: 12 }}>
                Local dev: open{' '}
                <a href={config.mailInboxUrl} target="_blank" rel="noreferrer">
                  Mailhog
                </a>{' '}
                to read the reset email and click the link.
              </p>
            )}
          </>
        ) : (
          <>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={submit}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={!!emailError}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmailError(validateEmail(email))}
                />
                {emailError && <p className="field-error">{emailError}</p>}
              </div>
              <button className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
          </>
        )}
        <p className="center muted" style={{ marginTop: 18 }}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
