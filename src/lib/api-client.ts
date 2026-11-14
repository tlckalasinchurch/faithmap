export function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const pairs = document.cookie.split(';');
  for (const pair of pairs) {
    const [k, ...rest] = pair.trim().split('=');
    if (k === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest<T>(
  url: string,
  options?: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    idempotencyKey?: string;
    csrfOverride?: string | null;
  }
): Promise<T> {
  const method = options?.method ?? 'GET';
  const headers: Record<string, string> = {};

  if (options?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET') {
    const csrf = options?.csrfOverride ?? readCookieValue('faithmap_csrf');
    if (csrf) {
      headers['X-FaithMap-CSRF'] = csrf;
    }
  }
  if (options?.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errObj = (payload as { error?: { code?: string; message?: string } })?.error;
    throw new ApiClientError(
      res.status,
      errObj?.code || 'REQUEST_FAILED',
      errObj?.message || `คำขอล้มเหลว (${res.status})`
    );
  }

  return payload as T;
}
