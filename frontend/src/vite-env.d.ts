/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_RECAPTCHA_SITE_KEY?: string;
  readonly VITE_GOOGLE_OAUTH_ENABLED?: string;
  readonly VITE_GITHUB_OAUTH_ENABLED?: string;
  readonly VITE_FACEBOOK_OAUTH_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
