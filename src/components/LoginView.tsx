'use client';

import { useState } from 'react';
import {
  ArrowUpRight,
  KeyRound,
  Lock,
  MessageCircle,
  Sparkles,
  UserCheck,
  Zap,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { DemoAccountOption } from '@/lib/types';

export function LoginView({
  demoEnabled,
  demoAccounts,
  onAuthenticated,
}: {
  demoEnabled: boolean;
  demoAccounts: DemoAccountOption[];
  onAuthenticated: () => Promise<void>;
}) {
  const [username, setUsername] = useState(demoEnabled ? 'admin' : '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      await apiRequest('/api/v1/auth', {
        method: 'POST',
        body: { action: 'login_password', username, password },
      });
      await onAuthenticated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoSwitch(userId: string) {
    setLoading(true);
    setErrorMsg(null);
    try {
      await apiRequest('/api/v1/auth', {
        method: 'POST',
        body: { action: 'demo_switch', userId },
      });
      await onAuthenticated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'สลับบัญชีไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function handleLineDemoConnect() {
    // Real LINE sign-in is added with the LINE MINI App (needs owner-created LINE channel).
    // The old demo call sent a fixed LINE ID to the server. That call is removed for security.
    setErrorMsg(
      'การเข้าสู่ระบบด้วย LINE ยังไม่เปิดใช้งาน กรุณาเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านไปก่อน'
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden px-4 py-6 text-[#141413] sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Bento Hero Banner */}
        <section className="fm-panel-ink relative overflow-hidden p-5 sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-[#F0F4F8] sm:text-5xl">
                FaithMap · พันธกิจบ้านกาฬสินธุ์
              </h1>
              <p className="mt-3 text-lg font-medium text-[#E2E8F0]">
                ระบบส่งรายงานกลุ่มบ้านประจำสัปดาห์ ครบจบใน 3 ขั้นตอน ติดตามดูแลสมาชิก
                และสรุปประชุมผู้นำวันอาทิตย์ 20:30 น.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <span className="fm-sticker bg-[#C8FF00] text-[#141413]">
                <Zap className="h-4 w-4" aria-hidden="true" />
                <span>ส่งรายงานง่าย 3 ขั้นตอน</span>
              </span>
              <span className="fm-sticker bg-[#FFB703] text-[#141413]">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>18 อำเภอกาฬสินธุ์</span>
              </span>
            </div>
          </div>
        </section>

        {errorMsg && (
          <div
            role="alert"
            className="fm-panel bg-[#FFE4E6] p-4 text-base font-bold text-[#881337]"
          >
            {errorMsg}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Login Studio Deck */}
          <section className={`fm-panel p-6 sm:p-7 ${demoEnabled ? 'lg:col-span-5' : 'lg:col-span-8 lg:col-start-3'}`}>
            <div className="mb-5 flex items-center justify-between gap-3 border-b-2 border-[#141413] pb-4">
              <h2 className="font-display text-2xl font-extrabold text-[#141413]">
                เข้าสู่ระบบผู้นำพันธกิจ
              </h2>
              <Lock className="h-6 w-6 text-[#1D4ED8]" aria-hidden="true" />
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleLineDemoConnect}
              className="fm-btn mb-5 min-h-[54px] w-full bg-[#007530] text-base text-white hover:bg-[#005c25]"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              <span>เข้าสู่ระบบด้วย LINE</span>
            </button>

            <form
              onSubmit={handlePasswordLogin}
              className="space-y-4 border-t-2 border-dashed border-[#141413]/30 pt-5"
            >
              <div>
                <label
                  htmlFor="fm-login-user"
                  className="mb-1.5 block text-base font-bold text-[#141413]"
                >
                  ชื่อผู้ใช้ (Username)
                </label>
                <input
                  id="fm-login-user"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="fm-input w-full"
                  placeholder="เช่น admin"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="fm-login-pass"
                  className="mb-1.5 block text-base font-bold text-[#141413]"
                >
                  รหัสผ่าน (Password)
                </label>
                <input
                  id="fm-login-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="fm-input w-full"
                  required
                />
                {demoEnabled && (
                  <p className="mt-2 text-base font-medium text-[#27272A]">
                    รหัสผ่านเริ่มต้นสำหรับบัญชีนำร่อง:{' '}
                    <code className="rounded-md border border-[#141413] bg-[#E2E8F0] px-2 py-0.5 font-mono font-bold text-[#141413]">
                      FaithMap2026!
                    </code>
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="fm-btn fm-btn-lime min-h-[54px] w-full text-base"
              >
                <KeyRound className="h-5 w-5" aria-hidden="true" />
                <span>{loading ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}</span>
              </button>
            </form>
          </section>

          {/* Role Switcher Bento Deck */}
          {demoEnabled && (
            <section className="fm-panel overflow-hidden lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#141413] bg-[#E2E8F0] px-6 py-4">
                <h2 className="font-display text-2xl font-extrabold text-[#141413]">
                  เลือกชื่อผู้นำเพื่อเข้าใช้งานทันที
                </h2>
                <UserCheck className="h-6 w-6 text-[#1D4ED8]" aria-hidden="true" />
              </div>

              <p className="border-b-2 border-[#141413] bg-[#F0F4F8] px-6 py-3 text-base font-medium text-[#27272A]">
                แตะที่ชื่อผู้นำเพื่อทดสอบการส่งรายงาน ตรวจทาน อนุมัติ และดูข้อมูลในมุมมองของแต่ละตำแหน่ง
              </p>

              <div className="divide-y-2 divide-[#141413]">
                {demoAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemoSwitch(acc.id)}
                    className="flex min-h-[60px] w-full items-center justify-between gap-3 bg-white px-6 py-3.5 text-left transition hover:bg-[#C8FF00]/40 disabled:opacity-60"
                  >
                    <div>
                      <div className="text-base font-extrabold text-[#141413]">
                        {acc.displayName}
                      </div>
                      <div className="font-mono text-base font-medium text-[#27272A]">
                        @{acc.username}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="fm-sticker bg-[#DBEAFE] text-[#141413]">
                        {acc.systemRole}
                      </span>
                      <ArrowUpRight className="h-5 w-5 text-[#141413]" aria-hidden="true" />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
