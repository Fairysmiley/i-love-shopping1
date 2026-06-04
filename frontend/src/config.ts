export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1',
  recaptchaSiteKey: import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? '',
  /** True when the registration form must show and complete Google reCAPTCHA. */
  recaptchaRequired: Boolean(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
  googleOAuthEnabled: import.meta.env.VITE_GOOGLE_OAUTH_ENABLED === 'true',
  githubOAuthEnabled: import.meta.env.VITE_GITHUB_OAUTH_ENABLED === 'true',
  facebookOAuthEnabled: import.meta.env.VITE_FACEBOOK_OAUTH_ENABLED === 'true',
};
