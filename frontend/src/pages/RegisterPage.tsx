import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { OAuthButtons } from '../components/OAuthButtons';
import { Recaptcha } from '../components/Recaptcha';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register({ ...form, captchaToken: captchaToken ?? undefined });
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Create your account</h1>
        <p className="sub">Join Villi in seconds.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>First name</label>
              <input required value={form.firstName} onChange={set('firstName')} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Last name</label>
              <input required value={form.lastName} onChange={set('lastName')} />
            </div>
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" required value={form.email} onChange={set('email')} />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" required value={form.password} onChange={set('password')} />
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              At least 10 characters with upper &amp; lowercase, a number and a symbol.
            </p>
          </div>
          <Recaptcha onChange={setCaptchaToken} />
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <OAuthButtons />
        <p className="center muted" style={{ marginTop: 18 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
