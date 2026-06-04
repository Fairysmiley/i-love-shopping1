import type { ConfigService } from '@nestjs/config';

/**
 * CORS origins for the API. In development we allow any localhost port so
 * mismatched WEB_HOST_PORT / PROXY_HOST_PORT still works during local setup.
 */
export function resolveCorsOrigin(
  config: ConfigService,
): string | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void) {
  const primary = config.get<string>('webPublicUrl') ?? 'http://localhost:8080';
  const isDev = (config.get<string>('env') ?? 'development') !== 'production';

  if (!isDev) {
    return primary;
  }

  const allowed = new Set([primary, config.get<string>('apiPublicUrl')].filter(Boolean) as string[]);

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowed.has(origin)) {
      callback(null, true);
      return;
    }
    // Dev-only: accept any localhost origin (5173, 5174, 8080, 8081, …).
    if (/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  };
}
