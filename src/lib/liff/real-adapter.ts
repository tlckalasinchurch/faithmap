import type { LiffAdapter } from './adapter';

/** The official LIFF SDK. It runs only in the browser. NOT tested against real LINE in this repository. */
export class RealLiffAdapter implements LiffAdapter {
  readonly kind = 'real' as const;
  private liff: typeof import('@line/liff').default | null = null;

  constructor(private readonly liffId: string) {}

  async init(): Promise<void> {
    const mod = await import('@line/liff');
    this.liff = mod.default;
    await this.liff.init({ liffId: this.liffId });
  }
  isLoggedIn(): boolean {
    return this.liff?.isLoggedIn() ?? false;
  }
  login(): void {
    this.liff?.login();
  }
  logout(): void {
    this.liff?.logout();
  }
  getIDToken(): string | null {
    return this.liff?.getIDToken() ?? null;
  }
  async getDisplayName(): Promise<string | null> {
    if (!this.liff?.isLoggedIn()) return null;
    try {
      const profile = await this.liff.getProfile();
      return profile.displayName;
    } catch {
      return null;
    }
  }
}
