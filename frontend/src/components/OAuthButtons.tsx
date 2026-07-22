import { config } from '../config';

/**
 * OAuth entry points for Google, GitHub, and Facebook. Set credentials in `.env` and
 * enable the matching `VITE_*_OAUTH_ENABLED` flags, then rebuild `web`.
 */
export function OAuthButtons() {
  const configured =
    config.googleOAuthEnabled || config.githubOAuthEnabled || config.facebookOAuthEnabled;

  return (
    <>
      <div className="divider">or continue with</div>
      <div className="oauth-row">
        {(config.googleOAuthEnabled || !configured) && (
          <a className="btn btn-block" href={`${config.apiBaseUrl}/auth/oauth/google`}>
            Continue with Google
          </a>
        )}
        {(config.githubOAuthEnabled || !configured) && (
          <a className="btn btn-block" href={`${config.apiBaseUrl}/auth/oauth/github`}>
            Continue with GitHub
          </a>
        )}
        {config.facebookOAuthEnabled && (
          <a className="btn btn-block" href={`${config.apiBaseUrl}/auth/oauth/facebook`}>
            Continue with Facebook
          </a>
        )}
      </div>
      {!configured && (
        <p className="muted center" style={{ fontSize: "0.75rem", marginTop: 8 }}>
          Add OAuth client IDs in <code>.env</code> and set{' '}
          <code>VITE_GOOGLE_OAUTH_ENABLED=true</code>,{' '}
          <code>VITE_GITHUB_OAUTH_ENABLED=true</code>, and/or{' '}
          <code>VITE_FACEBOOK_OAUTH_ENABLED=true</code>, then rebuild <code>web</code>.
          See <code>docs/OAUTH_SETUP.md</code>.
        </p>
      )}
    </>
  );
}
