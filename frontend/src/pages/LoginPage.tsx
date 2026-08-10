import { FormEvent, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { OAuthButtons } from '../components/OAuthButtons';
import { PasswordInput } from '../components/PasswordInput';
import {
  hasNoErrors,
  validateEmail,
  validateLoginPassword,
  validateTwoFactorCode,
} from '../utils/validation';
import { markTwoFactorEnabledHint } from '../utils/twoFactorHint';
import { SEO } from '../components/SEO';
import type { User } from '../api/types';

interface TwoFactorSetup {
  qrCodeDataUrl: string;
  otpauthUrl: string;
  recoveryCodes: string[];
}

export function LoginPage() {
  const { login, completeTwoFactorSetupLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const nextRoute = location.state?.next || '/shop';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string | null;
    password?: string | null;
    twoFactorCode?: string | null;
  }>({});

  // Mandatory-2FA-enrollment flow (ADMIN/SUPPORT/SALES with no 2FA yet).
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [setupCodeError, setSetupCodeError] = useState<string | null>(null);

  const validate = () => {
    const errors = { email: validateEmail(email), password: validateLoginPassword(password) };
    setFieldErrors(errors);
    return hasNoErrors(errors);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!needs2fa && !validate()) return;
    if (needs2fa) {
      const totpErr = validateTwoFactorCode(twoFactorCode);
      setFieldErrors((f) => ({ ...f, twoFactorCode: totpErr }));
      if (totpErr) return;
    }
    setBusy(true);
    try {
      const result = await login(email, password, needs2fa ? twoFactorCode : undefined);
      if ('requiresTwoFactor' in result) {
        setNeeds2fa(true);
        markTwoFactorEnabledHint();
      } else if ('requiresTwoFactorSetup' in result) {
        setNeedsSetup(true);
        const s = await api.post<TwoFactorSetup>('/auth/2fa/setup');
        setSetup(s);
      } else {
        navigate(nextRoute);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const confirmMandatorySetup = async () => {
    setError('');
    const err = validateTwoFactorCode(setupCode);
    setSetupCodeError(err);
    if (err) return;
    setBusy(true);
    try {
      const res = await api.post<{ enabled: true; accessToken: string; user: User }>('/auth/2fa/enable', {
        code: setupCode,
      });
      completeTwoFactorSetupLogin(res.accessToken, res.user);
      markTwoFactorEnabledHint();
      navigate(nextRoute);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  if (needsSetup) {
    return (
      <div className="auth-wrap">
        <SEO title="Enable Two-Factor Authentication" description="Finish enrolling in required two-factor authentication for your Villi staff account." noindex />
        <div className="auth-card">
          <h1>Enable Two-Factor Authentication</h1>
          <p className="sub">
            This account requires Two-Factor Authentication before you can continue.
          </p>
          {error && <div className="alert alert-error">{error}</div>}
          {!setup ? (
            <p className="muted">Preparing your enrollment…</p>
          ) : (
            <>
              <p className="muted">Scan this QR code with Google Authenticator or Authy, then enter the code.</p>
              <img className="qr" src={setup.qrCodeDataUrl} alt="2FA QR code for authenticator app" />
              <p className="muted center" style={{ fontSize: '0.75rem' }}>
                Save these one-time recovery codes somewhere safe:
              </p>
              <div className="recovery">
                {setup.recoveryCodes.map((c) => (
                  <div key={c}>{c}</div>
                ))}
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="setup-code">Authentication code</label>
                <input
                  id="setup-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  aria-invalid={!!setupCodeError}
                  placeholder="123456"
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value)}
                  onBlur={() => setSetupCodeError(validateTwoFactorCode(setupCode))}
                />
                {setupCodeError && <p className="field-error">{setupCodeError}</p>}
              </div>
              <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={confirmMandatorySetup}>
                {busy ? 'Verifying...' : 'Verify & continue'}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <SEO title="Sign In" description="Sign in to your Villi account to shop authenticated pre-loved Nordic outdoor apparel and track your orders." noindex />
      <div className="auth-card">
        <h1>Welcome back</h1>
        <p className="sub">Sign in to your Villi account.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!fieldErrors.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setFieldErrors((f) => ({ ...f, email: validateEmail(email) }))}
            />
            {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              aria-invalid={!!fieldErrors.password}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setFieldErrors((f) => ({ ...f, password: validateLoginPassword(password) }))}
            />
            {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
          </div>
          {needs2fa && (
            <div className="field">
              <label htmlFor="totp">Two-factor code</label>
              <input
                id="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                aria-invalid={!!fieldErrors.twoFactorCode}
                placeholder="123456"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                onBlur={() =>
                  setFieldErrors((f) => ({ ...f, twoFactorCode: validateTwoFactorCode(twoFactorCode) }))
                }
              />
              {fieldErrors.twoFactorCode && (
                <p className="field-error">{fieldErrors.twoFactorCode}</p>
              )}
              <p className="muted" style={{ fontSize: "0.75rem", marginTop: 6 }}>
                Two-factor authentication is enabled on this account. Enter the 6-digit code from
                your authenticator app, or use a recovery code.
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
