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

const DEFAULT_TIMEOUT_MS = 20_000;

interface RequestOptions {
  method?: string;
  body?: unknown;
  retryOnAuth?: boolean;
  auth?: boolean;
  /** Abort the request after this many ms (default 20s). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function rawRequest<T>(path: string, opts: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  const onAbort = () => timeoutController.abort();
  opts.signal?.addEventListener('abort', onAbort);

  let res: Response;
  try {
    res = await fetch(`${config.apiBaseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      credentials: 'include',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: timeoutController.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(408, 'Request timed out. Check that the API is running and reachable.');
    }
    throw new ApiError(0, 'Could not reach the server. Check your connection and API URL.');
  } finally {
    clearTimeout(timeoutId);
    opts.signal?.removeEventListener('abort', onAbort);
  }

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
      timeoutMs: 8_000,
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
  get: <T>(path: string, opts?: Pick<RequestOptions, 'signal' | 'timeoutMs' | 'retryOnAuth'>) =>
    request<T>(path, opts),
  post: <T>(
    path: string,
    body?: unknown,
    opts?: Pick<RequestOptions, 'retryOnAuth' | 'auth'>,
  ) => request<T>(path, { method: 'POST', body, ...opts }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
