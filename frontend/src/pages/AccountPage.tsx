import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { validateTwoFactorCode } from '../utils/validation';
import {
  clearTwoFactorEnabledHint,
  markTwoFactorEnabledHint,
} from '../utils/twoFactorHint';
import { SEO } from '../components/SEO';
import { AddressBook } from '../components/AddressBook';

interface TwoFactorSetup {
  qrCodeDataUrl: string;
  otpauthUrl: string;
  recoveryCodes: string[];
}

export function AccountPage() {
  const { user, logout, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const startEditingProfile = () => {
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
    setError('');
    setEditingProfile(true);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name cannot be empty.');
      return;
    }
    setSavingProfile(true);
    setError('');
    try {
      await api.patch('/users/me', { firstName: firstName.trim(), lastName: lastName.trim() });
      await refreshProfile();
      setEditingProfile(false);
      setMsg('Profile updated.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  useEffect(() => {
    api
      .get<{ enabled: boolean }>('/auth/2fa/status')
      .then((r) => {
        setEnabled(r.enabled);
        if (r.enabled) markTwoFactorEnabledHint();
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (window.location.hash !== '#two-factor') return;
    document.getElementById('two-factor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      markTwoFactorEnabledHint();
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
      clearTwoFactorEnabledHint();
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
      <SEO title="My Account" description="Manage your Villi profile, addresses, orders, and security settings." canonical="https://villi.com/account" noindex />
      <h1>Account</h1>
      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel" style={{ marginBottom: 18 }}>
        <h2>Profile</h2>
        {editingProfile ? (
          <form onSubmit={saveProfile}>
            <div className="field">
              <label htmlFor="profile-first-name">First name</label>
              <input
                id="profile-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="profile-last-name">Last name</label>
              <input
                id="profile-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                {savingProfile ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: 'transparent', border: '1px solid var(--border)' }}
                onClick={() => setEditingProfile(false)}
                disabled={savingProfile}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <p style={{ margin: '4px 0' }}>
              {user?.firstName} {user?.lastName}
            </p>
            <p className="muted" style={{ margin: '4px 0' }}>
              {user?.email} &middot; role: {user?.role}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="button" className="btn" onClick={startEditingProfile}>
                Edit profile
              </button>
              <button type="button" className="btn" onClick={() => navigate('/orders')}>
                View My Orders
              </button>
              <button type="button" className="btn" style={{ background: 'transparent', border: '1px solid var(--border)' }} onClick={signOut}>
                Sign out
              </button>
            </div>
          </>
        )}
      </div>

      <AddressBook />

      <div id="two-factor" className="panel account-2fa-panel" style={{ marginBottom: 18 }}>
        <h2>Two-factor authentication (optional)</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.8125rem" }}>
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
            <p className="muted center" style={{ fontSize: "0.75rem" }}>
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
        <h2>Privacy (GDPR)</h2>
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
