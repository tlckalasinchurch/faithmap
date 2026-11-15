'use client';

import { useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import type { WorkspacePayload } from '@/lib/types';

const ERROR_TEXT: Record<string, string> = {
  BODY_CODE_EXISTS: 'มีรหัสบอดี้นี้อยู่แล้ว กรุณาใช้รหัสอื่น',
  BODY_HAS_ACTIVE_GROUPS: 'บอดี้นี้ยังมีกลุ่มที่ใช้งานอยู่ กรุณาย้ายกลุ่มไปบอดี้อื่นก่อน',
};

const STATUS_TH: Record<string, string> = { active: 'ใช้งาน', inactive: 'พักใช้งาน', archived: 'เก็บถาวร' };

/** FR-01.2, FR-01.3. Admin only. A Body is created, renamed or set inactive here. It is never deleted. */
export function BodyManagementPanel({
  workspace,
  onRefresh,
}: {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
}) {
  const isAdmin = workspace.actor.user.systemRole === 'admin' || workspace.actor.user.systemRole === 'super_admin';
  const [code, setCode] = useState('');
  const [nameTh, setNameTh] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (!isAdmin) return null;

  async function run(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      await apiRequest('/api/v1/organization', { method: 'POST', body });
      setMsg({ type: 'ok', text: okText });
      await onRefresh();
    } catch (err) {
      const c = (err as { code?: string } | null)?.code ?? '';
      setMsg({ type: 'err', text: ERROR_TEXT[c] ?? (err instanceof Error ? err.message : 'ดำเนินการไม่สำเร็จ') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fm-panel space-y-4 bg-white p-6" aria-labelledby="body-mgmt-title">
      <h2 id="body-mgmt-title" className="font-display text-2xl font-extrabold text-[#141413]">
        จัดการบอดี้
      </h2>
      {msg && (
        <p role="alert" className={`fm-panel p-3 text-base font-extrabold ${msg.type === 'ok' ? 'bg-[#C8FF00]' : 'bg-[#FFE4E6] text-[#881337]'}`}>
          {msg.text}
        </p>
      )}
      <form
        className="grid gap-3 md:grid-cols-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await run({ action: 'create_body', code, nameTh }, `สร้างบอดี้ ${nameTh} เรียบร้อย`);
          setCode('');
          setNameTh('');
        }}
      >
        <label className="flex flex-col gap-1 text-lg font-bold">
          รหัสบอดี้
          <input className="fm-input w-full min-w-0 min-h-[48px] text-lg" value={code} onChange={(e) => setCode(e.target.value)} required minLength={2} maxLength={40} />
        </label>
        <label className="flex flex-col gap-1 text-lg font-bold">
          ชื่อบอดี้
          <input className="fm-input w-full min-w-0 min-h-[48px] text-lg" value={nameTh} onChange={(e) => setNameTh(e.target.value)} required minLength={2} maxLength={120} />
        </label>
        <div className="flex items-end">
          <button type="submit" disabled={busy} className="fm-btn fm-btn-lime min-h-[48px] w-full px-4 text-lg">
            สร้างบอดี้ใหม่
          </button>
        </div>
      </form>
      <ul className="space-y-3">
        {workspace.bodies.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 border-2 border-[#141413] p-3">
            <span className="text-lg font-bold">
              {b.nameTh} ({b.code}) · {STATUS_TH[b.status] ?? b.status} · กลุ่มที่ใช้งาน {b.activeGroupCount}
            </span>
            <span className="flex flex-wrap gap-2">
              {b.status === 'active' ? (
                <button
                  type="button"
                  disabled={busy}
                  className="fm-btn min-h-[48px] px-4 text-lg"
                  onClick={() => run({ action: 'update_body', bodyId: b.id, status: 'inactive' }, `พักใช้งาน ${b.nameTh} แล้ว`)}
                >
                  พักใช้งาน
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className="fm-btn min-h-[48px] px-4 text-lg"
                  onClick={() => run({ action: 'update_body', bodyId: b.id, status: 'active' }, `เปิดใช้งาน ${b.nameTh} แล้ว`)}
                >
                  เปิดใช้งานอีกครั้ง
                </button>
              )}
            </span>
          </li>
        ))}
        {workspace.bodies.length === 0 && (
          <li className="text-lg font-bold">ยังไม่มีบอดี้ กรุณาสร้างบอดี้แรกก่อนเพิ่มกลุ่ม</li>
        )}
      </ul>
    </section>
  );
}
