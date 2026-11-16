'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Zap,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { createLiffAdapter, type LiffAdapter } from '@/lib/liff/adapter';
import { LineRedirecting, lineRegister, lineSignIn } from '@/lib/liff/line-auth-client';
import type { DemoAccountOption } from '@/lib/types';

function LineIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 5.82 2 10.53c0 2.93 1.77 5.51 4.5 6.98-.2 1.34-.84 3.42-.96 3.93-.16.66.24.65.5.48.21-.14 2.87-1.95 4.05-2.76.62.1 1.26.15 1.91.15 5.52 0 10-3.82 10-8.53S17.52 2 12 2zm-3.3 11.23H6.88a.63.63 0 0 1-.63-.63V8.82c0-.35.28-.63.63-.63s.63.28.63.63v3.15h1.19c.35 0 .63.28.63.63 0 .35-.28.63-.63.63zm2.52-.63a.63.63 0 0 1-1.26 0V8.82a.63.63 0 0 1 1.26 0v3.78zm4.4 0a.63.63 0 0 1-.5.62.65.65 0 0 1-.61-.24l-1.92-2.61v2.23a.63.63 0 0 1-1.26 0V8.82c0-.35.28-.63.63-.63.21 0 .4.1.51.26l1.92 2.6V8.82a.63.63 0 0 1 1.26 0v3.78zm3.2-2.52h-1.52v.63h1.52a.63.63 0 0 1 0 1.26h-2.15a.63.63 0 0 1-.63-.63V8.82c0-.35.28-.63.63-.63h2.15a.63.63 0 0 1 0 1.26h-1.52v.63h1.52a.63.63 0 0 1 0 1.26z" />
    </svg>
  );
}

