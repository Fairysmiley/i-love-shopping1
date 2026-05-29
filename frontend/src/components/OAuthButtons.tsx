import { config } from '../config';

export function OAuthButtons() {
  if (!config.googleOAuthEnabled && !config.facebookOAuthEnabled) return null;
  return (
    <>
      <div className="divider">or continue with</div>
      <div className="oauth-row">
        {config.googleOAuthEnabled && (
          <a className="btn btn-block" href={`${config.apiBaseUrl}/auth/oauth/google`}>
            Continue with Google
          </a>
        )}
        {config.facebookOAuthEnabled && (
          <a className="btn btn-block" href={`${config.apiBaseUrl}/auth/oauth/facebook`}>
            Continue with Facebook
          </a>
        )}
      </div>
    </>
  );
}
