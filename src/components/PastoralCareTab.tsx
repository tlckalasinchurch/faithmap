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
import { normalizeThaiPhone } from '@/lib/phone';
import type { WorkspacePayload } from '@/lib/types';

const SOURCE_TH: Record<string, string> = {
  manual: 'สร้างเอง',
  absent_2_weeks: 'ขาดประชุม 2 สัปดาห์',
  absent_3plus_weeks: 'ขาดประชุม 3 สัปดาห์ขึ้นไป',
  visitor_not_returned: 'ผู้เยี่ยมยังไม่กลับมา',
  report_support: 'ขอความช่วยเหลือจากรายงาน',
};

const VISITOR_STATUS_TH: Record<string, string> = {
  first_visit: 'มาครั้งแรก',
  awaiting_followup: 'รอติดตาม',
  contacted: 'ติดต่อแล้ว',
  returned: 'กลับมาแล้ว',
  ongoing_care: 'ดูแลต่อเนื่อง',
  completed: 'ดูแลครบแล้ว',
};

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
          phoneE164: normalizeThaiPhone(phone),
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

  const [completingId, setCompletingId] = useState<string | null>(null);
  const [outcomeText, setOutcomeText] = useState('');

  async function handleFollowUpStatus(
    followUpId: string,
    status: 'open' | 'in_progress' | 'completed',
    outcomeNote?: string
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
          ...(outcomeNote !== undefined ? { outcomeNote } : {}),
        },
      });
      setCompletingId(null);
      setOutcomeText('');
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
        <section className="fm-panel flex items-start gap-3.5 bg-[#DBEAFE] p-5 text-[#141413]">
          <Lock className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
          <div>
            <h1 className="font-display text-xl font-extrabold text-[#141413]">
              ซ่อนเบอร์โทรส่วนตัวอัตโนมัติ
            </h1>
            <p className="mt-1 text-base font-medium text-[#141413]">
              ในมุมมองภาพรวม (เช่น ศิษยาภิบาล) ระบบจะซ่อนเบอร์โทรและชื่อจริงรายบุคคลเพื่อความเป็นส่วนตัว
            </p>
          </div>
        </section>
      )}

      {msg && (
        <div
          role="alert"
          className={`fm-panel p-4 text-base font-extrabold ${
            msg.type === 'ok'
              ? 'bg-[#C8FF00] text-[#141413]'
              : 'bg-[#FFE4E6] text-[#881337]'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Visitor Registration Bento Form (DEC-10 PDPA) */}
      <form onSubmit={handleRegisterVisitor} className="fm-panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b-2 border-[#141413] bg-[#C8FF00] px-6 py-4">
          <h2 className="font-display text-2xl font-extrabold text-[#141413]">
            บันทึกผู้เยี่ยมใหม่
          </h2>
          <UserPlus className="h-6 w-6 text-[#141413]" aria-hidden="true" />
        </div>

        <div className="space-y-4 p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select
              aria-label="เลือกกลุ่มพันธกิจ"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="fm-input font-bold"
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
              className="fm-input"
            />
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="ชื่อเล่น"
              className="fm-input"
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="เบอร์โทร เช่น 081-234-5678"
              className="fm-input"
            />
          </div>

          <div className="flex flex-col justify-between gap-3 border-t-2 border-dashed border-[#141413]/30 pt-4 sm:flex-row sm:items-center">
            <label className="flex min-h-[48px] cursor-pointer items-center gap-3 text-base font-bold text-[#141413]">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="h-5 w-5 accent-[#1D4ED8]"
              />
              <span>ผู้เยี่ยมยินยอมให้เก็บเบอร์โทรเพื่อติดต่อเยี่ยมเยียน</span>
            </label>
            <button
              type="submit"
              disabled={busy || !groupId}
              className="fm-btn fm-btn-violet text-base"
            >
              <span>บันทึกผู้เยี่ยมใหม่</span>
            </button>
          </div>
        </div>
      </form>

      {/* Follow-Up Queue Ledger */}
      <section className="fm-panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b-2 border-[#141413] bg-[#E2E8F0] px-6 py-4">
          <h2 className="font-display text-2xl font-extrabold text-[#141413]">
            คิวงานเยี่ยมติดตามอภิบาล ({workspace.followUps.length} รายการ)
          </h2>
          <ClipboardList className="h-6 w-6 text-[#1D4ED8]" aria-hidden="true" />
        </div>

        <div className="divide-y-2 divide-[#141413]">
          {workspace.followUps.map((f) => (
            <div
              key={f.id}
              className="flex flex-col justify-between gap-3 bg-white px-6 py-4 sm:flex-row sm:items-center"
            >
              <div>
                <div className="text-base font-extrabold text-[#141413]">{f.title}</div>
                <div className="text-base font-medium text-[#27272A]">
                  {f.groupName} · {SOURCE_TH[f.sourceType] ?? 'ทั่วไป'}
                  {f.priority === 'high' ? ' · ด่วน' : ''} {f.notes ? `· ${f.notes}` : ''}
                </div>
                {f.status === 'completed' && f.outcomeNote && (
                  <div className="text-base font-medium text-[#27272A]">ผลการติดตาม: {f.outcomeNote}</div>
                )}
                {completingId === f.id && (
                  <div className="mt-3 space-y-2">
                    <label className="block text-lg font-bold text-[#141413]" htmlFor={`outcome-${f.id}`}>
                      ผลการติดตาม (จำเป็นต้องกรอก)
                    </label>
                    <textarea
                      id={`outcome-${f.id}`}
                      className="fm-input min-h-[96px] w-full text-lg"
                      maxLength={2000}
                      value={outcomeText}
                      onChange={(e) => setOutcomeText(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={busy || outcomeText.trim().length === 0}
                      onClick={() => handleFollowUpStatus(f.id, 'completed', outcomeText.trim())}
                      className="fm-btn fm-btn-lime min-h-[48px] px-4 text-lg"
                    >
                      บันทึกผลและปิดรายการ
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {f.status !== 'completed' ? (
                  <>
                    {f.status === 'open' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleFollowUpStatus(f.id, 'in_progress')}
                        className="fm-btn bg-[#DBEAFE] px-3.5 py-1.5 text-base text-[#141413]"
                      >
                        <span>กำลังติดตาม</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setCompletingId(f.id);
                        setOutcomeText('');
                      }}
                      className="fm-btn fm-btn-lime px-4 py-1.5 text-base"
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      <span>เยี่ยมสำเร็จ</span>
                    </button>
                  </>
                ) : (
                  <span className="fm-sticker bg-[#C8FF00] text-[#141413]">
                    ดำเนินการเสร็จสิ้น
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Visitors & Members Split Ledgers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="fm-panel overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b-2 border-[#141413] bg-[#DBEAFE] px-6 py-4">
            <h2 className="font-display text-2xl font-extrabold text-[#141413]">
              ทำเนียบผู้เยี่ยม ({workspace.visitors.length})
            </h2>
            <UserCheck className="h-6 w-6 text-[#141413]" aria-hidden="true" />
          </div>

          <div className="divide-y-2 divide-[#141413]">
            {workspace.visitors.map((v) => (
              <div
                key={v.id}
                className="flex flex-col justify-between gap-3 bg-white px-6 py-4 sm:flex-row sm:items-center"
              >
                <div>
                  <div className="text-base font-extrabold text-[#141413]">{v.fullName}</div>
                  <div className="text-base font-medium text-[#27272A]">
                    {v.originGroupName} · โทร: {v.phone ?? 'ไม่ระบุ'} · PDPA:{' '}
                    {v.consentForContact ? 'ยินยอมแล้ว' : 'ยังไม่ให้เบอร์'} · มา {v.visitCount} ครั้ง ·{' '}
                    {VISITOR_STATUS_TH[v.followupStatus] ?? v.followupStatus}
                  </div>
                </div>
                {v.convertedMemberId ? (
                  <span className="fm-sticker bg-[#C8FF00] text-[#141413]">
                    โอนเป็นสมาชิกแล้ว
                  </span>
                ) : (
                  !isPastor && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleConvertVisitor(v.id, v.firstOriginGroupId)}
                      className="fm-btn fm-btn-paper px-3.5 py-1.5 text-base"
                    >
                      <span>รับเป็นสมาชิกกลุ่ม</span>
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="fm-panel overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b-2 border-[#141413] bg-[#FEF3C7] px-6 py-4">
            <h2 className="font-display text-2xl font-extrabold text-[#141413]">
              สมาชิกกลุ่มพันธกิจบ้าน ({workspace.members.length})
            </h2>
            <Users className="h-6 w-6 text-[#141413]" aria-hidden="true" />
          </div>

          <div className="max-h-[460px] divide-y-2 divide-[#141413] overflow-y-auto">
            {workspace.members.map((m) => (
              <div
                key={m.membershipId}
                className="flex items-center justify-between gap-3 bg-white px-6 py-3.5"
              >
                <div>
                  <div className="text-base font-extrabold text-[#141413]">{m.fullName}</div>
                  <div className="text-base font-medium text-[#27272A]">
                    {m.groupName} · โทร: {m.phone ?? '-'}
                  </div>
                </div>
                <span className="fm-sticker bg-[#E2E8F0] text-[#141413]">
                  {m.membershipRole}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
