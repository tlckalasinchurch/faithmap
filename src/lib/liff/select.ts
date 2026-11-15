export type LiffAdapterKind = 'real' | 'mock' | 'unavailable';

export interface LiffEnv {
  NODE_ENV?: string;
  NEXT_PUBLIC_LIFF_ID?: string;
  NEXT_PUBLIC_FAITHMAP_MOCK_LIFF?: string;
}

/**
 * Chooses the LIFF adapter. The mock is for local development only:
 * it is never chosen in production and only when the flag is exactly "true".
 */
export function selectLiffAdapterKind(env: LiffEnv): LiffAdapterKind {
  if (env.NODE_ENV === 'production') {
    return env.NEXT_PUBLIC_LIFF_ID ? 'real' : 'unavailable';
  }
  if (env.NEXT_PUBLIC_FAITHMAP_MOCK_LIFF === 'true') return 'mock';
  return env.NEXT_PUBLIC_LIFF_ID ? 'real' : 'unavailable';
}
