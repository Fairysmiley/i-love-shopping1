import { config } from '../config';

/**
 * The access token lives ONLY in memory (a module-scoped variable), never in
 * localStorage/sessionStorage, to limit XSS token theft. The refresh token is
 * an httpOnly cookie the browser sends automatically to /auth/refresh.
 */
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  retryOnAuth?: boolean;
  auth?: boolean;
}

async function rawRequest<T>(path: string, opts: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && (Array.isArray(data.message) ? data.message.join(', ') : data.message)) ||
      res.statusText;
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

/** Attempts a silent access-token refresh using the httpOnly refresh cookie. */
export async function refreshSession(): Promise<boolean> {
  try {
    const data = await rawRequest<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
      auth: false,
    });
    accessToken = data.accessToken;
    return true;
  } catch {
    accessToken = null;
    return false;
  }
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, opts);
  } catch (err) {
    // On 401, try one silent refresh + retry before giving up.
    if (err instanceof ApiError && err.status === 401 && opts.retryOnAuth !== false) {
      const refreshed = await refreshSession();
      if (refreshed) {
        return rawRequest<T>(path, { ...opts, retryOnAuth: false });
      }
      onUnauthorized?.();
    }
    throw err;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
