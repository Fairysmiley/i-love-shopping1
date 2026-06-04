import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { OAuthButtons } from '../components/OAuthButtons';
import { PasswordInput } from '../components/PasswordInput';
import { config } from '../config';
import { Recaptcha } from '../components/Recaptcha';
import {
  hasNoErrors,
  validateCaptchaToken,
  validateEmail,
  validateNewPassword,
  validateRequired,
} from '../utils/validation';

type FieldErrors = Partial<
  Record<'firstName' | 'lastName' | 'email' | 'password' | 'captcha', string | null>
>;

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const validateField = (k: keyof typeof form): string | null => {
    switch (k) {
      case 'firstName':
        return validateRequired(form.firstName, 'First name');
      case 'lastName':
        return validateRequired(form.lastName, 'Last name');
      case 'email':
        return validateEmail(form.email);
      case 'password':
        return validateNewPassword(form.password);
    }
  };

  const blur = (k: keyof typeof form) => () =>
    setFieldErrors((f) => ({ ...f, [k]: validateField(k) }));

  const validate = (): boolean => {
    const errors: FieldErrors = {
      firstName: validateRequired(form.firstName, 'First name'),
      lastName: validateRequired(form.lastName, 'Last name'),
      email: validateEmail(form.email),
      password: validateNewPassword(form.password),
      captcha: validateCaptchaToken(captchaToken, config.recaptchaRequired),
    };
    setFieldErrors(errors);
    return hasNoErrors(errors);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
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
          <div style={{ display: 'flex', gap: 12 }} className="name-row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="firstName">First name</label>
              <input
                id="firstName"
                aria-invalid={!!fieldErrors.firstName}
                value={form.firstName}
                onChange={set('firstName')}
                onBlur={blur('firstName')}
              />
              {fieldErrors.firstName && <p className="field-error">{fieldErrors.firstName}</p>}
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="lastName">Last name</label>
              <input
                id="lastName"
                aria-invalid={!!fieldErrors.lastName}
                value={form.lastName}
                onChange={set('lastName')}
                onBlur={blur('lastName')}
              />
              {fieldErrors.lastName && <p className="field-error">{fieldErrors.lastName}</p>}
            </div>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!fieldErrors.email}
              value={form.email}
              onChange={set('email')}
              onBlur={blur('email')}
            />
            {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              aria-invalid={!!fieldErrors.password}
              value={form.password}
              onChange={set('password')}
              onBlur={blur('password')}
            />
            {fieldErrors.password ? (
              <p className="field-error">{fieldErrors.password}</p>
            ) : (
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                At least 10 characters with upper &amp; lowercase, a number and a symbol.
              </p>
            )}
          </div>
          <Recaptcha
            onChange={(token) => {
              setCaptchaToken(token);
              if (token) setFieldErrors((f) => ({ ...f, captcha: null }));
            }}
            error={fieldErrors.captcha}
          />
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
