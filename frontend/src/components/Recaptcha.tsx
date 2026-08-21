import { useEffect, useRef } from 'react';
import { config } from '../config';

declare global {
  interface Window {
    grecaptcha?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => number;
    };
    onRecaptchaApiLoad?: () => void;
  }
}

let apiLoadPromise: Promise<void> | null = null;

/** Loads the reCAPTCHA v2 script once and resolves once `grecaptcha.render` is actually callable. */
function loadRecaptchaApi(): Promise<void> {
  if (window.grecaptcha?.render) return Promise.resolve();
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve) => {
    window.onRecaptchaApiLoad = () => resolve();
    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit&onload=onRecaptchaApiLoad';
    script.async = true;
    document.head.appendChild(script);
  });
  return apiLoadPromise;
}

/**
 * Google reCAPTCHA v2 checkbox on the registration form.
 * When no site key is configured (dev), shows a note — the backend still enforces
 * CAPTCHA when RECAPTCHA_SECRET is set.
 */
export function Recaptcha({
  onChange,
  error,
}: {
  onChange: (token: string | null) => void;
  error?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);

  useEffect(() => {
    if (!config.recaptchaSiteKey || rendered.current) return;

    let cancelled = false;
    loadRecaptchaApi().then(() => {
      if (cancelled || !ref.current || rendered.current || !window.grecaptcha) return;
      rendered.current = true;
      window.grecaptcha.render(ref.current, {
        sitekey: config.recaptchaSiteKey,
        callback: (token: string) => onChange(token),
        'expired-callback': () => onChange(null),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [onChange]);

  return (
    <div className="field">
      <label id="recaptcha-label">Verification (CAPTCHA)</label>
      {config.recaptchaSiteKey ? (
        <>
          <div ref={ref} aria-labelledby="recaptcha-label" aria-invalid={!!error} />
          {error && <p className="field-error">{error}</p>}
        </>
      ) : (
        <p className="muted" style={{ fontSize: "0.8125rem", margin: 0 }}>
          CAPTCHA is wired up but not active until you add keys to <code>.env</code> and
          rebuild <code>web</code>. Expand <strong>How to enable CAPTCHA</strong> below, or
          see <code>docs/CAPTCHA_AND_2FA_SETUP.md</code>.
        </p>
      )}
    </div>
  );
}
