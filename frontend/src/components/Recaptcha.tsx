import { useEffect, useRef } from 'react';
import { config } from '../config';

declare global {
  interface Window {
    grecaptcha?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => number;
    };
  }
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

    const renderWidget = () => {
      if (ref.current && window.grecaptcha) {
        rendered.current = true;
        window.grecaptcha.render(ref.current, {
          sitekey: config.recaptchaSiteKey,
          callback: (token: string) => onChange(token),
          'expired-callback': () => onChange(null),
        });
      }
    };

    if (window.grecaptcha) {
      renderWidget();
    } else {
      const script = document.createElement('script');
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.onload = () => setTimeout(renderWidget, 300);
      document.head.appendChild(script);
    }
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
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Google reCAPTCHA is integrated on registration. Set{' '}
          <code>VITE_RECAPTCHA_SITE_KEY</code> and <code>RECAPTCHA_SECRET</code> in{' '}
          <code>.env</code>, then rebuild <code>web</code> to show the widget (server
          skips verification when the secret is empty).
        </p>
      )}
    </div>
  );
}
