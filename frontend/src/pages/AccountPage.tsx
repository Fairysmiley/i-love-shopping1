import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { validateTwoFactorCode } from '../utils/validation';

interface TwoFactorSetup {
  qrCodeDataUrl: string;
  otpauthUrl: string;
  recoveryCodes: string[];
}

export function AccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ enabled: boolean }>('/auth/2fa/status').then((r) => setEnabled(r.enabled)).catch(() => undefined);
  }, []);

  const beginSetup = async () => {
    setError('');
    try {
      const s = await api.post<TwoFactorSetup>('/auth/2fa/setup');
      setSetup(s);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed');
    }
  };

  const confirm = async () => {
    setError('');
    const err = validateTwoFactorCode(code);
    setCodeError(err);
    if (err) return;
    try {
      await api.post('/auth/2fa/enable', { code });
      setEnabled(true);
      setSetup(null);
      setCode('');
      setMsg('Two-factor authentication is now enabled.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Invalid code');
    }
  };

  const disable = async () => {
    if (!window.confirm('Disable two-factor authentication on this account?')) return;
    setError('');
    try {
      await api.post('/auth/2fa/disable');
      setEnabled(false);
      setSetup(null);
      setMsg('Two-factor authentication disabled.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to disable 2FA');
    }
  };

  const exportData = async () => {
    const data = await api.get('/users/me/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'villi-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteAccount = async () => {
    if (!window.confirm('Permanently delete your account? This cannot be undone.')) return;
    await api.del('/users/me');
    await logout();
    navigate('/');
  };

  const signOut = async () => {
    setError('');
    await logout();
    navigate('/');
  };

  return (
    <div className="container" style={{ maxWidth: 720, padding: 28 }}>
      <h1>Account</h1>
      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel" style={{ marginBottom: 18 }}>
        <h3>Profile</h3>
        <p style={{ margin: '4px 0' }}>
          {user?.firstName} {user?.lastName}
        </p>
        <p className="muted" style={{ margin: '4px 0' }}>
          {user?.email} &middot; role: {user?.role}
        </p>
        <button type="button" className="btn" style={{ marginTop: 14 }} onClick={signOut}>
          Sign out
        </button>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <h3>Two-factor authentication (optional)</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Off by default. You choose to enable TOTP (Google Authenticator, Authy, etc.) from
          this page — not required to shop.
        </p>
        {enabled ? (
          <>
            <p className="muted">2FA is currently <strong>enabled</strong> on your account.</p>
            <button type="button" className="btn" onClick={disable}>
              Disable 2FA
            </button>
          </>
        ) : setup ? (
          <>
            <p className="muted">Scan this QR code with Google Authenticator or Authy, then enter the code.</p>
            <img className="qr" src={setup.qrCodeDataUrl} alt="2FA QR code for authenticator app" />
            <p className="muted center" style={{ fontSize: 12 }}>
              Save these one-time recovery codes somewhere safe:
            </p>
            <div className="recovery">
              {setup.recoveryCodes.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor="twofa-code">Authentication code</label>
              <input
                id="twofa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-invalid={!!codeError}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onBlur={() => setCodeError(validateTwoFactorCode(code))}
              />
              {codeError && <p className="field-error">{codeError}</p>}
            </div>
            <button type="button" className="btn btn-primary" onClick={confirm}>
              Verify &amp; enable
            </button>
          </>
        ) : (
          <>
            <p className="muted">Add an extra layer of security with an authenticator app.</p>
            <button type="button" className="btn btn-primary" onClick={beginSetup}>
              Enable 2FA
            </button>
          </>
        )}
      </div>

      <div className="panel">
        <h3>Privacy (GDPR)</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={exportData}>
            Export my data
          </button>
          <button className="btn" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={deleteAccount}>
            Delete my account
          </button>
        </div>
      </div>
    </div>
  );
}