export function LoginView({
  demoEnabled = false,
  demoAccounts = [],
  onAuthenticated,
}: {
  demoEnabled?: boolean;
  demoAccounts?: DemoAccountOption[];
  onAuthenticated: () => Promise<void>;
}) {
  const [adapter, setAdapter] = useState<LiffAdapter | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Views: 'main' (LINE login only) | 'register' (first-time LINE request)
  const [view, setView] = useState<'main' | 'register'>('main');

  // Registration form state
  const [regName, setRegName] = useState('');
  const [regNote, setRegNote] = useState('');

  // Subtle Admin Login Accordion
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const a = await createLiffAdapter();
        if (!a) return;
        await a.init();
        if (!mounted) return;
        setAdapter(a);

        // Auto-authenticate if returning from LINE OAuth redirect
        if (a.isLoggedIn()) {
          setLoading(true);
          try {
            await lineSignIn(a);
            await onAuthenticated();
          } catch (err) {
            if (err instanceof LineRedirecting) return;
            if (err instanceof Error && err.message.includes('ยังไม่ได้เชื่อม')) {
              setErrorMsg('บัญชี LINE นี้ยังไม่ได้ลงทะเบียนในระบบ กรุณากด "ขอลงทะเบียนใช้งานครั้งแรกด้วย LINE"');
              setView('register');
            } else if (err instanceof Error) {
              setErrorMsg(err.message);
            }
          } finally {
            if (mounted) setLoading(false);
          }
        }
      } catch {
        // LIFF init failed silently if not in LINE context
      }
    }
    void init();
    return () => {
      mounted = false;
    };
  }, [onAuthenticated]);

  async function handleLineLogin() {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      let currentAdapter = adapter;
      if (!currentAdapter) {
        currentAdapter = await createLiffAdapter();
        if (currentAdapter) {
          await currentAdapter.init();
          setAdapter(currentAdapter);
        }
      }

      if (!currentAdapter) {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '2012616582-tsDHY0DR';
        window.location.href = `https://liff.line.me/${liffId}`;
        return;
      }

      if (!currentAdapter.isLoggedIn()) {
        currentAdapter.login();
        return;
      }

      await lineSignIn(currentAdapter);
      await onAuthenticated();
    } catch (err) {
      if (err instanceof LineRedirecting) return;
      if (err instanceof Error && err.message.includes('ยังไม่ได้เชื่อม')) {
        setErrorMsg('บัญชี LINE นี้ยังไม่ได้ลงทะเบียนในระบบ กรุณากด "ขอลงทะเบียนใช้งานครั้งแรกด้วย LINE" ด้านล่าง');
        setView('register');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleLineRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!regName.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      let currentAdapter = adapter;
      if (!currentAdapter) {
        currentAdapter = await createLiffAdapter();
        if (currentAdapter) {
          await currentAdapter.init();
          setAdapter(currentAdapter);
        }
      }

      if (!currentAdapter) {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '2012616582-tsDHY0DR';
        window.location.href = `https://liff.line.me/${liffId}`;
        return;
      }

      await lineRegister(currentAdapter, regName.trim(), regNote.trim());
      setSuccessMsg('ส่งคำขอลงทะเบียนเรียบร้อยแล้ว ผู้ดูแลระบบคริสตจักรจะตรวจสอบและอนุมัติสิทธิ์ให้ท่านเข้าใช้งาน');
      setView('main');
      setRegName('');
      setRegNote('');
    } catch (err) {
      if (err instanceof LineRedirecting) return;
      setErrorMsg(err instanceof Error ? err.message : 'ส่งคำขอลงทะเบียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
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
      await onAuthenticated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบชื่อผู้ใช้และรหัสผ่าน');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F8FAFC] px-4 py-8 text-[#141413] sm:py-12 flex flex-col justify-center items-center">
      <div className="w-full max-w-lg space-y-6">
        {/* Bento Hero Header */}
        <section className="fm-panel-ink relative overflow-hidden p-6 sm:p-8 text-center sm:text-left">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="fm-sticker bg-[#C8FF00] text-[#141413]">
                <Zap className="h-4 w-4" aria-hidden="true" />
                <span>พันธกิจกลุ่มบ้าน</span>
              </span>
              <span className="fm-sticker bg-[#FFB703] text-[#141413]">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>18 อำเภอกาฬสินธุ์</span>
              </span>
            </div>

            <div>
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-[#F0F4F8] sm:text-4xl">
                FaithMap · พันธกิจกาฬสินธุ์
              </h1>
              <p className="mt-2 text-base font-medium text-[#E2E8F0]">
                ระบบบันทึกและติดตามพันธกิจกลุ่มบ้านประจำสัปดาห์ คริสตจักรพันธกิจกาฬสินธุ์
              </p>
            </div>
          </div>
        </section>

        {/* Status Alerts */}
        {errorMsg && (
          <div
            role="alert"
            className="fm-panel bg-[#FFE4E6] p-4 text-base font-bold text-[#881337] border-2 border-[#141413]"
          >
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="fm-panel bg-[#DCFCE7] p-4 text-base font-bold text-[#14532D] border-2 border-[#141413] flex items-center gap-2"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[#16A34A]" aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* View: Main LINE Login */}
        {view === 'main' && (
          <section className="fm-panel bg-white p-6 sm:p-8 space-y-6 shadow-xl border-2 border-[#141413]">
            <div className="text-center space-y-2 border-b-2 border-[#141413] pb-5">
              <h2 className="font-display text-2xl font-extrabold text-[#141413]">
                เข้าสู่ระบบผู้นำและสมาชิก
              </h2>
              <p className="text-base text-[#475569]">
                เข้าสู่ระบบอย่างปลอดภัยด้วยบัญชี LINE ของท่าน เพื่อส่งรายงานและดูแลสมาชิก
              </p>
            </div>

            <div className="space-y-4">
              {/* Primary LINE Login Button */}
              <button
                type="button"
                disabled={loading}
                onClick={handleLineLogin}
                className="fm-btn min-h-[60px] w-full bg-[#06C755] text-lg font-bold text-white hover:bg-[#05b04c] active:scale-[0.99] shadow-md flex items-center justify-center gap-3 transition"
              >
                <LineIcon className="h-6 w-6 shrink-0" />
                <span>{loading ? 'กำลังเชื่อมต่อ LINE…' : 'เข้าสู่ระบบด้วย LINE'}</span>
              </button>

              {/* First-time LINE registration button */}
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setErrorMsg(null);
                  setSuccessMsg(null);
                  setView('register');
                }}
                className="fm-btn fm-btn-paper min-h-[52px] w-full text-base font-bold text-[#141413] flex items-center justify-center gap-2 hover:bg-[#E2E8F0]"
              >
                <UserPlus className="h-5 w-5 text-[#2563EB]" aria-hidden="true" />
                <span>ขอลงทะเบียนใช้งานครั้งแรกด้วย LINE</span>
              </button>
            </div>

            {/* Subtle Admin Login Toggle */}
            <div className="pt-4 border-t-2 border-dashed border-[#CBD5E1] text-center">
              {!showAdminLogin ? (
                <button
                  type="button"
                  onClick={() => setShowAdminLogin(true)}
                  className="text-xs font-semibold text-[#64748B] hover:text-[#0F172A] hover:underline transition"
                >
                  เข้าสู่ระบบสำหรับผู้ดูแลระบบ (Admin)
                </button>
              ) : (
                <form onSubmit={handleAdminPasswordLogin} className="space-y-4 text-left pt-2">
                  <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                    <span className="text-sm font-bold text-[#141413] flex items-center gap-1.5">
                      <Lock className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
                      เข้าสู่ระบบผู้ดูแลระบบ (Superadmin)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAdminLogin(false)}
                      className="text-xs text-[#64748B] hover:underline"
                    >
                      ซ่อน
                    </button>
                  </div>

                  <div>
                    <label
                      htmlFor="fm-admin-user"
                      className="mb-1 block text-sm font-bold text-[#141413]"
                    >
                      ชื่อผู้ใช้
                    </label>
                    <input
                      id="fm-admin-user"
                      type="text"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      className="fm-input w-full min-h-[46px] text-base"
                      placeholder="admin"
                      required
                      autoComplete="username"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="fm-admin-pass"
                      className="mb-1 block text-sm font-bold text-[#141413]"
                    >
                      รหัสผ่าน
                    </label>
                    <input
                      id="fm-admin-pass"
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="fm-input w-full min-h-[46px] text-base"
                      required
                      autoComplete="current-password"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="fm-btn fm-btn-lime min-h-[48px] w-full text-base font-bold flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                    <span>{loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบผู้ดูแลระบบ'}</span>
                  </button>
                </form>
              )}
            </div>
          </section>
        )}

        {/* View: First-Time Registration via LINE */}
        {view === 'register' && (
          <section className="fm-panel bg-white p-6 sm:p-8 space-y-6 shadow-xl border-2 border-[#141413]">
            <div className="space-y-2 border-b-2 border-[#141413] pb-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setView('main');
                  }}
                  className="rounded-lg p-1 hover:bg-[#E2E8F0] transition"
                  aria-label="ย้อนกลับ"
                >
                  <ArrowLeft className="h-5 w-5 text-[#141413]" />
                </button>
                <h2 className="font-display text-2xl font-extrabold text-[#141413]">
                  ขอลงทะเบียนใช้งานด้วย LINE
                </h2>
              </div>
              <p className="text-sm text-[#475569]">
                กรอกข้อมูลของท่านเพื่อให้ผู้ดูแลระบบตรวจสอบและอนุมัติการเชื่อมโยงบัญชี LINE
              </p>
            </div>

            <form onSubmit={handleLineRegister} className="space-y-4">
              <div>
                <label htmlFor="fm-reg-name" className="mb-1.5 block text-base font-bold text-[#141413]">
                  ชื่อ-นามสกุล <span className="text-red-600">*</span>
                </label>
                <input
                  id="fm-reg-name"
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="fm-input w-full min-h-[50px] text-base"
                  placeholder="เช่น ผู้นำสมศักดิ์ นนท์ทัน"
                  maxLength={80}
                  required
                />
              </div>

              <div>
                <label htmlFor="fm-reg-note" className="mb-1.5 block text-base font-bold text-[#141413]">
                  สังกัดกลุ่มบ้าน / ข้อความถึงผู้ดูแล (ไม่บังคับ)
                </label>
                <textarea
                  id="fm-reg-note"
                  value={regNote}
                  onChange={(e) => setRegNote(e.target.value)}
                  className="fm-input w-full min-h-[90px] text-base"
                  placeholder="เช่น กลุ่มบ้านห้วยเม็ก 1, บอดี้อำเภอเมือง"
                  maxLength={300}
                />
              </div>

              <div className="space-y-3 pt-2">
                <button
                  type="submit"
                  disabled={loading || !regName.trim()}
                  className="fm-btn min-h-[56px] w-full bg-[#06C755] text-base font-bold text-white hover:bg-[#05b04c] active:scale-[0.99] shadow-md flex items-center justify-center gap-2 transition disabled:opacity-60"
                >
                  <LineIcon className="h-5 w-5" />
                  <span>{loading ? 'กำลังส่งคำขอ…' : 'ยืนยันและส่งคำขอลงทะเบียน'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setView('main');
                  }}
                  className="fm-btn fm-btn-paper min-h-[48px] w-full text-base font-bold text-[#141413] hover:bg-[#E2E8F0]"
                >
                  ย้อนกลับ
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-[#64748B]">
          คริสตจักรพันธกิจกาฬสินธุ์ · FaithMap Thailand Pilot
        </p>
      </div>
    </div>
  );
}
