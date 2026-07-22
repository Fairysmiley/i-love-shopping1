import { Link } from 'react-router-dom';
import { config } from '../config';
import { useAuth } from '../auth/AuthContext';
import { shouldShowTwoFactorSetupHint } from '../utils/twoFactorHint';

/**
 * In-app pointers for CAPTCHA env setup and where optional 2FA lives (Account page).
 */
export function SecuritySetupNote() {
  const { user } = useAuth();
  const show2faHint = shouldShowTwoFactorSetupHint();

  return (
    <div className="security-setup-note" role="note">
      {!config.recaptchaSiteKey && (
        <details className="security-setup-details">
          <summary>How to enable CAPTCHA on registration</summary>
          <ol className="security-setup-steps muted">
            <li>
              Create a <strong>reCAPTCHA v2 checkbox</strong> site at{' '}
              <a href="https://www.google.com/recaptcha/admin/create" target="_blank" rel="noreferrer">
                Google reCAPTCHA Admin
              </a>{' '}
              (add domain <code>localhost</code>).
            </li>
            <li>
              Set <code>VITE_RECAPTCHA_SITE_KEY</code> and <code>RECAPTCHA_SECRET</code> in{' '}
              <code>.env</code>.
            </li>
            <li>
              Rebuild: <code>docker compose up --build -d web api</code>
            </li>
          </ol>
          <p className="muted" style={{ fontSize: "0.75rem", margin: '8px 0 0' }}>
            Full guide: <code>docs/CAPTCHA_AND_2FA_SETUP.md</code> in the repo.
          </p>
        </details>
      )}
      {show2faHint && (
        <p className="muted" style={{ fontSize: "0.8125rem", margin: config.recaptchaSiteKey ? 0 : '12px 0 0' }}>
          <strong>Optional 2FA:</strong> sign in, then{' '}
          <Link to={user ? '/account#two-factor' : '/login'}>
            {user ? 'Account → Enable 2FA' : 'Account → Enable 2FA (after sign-in)'}
          </Link>
          .
        </p>
      )}
    </div>
  );
}
