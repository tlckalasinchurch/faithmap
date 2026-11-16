'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Info, Lock, ShieldCheck, UserPlus } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { createLiffAdapter, type LiffAdapter } from '@/lib/liff/adapter';
import { LineRedirecting, lineRegister, lineSignIn } from '@/lib/liff/line-auth-client';
import { createOnceGuard, isLineUnlinkedError } from '@/lib/liff/login-flow';

const LINE_NOT_READY =
  'ระบบเข้าสู่ระบบด้วย LINE ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ';
const LINE_UNLINKED =
  'บัญชี LINE นี้ยังไม่ได้ลงทะเบียนกับ FaithMap กรุณากรอกข้อมูลด้านล่างเพื่อส่งคำขอใช้งาน';

function LineIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 5.82 2 10.53c0 2.93 1.77 5.51 4.5 6.98-.2 1.34-.84 3.42-.96 3.93-.16.66.24.65.5.48.21-.14 2.87-1.95 4.05-2.76.62.1 1.26.15 1.91.15 5.52 0 10-3.82 10-8.53S17.52 2 12 2z" />
    </svg>
  );
}

/**
 * Sign-in screen. LINE is the only sign-in shown to members and leaders.
 * A small, collapsed password form stays for administrators only.
 */
export function LoginView({
  autoSignIn = true,
  onUserStartedSignIn,
  onAuthenticated,
}: {
  autoSignIn?: boolean;
  onUserStartedSignIn?: () => void;
  onAuthenticated: () => Promise<void>;
}) {
  const [adapter, setAdapter] = useState<LiffAdapter | null>(null);
  const [lineReady, setLineReady] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [view, setView] = useState<'main' | 'register'>('main');
  const [regName, setRegName] = useState('');
  const [regNote, setRegNote] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // The parent passes a new function on each render. Keep the latest one in a ref,
  // so the start-up effect runs once and never signs in with the same LINE token twice.
  const onAuthenticatedRef = useRef(onAuthenticated);
  onAuthenticatedRef.current = onAuthenticated;
  const autoSignInRef = useRef(autoSignIn);
  autoSignInRef.current = autoSignIn;
  const onceGuard = useRef(createOnceGuard());

  function showLineError(err: unknown) {
    if (err instanceof LineRedirecting) return;
    if (isLineUnlinkedError(err)) {
      setErrorMsg(LINE_UNLINKED);
      setView('register');
      return;
    }
    setErrorMsg(err instanceof Error ? err.message : 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }

  useEffect(() => {
    let mounted = true;
    void onceGuard.current.run(async () => {
      let a: LiffAdapter | null = null;
      try {
        a = await createLiffAdapter();
        if (a) await a.init();
      } catch {
        a = null; // LINE could not start. The screen explains this; no redirect.
      }
      if (!mounted) return;
      setAdapter(a);
      setLineReady(a ? 'ready' : 'unavailable');

      // Coming back from the LINE sign-in page: finish the sign-in once,
      // unless the user just manually signed out.
      if (autoSignInRef.current && a?.isLoggedIn()) {
        setLoading(true);
        try {
          await lineSignIn(a);
          await onAuthenticatedRef.current();
        } catch (err) {
          if (mounted) showLineError(err);
        } finally {
          if (mounted) setLoading(false);
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function handleLineLogin() {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!adapter) {
      setErrorMsg(LINE_NOT_READY);
      return;
    }
    onUserStartedSignIn?.();
    setLoading(true);
    try {
      await lineSignIn(adapter);
      await onAuthenticatedRef.current();
    } catch (err) {
      showLineError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLineRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!regName.trim()) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!adapter) {
      setErrorMsg(LINE_NOT_READY);
      return;
    }
    onUserStartedSignIn?.();
    setLoading(true);
    try {
      await lineRegister(adapter, regName.trim(), regNote.trim());
      setSuccessMsg(
        'ส่งคำขอแล้ว ผู้ดูแลระบบจะตรวจสอบและกำหนดกลุ่มบ้านให้ท่าน เมื่อได้รับอนุมัติแล้ว ให้กลับมาที่หน้านี้และกด “เข้าสู่ระบบด้วย LINE” อีกครั้ง'
      );
      setView('main');
      setRegName('');
      setRegNote('');
    } catch (err) {
      if (err instanceof LineRedirecting) return;
      setErrorMsg(err instanceof Error ? err.message : 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiRequest('/api/v1/auth', {
        method: 'POST',
        body: { action: 'login_password', username: adminUsername, password: adminPassword },
      });
      await onAuthenticatedRef.current();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบชื่อผู้ใช้และรหัสผ่าน');
    } finally {
      setLoading(false);
    }
  }

  const lineDisabled = loading || lineReady !== 'ready';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center overflow-x-hidden px-4 py-6 text-[#141413] sm:py-12">
      <div className="w-full max-w-md space-y-5">
        {/* Compact header: small on phones so the LINE button stays near the top */}
        <header className="fm-panel-ink flex items-center gap-3 p-4 sm:p-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#C8FF00] font-display text-xl font-extrabold text-[#141413]">
            F
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#F0F4F8] sm:text-3xl">FaithMap</h1>
            <p className="text-sm font-medium leading-snug text-[#E2E8F0] sm:text-base">
              ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน
            </p>
          </div>
        </header>

        {errorMsg && (
          <div role="alert" className="fm-panel bg-[#FFE4E6] p-4 text-base font-bold text-[#881337]">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div role="status" className="fm-panel flex items-start gap-2 bg-[#DCFCE7] p-4 text-base font-bold text-[#14532D]">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#16A34A]" aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
        )}

        {view === 'main' && (
          <section className="fm-panel space-y-5 bg-white p-5 sm:p-7">
            <div className="space-y-1 text-center">
              <h2 className="font-display text-2xl font-extrabold">เข้าสู่ระบบ</h2>
              <p className="text-base text-[#27272A]">ใช้บัญชี LINE ของท่านเพื่อส่งรายงานและดูแลสมาชิก</p>
            </div>

            {lineReady === 'unavailable' && (
              <p role="status" className="rounded-xl border-2 border-[#141413] bg-[#FEF3C7] p-3 text-base font-bold text-[#78350F]">
                {LINE_NOT_READY}
              </p>
            )}

            <div className="space-y-3">
              <button
                type="button"
                disabled={lineDisabled}
                onClick={handleLineLogin}
                className="fm-btn flex min-h-[60px] w-full items-center justify-center gap-3 bg-[#06C755] text-lg font-bold text-white shadow-md transition hover:bg-[#05b04c] active:scale-[0.99] disabled:opacity-60"
              >
                <LineIcon className="h-6 w-6 shrink-0" />
                <span>
                  {loading ? 'กำลังเชื่อมต่อ LINE…' : lineReady === 'checking' ? 'กำลังเตรียม LINE…' : 'เข้าสู่ระบบด้วย LINE'}
                </span>
              </button>

              <button
                type="button"
                disabled={lineDisabled}
                onClick={() => {
                  setErrorMsg(null);
                  setSuccessMsg(null);
                  setView('register');
                }}
                className="fm-btn fm-btn-paper flex min-h-[52px] w-full items-center justify-center gap-2 text-base font-bold disabled:opacity-60"
              >
                <UserPlus className="h-5 w-5 text-[#2563EB]" aria-hidden="true" />
                <span>ใช้งานครั้งแรก? ขอลงทะเบียนด้วย LINE</span>
              </button>

              <p className="flex items-start gap-2 text-sm text-[#475569]">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>ถ้าเปิดจากคอมพิวเตอร์หรือเบราว์เซอร์อื่น ระบบจะพาไปหน้า LINE เพื่อยืนยันตัวตน แล้วกลับมาที่หน้านี้</span>
              </p>
            </div>

            <div className="border-t-2 border-dashed border-[#CBD5E1] pt-4 text-center">
              {!showAdminLogin ? (
                <button
                  type="button"
                  onClick={() => setShowAdminLogin(true)}
                  className="min-h-[44px] px-2 text-sm font-semibold text-[#475569] hover:text-[#0F172A] hover:underline"
                >
                  สำหรับผู้ดูแลระบบ
                </button>
              ) : (
                <form onSubmit={handleAdminPasswordLogin} className="space-y-4 pt-1 text-left">
                  <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
                    <span className="flex items-center gap-1.5 text-base font-bold">
                      <Lock className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
                      เข้าสู่ระบบผู้ดูแลระบบ
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAdminLogin(false)}
                      className="min-h-[44px] px-2 text-sm text-[#475569] hover:underline"
                    >
                      ซ่อน
                    </button>
                  </div>
                  <div>
                    <label htmlFor="fm-admin-user" className="mb-1 block text-base font-bold">
                      ชื่อผู้ใช้
                    </label>
                    <input
                      id="fm-admin-user"
                      type="text"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      className="fm-input min-h-[48px] w-full text-base"
                      autoCapitalize="none"
                      autoComplete="username"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="fm-admin-pass" className="mb-1 block text-base font-bold">
                      รหัสผ่าน
                    </label>
                    <input
                      id="fm-admin-pass"
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="fm-input min-h-[48px] w-full text-base"
                      autoComplete="current-password"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="fm-btn fm-btn-lime flex min-h-[52px] w-full items-center justify-center gap-2 text-base font-bold"
                  >
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                    <span>{loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</span>
                  </button>
                </form>
              )}
            </div>
          </section>
        )}

        {view === 'register' && (
          <section className="fm-panel space-y-5 bg-white p-5 sm:p-7">
            <div className="space-y-1 border-b-2 border-[#141413] pb-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setView('main');
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[#E2E8F0]"
                  aria-label="ย้อนกลับ"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h2 className="font-display text-2xl font-extrabold">ขอใช้งานครั้งแรก</h2>
              </div>
              <p className="text-base text-[#27272A]">
                กรอกชื่อของท่าน ผู้ดูแลระบบจะตรวจสอบก่อนอนุมัติ ระหว่างรออนุมัติยังเข้าใช้งานไม่ได้
              </p>
            </div>

            <form onSubmit={handleLineRegister} className="space-y-4">
              <div>
                <label htmlFor="fm-reg-name" className="mb-1.5 block text-base font-bold">
                  ชื่อ-นามสกุล <span className="text-[#B91C1C]">*</span>
                </label>
                <input
                  id="fm-reg-name"
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="fm-input min-h-[52px] w-full text-base"
                  placeholder="ชื่อ นามสกุล"
                  maxLength={80}
                  autoComplete="name"
                  required
                />
              </div>
              <div>
                <label htmlFor="fm-reg-note" className="mb-1.5 block text-base font-bold">
                  กลุ่มบ้านที่ท่านอยู่ / ข้อความถึงผู้ดูแล (ไม่บังคับ)
                </label>
                <textarea
                  id="fm-reg-note"
                  value={regNote}
                  onChange={(e) => setRegNote(e.target.value)}
                  className="fm-input min-h-[96px] w-full text-base"
                  placeholder="ชื่อกลุ่มบ้านของท่าน"
                  maxLength={300}
                />
              </div>
              <div className="space-y-3 pt-1">
                <button
                  type="submit"
                  disabled={loading || !regName.trim() || lineReady !== 'ready'}
                  className="fm-btn flex min-h-[56px] w-full items-center justify-center gap-2 bg-[#06C755] text-base font-bold text-white shadow-md transition hover:bg-[#05b04c] disabled:opacity-60"
                >
                  <LineIcon className="h-5 w-5" />
                  <span>{loading ? 'กำลังส่งคำขอ…' : 'ยืนยันตัวตนด้วย LINE และส่งคำขอ'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setView('main');
                  }}
                  className="fm-btn fm-btn-paper min-h-[48px] w-full text-base font-bold"
                >
                  ย้อนกลับ
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
