'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Lock,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { WorkspacePayload } from '@/lib/types';

export function PastoralCareTab({
  workspace,
  onRefresh,
}: {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
}) {
  const [groupId, setGroupId] = useState(workspace.groups[0]?.id ?? '');
  const [fullName, setFullName] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const isPastor = workspace.actor.user.systemRole === 'mission_leader';
  const isPiiMaskedView =
    workspace.members.some((m) => m.piiMasked) ||
    workspace.visitors.some((v) => v.piiMasked) ||
    isPastor;

  async function handleRegisterVisitor(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await apiRequest('/api/v1/pastoral', {
        method: 'POST',
        body: {
          action: 'register_visitor',
          groupId,
          fullName,
          nickname: nickname || null,
          phoneE164: phone || null,
          consentForContact: consent,
          visitType: 'new_visitor',
          createFollowUp: true,
        },
      });
      setFullName('');
      setNickname('');
      setPhone('');
      setConsent(false);
      setMsg({ type: 'ok', text: 'ลงทะเบียนผู้เยี่ยมใหม่และสร้างงานติดตามเรียบร้อยแล้ว' });
      await onRefresh();
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถบันทึกผู้เยี่ยมได้',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleConvertVisitor(visitorId: string, originGroupId: string | null) {
    setBusy(true);
    setMsg(null);
    try {
      await apiRequest('/api/v1/pastoral', {
        method: 'POST',
        body: {
          action: 'convert_visitor',
          visitorId,
          targetGroupId: originGroupId || groupId,
        },
      });
      setMsg({ type: 'ok', text: 'โอนย้ายผู้เยี่ยมเป็นสมาชิกประจำกลุ่มเรียบร้อยแล้ว' });
      await onRefresh();
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถโอนย้ายสมาชิกได้',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleFollowUpStatus(
    followUpId: string,
    status: 'open' | 'in_progress' | 'completed'
  ) {
    setBusy(true);
    setMsg(null);
    try {
      await apiRequest('/api/v1/pastoral', {
        method: 'POST',
        body: {
          action: 'update_follow_up',
          followUpId,
          status,
        },
      });
      await onRefresh();
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'อัปเดตสถานะไม่สำเร็จ',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {isPiiMaskedView && (
        <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-950">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" aria-hidden="true" />
          <div>
            <p className="text-base font-bold">โหมดปกป้องข้อมูลส่วนบุคคล (DEC-06 PII Masking)</p>
            <p className="text-sm">
              บทบาทระดับภาพรวม (เช่น ศิษยาภิบาล) จะเห็นภาพรวมการดูแลโดยไม่เปิดเผยเบอร์โทรและชื่อ-นามสกุลจริงรายบุคคล
            </p>
          </div>
        </div>
      )}

      {msg && (
        <div
          role="alert"
          className={`rounded-xl border p-4 text-base font-semibold ${
            msg.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
              : 'border-rose-300 bg-rose-50 text-rose-950'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Visitor Registration Card (DEC-10 PDPA) */}
      <form
        onSubmit={handleRegisterVisitor}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-teal-700" aria-hidden="true" />
          <h3 className="text-xl font-bold text-slate-900">
            บันทึกผู้เยี่ยมใหม่ (บังคับยินยอม PDPA ก่อนเก็บเบอร์โทร · DEC-10)
          </h3>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            aria-label="เลือกกลุ่มพันธกิจ"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base"
          >
            {workspace.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nameTh}
              </option>
            ))}
          </select>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="ชื่อ-นามสกุลผู้เยี่ยม *"
            className="min-h-[48px] rounded-xl border border-slate-300 px-3 text-base"
          />
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="ชื่อเล่น"
            className="min-h-[48px] rounded-xl border border-slate-300 px-3 text-base"
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="เบอร์โทร +66..."
            className="min-h-[48px] rounded-xl border border-slate-300 px-3 text-base"
          />
        </div>

        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <label className="flex min-h-[48px] cursor-pointer items-center gap-3 text-base text-slate-800">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="h-5 w-5 accent-teal-700"
            />
            <span>ผู้เยี่ยมให้ความยินยอมเก็บข้อมูลติดต่อ (PDPA Consent DEC-10)</span>
          </label>
          <button
            type="submit"
            disabled={busy || !groupId}
            className="min-h-[48px] rounded-xl bg-teal-700 px-5 py-2 text-base font-bold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            บันทึกผู้เยี่ยมใหม่
          </button>
        </div>
      </form>

      {/* Follow-Up Queue */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-teal-700" aria-hidden="true" />
          <h3 className="text-xl font-bold text-slate-900">
            งานเยี่ยมติดตามอภิบาล ({workspace.followUps.length} รายการ)
          </h3>
        </div>
        <div className="space-y-2.5">
          {workspace.followUps.map((f) => (
            <div
              key={f.id}
              className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:flex-row sm:items-center"
            >
              <div>
                <div className="text-base font-bold text-slate-900">{f.title}</div>
                <div className="text-sm text-slate-600">
                  {f.groupName} {f.notes ? `· ${f.notes}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {f.status !== 'completed' ? (
                  <>
                    {f.status === 'open' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleFollowUpStatus(f.id, 'in_progress')}
                        className="min-h-[44px] rounded-xl border border-sky-300 bg-sky-50 px-3 text-sm font-bold text-sky-900"
                      >
                        กำลังติดตาม
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleFollowUpStatus(f.id, 'completed')}
                      className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-emerald-700 px-3 text-sm font-bold text-white"
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      <span>เยี่ยมสำเร็จ</span>
                    </button>
                  </>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-900">
                    ดำเนินการเสร็จสิ้น
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Visitors & Members Grids */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-teal-700" aria-hidden="true" />
            <h3 className="text-xl font-bold text-slate-900">
              ผู้เยี่ยม ({workspace.visitors.length})
            </h3>
          </div>
          <div className="space-y-2.5">
            {workspace.visitors.map((v) => (
              <div
                key={v.id}
                className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center"
              >
                <div>
                  <div className="text-base font-bold text-slate-900">{v.fullName}</div>
                  <div className="text-sm text-slate-600">
                    {v.originGroupName} · โทร: {v.phone ?? 'ไม่ระบุ'} · PDPA:{' '}
                    {v.consentForContact ? 'ยินยอมแล้ว' : 'ยังไม่ให้เบอร์'}
                  </div>
                </div>
                {v.convertedMemberId ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                    โอนเป็นสมาชิกแล้ว
                  </span>
                ) : (
                  !isPastor && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleConvertVisitor(v.id, v.firstOriginGroupId)}
                      className="min-h-[44px] shrink-0 rounded-xl border border-teal-700 px-3 text-sm font-bold text-teal-800 hover:bg-teal-50"
                    >
                      รับเป็นสมาชิกกลุ่ม
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-5 w-5 text-teal-700" aria-hidden="true" />
            <h3 className="text-xl font-bold text-slate-900">
              สมาชิกกลุ่มพันธกิจบ้าน ({workspace.members.length})
            </h3>
          </div>
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {workspace.members.map((m) => (
              <div
                key={m.membershipId}
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3"
              >
                <div>
                  <div className="text-base font-bold text-slate-900">{m.fullName}</div>
                  <div className="text-sm text-slate-600">
                    {m.groupName} · โทร: {m.phone ?? '-'}
                  </div>
                </div>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {m.membershipRole}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
