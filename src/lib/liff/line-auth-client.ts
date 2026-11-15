import { apiRequest, ApiClientError } from '@/lib/api-client';
import type { LiffAdapter } from './adapter';

export class LineRedirecting extends Error {
  constructor() {
    super('กำลังพาไปเข้าสู่ระบบ LINE');
  }
}

type Purpose = 'login' | 'register' | 'link';

async function proof(adapter: LiffAdapter, purpose: Purpose) {
  if (!adapter.isLoggedIn()) {
    adapter.login();
    // The real SDK leaves the page here. The mock signs in at once and the flow goes on.
    if (!adapter.isLoggedIn()) throw new LineRedirecting();
  }
  const idToken = adapter.getIDToken();
  if (!idToken) {
    throw new Error('ไม่พบข้อมูลจาก LINE กรุณาอนุญาตให้ FaithMap ใช้ข้อมูลโปรไฟล์แล้วลองใหม่');
  }
  const ch = await apiRequest<{ challengeId: string; nonce: string }>('/api/v1/line', {
    method: 'POST',
    body: { action: 'challenge', purpose },
  });
  return { challengeId: ch.challengeId, nonce: ch.nonce, idToken };
}

/** LINE gives the same token again after a recent sign-in. Sign out of LIFF once to get a new one. */
async function withReplayRetry<T>(adapter: LiffAdapter, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ApiClientError && err.code === 'LINE_TOKEN_REPLAYED') {
      adapter.logout();
      adapter.login();
      throw new LineRedirecting();
    }
    throw err;
  }
}

export function lineSignIn(adapter: LiffAdapter) {
  return withReplayRetry(adapter, async () => {
    const p = await proof(adapter, 'login');
    return apiRequest('/api/v1/line', { method: 'POST', body: { action: 'login', ...p } });
  });
}

export function lineRegister(adapter: LiffAdapter, requestedName: string, note: string) {
  return withReplayRetry(adapter, async () => {
    const p = await proof(adapter, 'register');
    return apiRequest<{ requestId: string; status: string }>('/api/v1/line', {
      method: 'POST',
      body: { action: 'register', ...p, requestedName, note: note || undefined },
    });
  });
}

export function lineLink(adapter: LiffAdapter) {
  return withReplayRetry(adapter, async () => {
    const p = await proof(adapter, 'link');
    return apiRequest('/api/v1/line', { method: 'POST', body: { action: 'link', ...p } });
  });
}
