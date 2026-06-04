import { config } from '../config';

/**
 * OAuth entry points for Google and GitHub. Set credentials in `.env` and enable
 * the matching `VITE_*_OAUTH_ENABLED` flags, then rebuild `web`.
 */
export function OAuthButtons() {
  const configured =
    config.googleOAuthEnabled || config.githubOAuthEnabled;

  return (
    <>
      <div className="divider">or continue with</div>
      <div className="oauth-row">
        <a className="btn btn-block" href={`${config.apiBaseUrl}/auth/oauth/google`}>
          Continue with Google
        </a>
        <a className="btn btn-block" href={`${config.apiBaseUrl}/auth/oauth/github`}>
          Continue with GitHub
        </a>
      </div>
      {!configured && (
        <p className="muted center" style={{ fontSize: 12, marginTop: 8 }}>
          Add OAuth client IDs in <code>.env</code> and set{' '}
          <code>VITE_GOOGLE_OAUTH_ENABLED=true</code> and/or{' '}
          <code>VITE_GITHUB_OAUTH_ENABLED=true</code>, then rebuild <code>web</code>.
          See <code>docs/OAUTH_SETUP.md</code>.
        </p>
      )}
    </>
  );
}
