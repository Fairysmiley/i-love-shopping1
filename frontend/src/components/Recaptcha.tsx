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
 * Renders the Google reCAPTCHA v2 checkbox when a site key is configured.
 * When no key is set (dev), it renders nothing and the backend skips checks.
 */
export function Recaptcha({ onChange }: { onChange: (token: string | null) => void }) {
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

  if (!config.recaptchaSiteKey) return null;
  return <div className="field" ref={ref} />;
}
