import type { LiffAdapter } from './adapter';

/**
 * DEVELOPMENT ONLY. This is not LINE.
 * - It returns a token that starts with MOCK. The server rejects it before any network call.
 * - It cannot sign anyone in and cannot create a LINE identity.
 * - It never changes what the server allows.
 * Use it to look at screens and to test error messages on a phone-size browser.
 */
export class MockLiffAdapter implements LiffAdapter {
  readonly kind = 'mock' as const;
  private loggedIn = false;

  async init(): Promise<void> {
    this.loggedIn = false;
  }
  isLoggedIn(): boolean {
    return this.loggedIn;
  }
  login(): void {
    this.loggedIn = true;
  }
  logout(): void {
    this.loggedIn = false;
  }
  getIDToken(): string | null {
    return this.loggedIn ? 'MOCK-NOT-A-REAL-TOKEN' : null;
  }
  async getDisplayName(): Promise<string | null> {
    return this.loggedIn ? 'ผู้ทดสอบ (โหมดทดสอบ)' : null;
  }
}
