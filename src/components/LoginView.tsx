'use client';

import { useState } from 'react';
import { KeyRound, Lock, MessageCircle, ShieldCheck, UserCheck } from 'lucide-react';
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
  const [username, setUsername] = useState('wichai_nonthan');
  const [password, setPassword] = useState('FaithMap2026!');
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
    setLoading(true);
    setErrorMsg(null);
    try {
      await apiRequest('/api/v1/auth', {
        method: 'POST',
        body: {
          action: 'line_oidc',
          lineSubject: 'UlineWichai003',
          displayName: 'วิชัย LINE (โนนทัน)',
        },
      });
      await onAuthenticated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'เชื่อมต่อ LINE Login ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] px-4 py-8 text-[#0F172A]">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-sm font-semibold text-teal-800">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>พื้นที่นำร่อง จังหวัดกาฬสินธุ์</span>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            FaithMap
          </h1>
          <p className="mt-2 text-lg text-slate-700">
            ระบบจัดการและรายงานพันธกิจบ้าน สำหรับคริสตจักร
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-base font-medium text-rose-900"
          >
            {errorMsg}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Lock className="h-5 w-5 text-teal-700" aria-hidden="true" />
              <h2 className="text-xl font-bold text-slate-900">เข้าสู่ระบบ</h2>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleLineDemoConnect}
              className="mb-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#007530] px-4 py-3 text-base font-bold text-white shadow-sm transition hover:bg-[#005c25] disabled:opacity-60"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              <span>เข้าสู่ระบบด้วย LINE (OIDC Demo)</span>
            </button>

            <div className="relative mb-5 text-center">
              <hr className="border-slate-200" />
              <span className="bg-white px-3 text-sm text-slate-500">
                หรือใช้ชื่อผู้ใช้และรหัสผ่าน (DEC-03)
              </span>
            </div>

            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-base font-semibold text-slate-800">
                  ชื่อผู้ใช้ (Username)
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-200"
                  placeholder="เช่น wichai_nonthan"
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-base font-semibold text-slate-800">
                  รหัสผ่าน
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-200"
                  required
                />
                <p className="mt-1.5 text-sm text-slate-600">
                  รหัสผ่านเริ่มต้นสำหรับบัญชีนำร่อง: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">FaithMap2026!</code>
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-base font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60"
              >
                <KeyRound className="h-5 w-5" aria-hidden="true" />
                <span>{loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}</span>
              </button>
            </form>
          </div>

          {demoEnabled && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-teal-700" aria-hidden="true" />
                <h2 className="text-xl font-bold text-slate-900">
                  เลือกบัญชีทดสอบตามบทบาท (กาฬสินธุ์)
                </h2>
              </div>
              <p className="mb-4 text-sm text-slate-600">
                คลิกเพื่อสลับบัญชีและทดสอบสิทธิ์การมองเห็น PII (DEC-06), ลำดับการตรวจทาน (DEC-04) และ Blocked Recovery (CD-07)
              </p>

              <div className="grid max-h-[380px] gap-2.5 overflow-y-auto pr-1">
                {demoAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemoSwitch(acc.id)}
                    className="flex min-h-[52px] w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-left transition hover:border-teal-600 hover:bg-teal-50 disabled:opacity-60"
                  >
                    <div>
                      <div className="text-base font-semibold text-slate-900">
                        {acc.displayName}
                      </div>
                      <div className="text-sm text-slate-600">{acc.username}</div>
                    </div>
                    <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {acc.systemRole}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
