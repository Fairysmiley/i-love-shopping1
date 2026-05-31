import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { validateEmail } from '../utils/validation';

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
      <div className="auth-card">
        <h1>Reset password</h1>
        <p className="sub">We&apos;ll email you a secure reset link.</p>
        {done ? (
          <div className="alert alert-success">
            If an account exists for {email}, a reset link is on its way.
          </div>
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
