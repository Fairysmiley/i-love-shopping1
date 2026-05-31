import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PasswordInput } from '../components/PasswordInput';
import { validateNewPassword } from '../utils/validation';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const err = validateNewPassword(newPassword);
    setPasswordError(err);
    if (err) return;
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      navigate('/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Choose a new password</h1>
        <p className="sub">Enter a strong new password for your account.</p>
        {!token && <div className="alert alert-error">Missing or invalid reset token.</div>}
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="new-password">New password</label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              aria-invalid={!!passwordError}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onBlur={() => setPasswordError(validateNewPassword(newPassword))}
            />
            {passwordError ? (
              <p className="field-error">{passwordError}</p>
            ) : (
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                At least 10 characters with upper &amp; lowercase, a number and a symbol.
              </p>
            )}
          </div>
          <button className="btn btn-primary btn-block" disabled={busy || !token}>
            {busy ? 'Updating...' : 'Update password'}
          </button>
        </form>
        <p className="center muted" style={{ marginTop: 18 }}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
