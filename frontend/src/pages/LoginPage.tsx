import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { OAuthButtons } from '../components/OAuthButtons';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await login(email, password, needs2fa ? twoFactorCode : undefined);
      if ('requiresTwoFactor' in result) {
        setNeeds2fa(true);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Welcome back</h1>
        <p className="sub">Sign in to your Villi account.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {needs2fa && (
            <div className="field">
              <label htmlFor="totp">Two-factor code</label>
              <input
                id="totp"
                inputMode="numeric"
                autoFocus
                placeholder="123456"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
              />
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Enter the 6-digit code from your authenticator app (or a recovery code).
              </p>
            </div>
          )}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <OAuthButtons />
        <p className="center muted" style={{ marginTop: 18 }}>
          <Link to="/forgot-password">Forgot password?</Link> &middot;{' '}
          <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
