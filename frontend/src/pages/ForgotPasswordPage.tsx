import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
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
                <label>Email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
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
