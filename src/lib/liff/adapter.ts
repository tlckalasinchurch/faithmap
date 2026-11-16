import { selectLiffAdapterKind } from './select';

/** What the app needs from LIFF. The server verifies the ID token. The app never trusts this object. */
export interface LiffAdapter {
  kind: 'real' | 'mock';
  init(): Promise<void>;
  isLoggedIn(): boolean;
  login(): void;
  logout(): void;
  getIDToken(): string | null;
  getDisplayName(): Promise<string | null>;
}

/**
 * Returns the adapter for this build, or null when LINE is not set up.
 * The mock import sits behind a NODE_ENV check, so a production build does not contain it.
 */
export async function createLiffAdapter(): Promise<LiffAdapter | null> {
  const kind = selectLiffAdapterKind({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_LIFF_ID: process.env.NEXT_PUBLIC_LIFF_ID,
    NEXT_PUBLIC_FAITHMAP_MOCK_LIFF: process.env.NEXT_PUBLIC_FAITHMAP_MOCK_LIFF,
  });

  if (kind === 'mock' && process.env.NODE_ENV !== 'production') {
    const { MockLiffAdapter } = await import('./mock-adapter');
    return new MockLiffAdapter();
  }
  if (kind === 'real') {
    const { RealLiffAdapter } = await import('./real-adapter');
    return new RealLiffAdapter(process.env.NEXT_PUBLIC_LIFF_ID ?? '');
  }
  return null;
}
