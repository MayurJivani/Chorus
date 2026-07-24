const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8888/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The CSRF token is read fresh from the `chorus_csrf` cookie on every request rather than
 * cached in memory. The server can rotate the session (and therefore the CSRF pairing) not
 * just on explicit login/register/logout, but also silently whenever `sessionMiddleware`
 * has to reissue a guest session (e.g. a stale/unknown session cookie) — there's no reliable
 * single moment to "refresh a cached token" against every one of those paths. Reading the
 * cookie directly means the client is always in sync with whatever the server most recently
 * set, by construction, matching the double-submit-cookie pattern csrf-csrf implements.
 */
function readCsrfTokenFromCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)chorus_csrf=([^;]+)/);
  if (!match?.[1]) return null;
  const rawValue = decodeURIComponent(match[1]);
  return rawValue.split('|')[0] ?? null;
}

/** Ensures a CSRF cookie exists before the user does anything — the cookie is only ever
 * set in response to a request, so a brand-new visitor needs one round trip first. */
export async function primeCsrfToken(): Promise<void> {
  await fetch(`${API_URL}/csrf-token`, { credentials: 'include' });
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET') {
    const csrfToken = readCsrfTokenFromCookie();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await res.json() : undefined;

  if (!res.ok) {
    const message =
      (body as { error?: string } | undefined)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message, (body as { details?: unknown } | undefined)?.details);
  }

  return body as T;
}
