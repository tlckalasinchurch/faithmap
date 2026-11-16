'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Lock,
  UserCheck,
  UserPlus,
  Users,
  UserX,
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
  const systemRole = workspace.actor.user.systemRole;
  const isPastor = systemRole === 'mission_leader';
  const isAdmin = systemRole === 'admin' || systemRole === 'super_admin';
  const assignedGroupIds = new Set(
    workspace.actor.assignments
      .filter((a) => Boolean(a.groupId))
      .map((a) => a.groupId!)
  );
  const bodyLeaderBodyIds = new Set(workspace.actor.bodyLeaderBodyIds);
  const editableGroups = workspace.groups.filter(
    (g) => isAdmin || (g.bodyId && bodyLeaderBodyIds.has(g.bodyId)) || assignedGroupIds.has(g.id)
  );
  const editableGroupIds = new Set(editableGroups.map((g) => g.id));
  const canWriteAnyGroup = editableGroups.length > 0;

  const [selectedGroupId, setSelectedGroupId] = useState(editableGroups[0]?.id ?? '');
  const groupId = editableGroupIds.has(selectedGroupId)
    ? selectedGroupId
    : editableGroups[0]?.id ?? '';
  const [fullName, setFullName] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [dupWarning, setDupWarning] = useState<string | null>(null);

  // New member creation state
  const [showAddMember, setShowAddMember] = useState(false);
  const [memFullName, setMemFullName] = useState('');
  const [memDisplayName, setMemDisplayName] = useState('');
  const [memPhone, setMemPhone] = useState('');
  const [memRole, setMemRole] = useState('member');

  // Add existing member state (Admin / Body Leader)
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [existingMemberId, setExistingMemberId] = useState('');
  const [existingRole, setExistingRole] = useState('member');

  const isAdminOrBodyLeader =
    (isAdmin || workspace.actor.bodyLeaderBodyIds.length > 0) &&
    editableGroups.some((g) => isAdmin || (g.bodyId && bodyLeaderBodyIds.has(g.bodyId)));

  const isPiiMaskedView =
    workspace.members.some((m) => m.piiMasked) ||
    workspace.visitors.some((v) => v.piiMasked) ||
    isPastor;

  async function handleRegisterVisitor(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setDupWarning(null);
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

  async function handleCreateMember(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setDupWarning(null);
    try {
      const res = await apiRequest<{
        ok: boolean;
        member: { id: string; fullName: string };
        duplicateWarnings?: { samePhone: number; sameName: number };
      }>('/api/v1/pastoral', {
        method: 'POST',
        body: {
          action: 'create_member',
          groupId,
          fullName: memFullName,
          displayName: memDisplayName || memFullName,
          phoneE164: normalizeThaiPhone(memPhone),
          membershipRole: memRole,
        },
      });

      if (
        res.duplicateWarnings &&
        (res.duplicateWarnings.sameName > 0 || res.duplicateWarnings.samePhone > 0)
      ) {
        setDupWarning(
          `คำเตือนความซ้ำซ้อน (FR-04.3): พบสมาชิกในระบบที่มีชื่อตรงกัน ${res.duplicateWarnings.sameName} คน หรือเบอร์โทรตรงกัน ${res.duplicateWarnings.samePhone} คน (บันทึกสมาชิกใหม่เรียบร้อยแล้ว)`
        );
      } else {
        setMsg({ type: 'ok', text: `บันทึกสมาชิก ${memFullName} เข้ากลุ่มเรียบร้อยแล้ว` });
      }

      setMemFullName('');
      setMemDisplayName('');
      setMemPhone('');
      setShowAddMember(false);
      await onRefresh();
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถเพิ่มสมาชิกได้',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleAddExistingMember(e: React.FormEvent) {
    e.preventDefault();
    if (!existingMemberId) return;
    setBusy(true);
    setMsg(null);
    setDupWarning(null);
    try {
      await apiRequest('/api/v1/pastoral', {
        method: 'POST',
        body: {
          action: 'add_member_to_group',
          groupId,
          memberId: existingMemberId,
          membershipRole: existingRole,
        },
      });
      setMsg({ type: 'ok', text: 'เพิ่มสมาชิกเดิมเข้ากลุ่มเรียบร้อยแล้ว' });
      setExistingMemberId('');
      setShowAddExisting(false);
      await onRefresh();
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถเพิ่มสมาชิกเข้ากลุ่มได้',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleEndMembership(targetGroupId: string, targetMemberId: string) {
    if (!confirm('ต้องการสิ้นสุดสมาชิกภาพของสมาชิกคนนี้ในกลุ่มนี้ใช่หรือไม่? ประวัติการเข้าร่วมเดิมจะยังคงอยู่')) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await apiRequest('/api/v1/pastoral', {
        method: 'POST',
        body: {
          action: 'end_membership',
          groupId: targetGroupId,
          memberId: targetMemberId,
        },
      });
      setMsg({ type: 'ok', text: 'สิ้นสุดการเป็นสมาชิกกลุ่มเรียบร้อยแล้ว' });
      await onRefresh();
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถสิ้นสุดสมาชิกภาพได้',
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

  async function handleRecordVisitorReturn(visitorId: string, originGroupId: string | null) {
    setBusy(true);
    setMsg(null);
    try {
      await apiRequest('/api/v1/pastoral', {
        method: 'POST',
        body: {
          action: 'record_visitor_return',
          visitorId,
          groupId: originGroupId || groupId,
        },
      });
      setMsg({ type: 'ok', text: 'บันทึกการกลับมาของผู้เยี่ยมเรียบร้อยแล้ว' });
      await onRefresh();
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถบันทึกการกลับมาได้',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateVisitorStatus(visitorId: string, status: string) {
    setBusy(true);
    setMsg(null);
    try {
      await apiRequest('/api/v1/pastoral', {
        method: 'POST',
        body: {
          action: 'update_visitor_status',
          visitorId,
          status,
        },
      });
      setMsg({ type: 'ok', text: 'อัปเดตสถานะผู้เยี่ยมเรียบร้อยแล้ว' });
      await onRefresh();
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถอัปเดตสถานะผู้เยี่ยมได้',
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
              {canWriteAnyGroup
                ? 'ในมุมมองภาพรวม (เช่น ศิษยาภิบาล) ระบบจะซ่อนเบอร์โทรและชื่อจริงรายบุคคลเพื่อความเป็นส่วนตัว'
                : 'ในมุมมองภาพรวม (เช่น ศิษยาภิบาล) ระบบจะซ่อนเบอร์โทรและชื่อจริงรายบุคคลเพื่อความเป็นส่วนตัว และสิทธิ์นี้สำหรับดูข้อมูลภาพรวมเท่านั้น'}
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

      {dupWarning && (
        <div
          role="alert"
          className="fm-panel flex items-center gap-3 bg-[#FEF3C7] p-4 text-base font-extrabold text-[#92400E]"
        >
          <AlertTriangle className="h-6 w-6 shrink-0 text-[#D97706]" aria-hidden="true" />
          <span>{dupWarning}</span>
        </div>
      )}

      {/* Visitor Registration Bento Form (DEC-10 PDPA) */}
      {canWriteAnyGroup && (
        <form onSubmit={handleRegisterVisitor} className="fm-panel min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b-2 border-[#141413] bg-[#C8FF00] px-6 py-4">
            <h2 className="font-display text-2xl font-extrabold text-[#141413]">
              บันทึกผู้เยี่ยมใหม่
            </h2>
            <UserPlus className="h-6 w-6 shrink-0 text-[#141413]" aria-hidden="true" />
          </div>

          <div className="space-y-4 p-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <select
                aria-label="เลือกกลุ่มพันธกิจ"
                value={groupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="fm-input min-h-[48px] w-full min-w-0 text-base font-bold"
              >
                {editableGroups.map((g) => (
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
                className="fm-input min-h-[48px] w-full min-w-0 text-base"
              />
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="ชื่อเล่น"
                className="fm-input min-h-[48px] w-full min-w-0 text-base"
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="เบอร์โทร เช่น 081-234-5678"
                className="fm-input min-h-[48px] w-full min-w-0 text-base"
              />
            </div>

            <div className="flex flex-col justify-between gap-3 border-t-2 border-dashed border-[#141413]/30 pt-4 sm:flex-row sm:items-center">
              <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border-2 border-[#141413] bg-[#F8FAFC] px-4 py-2.5 text-base font-bold text-[#141413] transition hover:bg-[#DBEAFE]">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="h-6 w-6 shrink-0 accent-[#1D4ED8]"
                />
                <span>ผู้เยี่ยมยินยอมให้เก็บเบอร์โทรเพื่อติดต่อเยี่ยมเยียน</span>
              </label>
              <button
                type="submit"
                disabled={busy || !groupId}
                className="fm-btn fm-btn-violet min-h-[48px] shrink-0 text-base font-bold"
              >
                <span>บันทึกผู้เยี่ยมใหม่</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Follow-Up Queue Ledger */}
      <section className="fm-panel min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b-2 border-[#141413] bg-[#E2E8F0] px-6 py-4">
          <h2 className="font-display text-2xl font-extrabold text-[#141413]">
            คิวงานเยี่ยมติดตามอภิบาล ({workspace.followUps.length} รายการ)
          </h2>
          <ClipboardList className="h-6 w-6 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
        </div>

        <div className="divide-y-2 divide-[#141413]">
          {workspace.followUps.length === 0 ? (
            <div className="bg-white p-8 text-center">
              <p className="text-lg font-extrabold text-[#141413]">
                ยังไม่มีคิวงานเยี่ยมติดตามในขอบเขตของคุณ
              </p>
              <p className="mt-1.5 text-base font-medium text-[#27272A]">
                {canWriteAnyGroup
                  ? 'รายการติดตามจะถูกสร้างอัตโนมัติเมื่อคุณบันทึกผู้เยี่ยมใหม่ด้านบน หรือระบุความต้องการดูแลในรายงานประจำสัปดาห์'
                  : 'รายการติดตามจะแสดงเมื่อผู้นำกลุ่มหรือหัวหน้าแคร์บันทึกผู้เยี่ยมใหม่ หรือระบุความต้องการดูแลในรายงานประจำสัปดาห์'}
              </p>
            </div>
          ) : (
            workspace.followUps.map((f) => {
              const canEditFollowUp = editableGroupIds.has(f.groupId);
              return (
                <div
                  key={f.id}
                  className="flex flex-col justify-between gap-3 bg-white px-6 py-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="text-base font-extrabold text-[#141413]">{f.title}</div>
                    <div className="text-base font-medium text-[#27272A]">
                      {f.groupName} · {SOURCE_TH[f.sourceType] ?? 'ทั่วไป'}
                      {f.priority === 'high' ? ' · ด่วน' : ''} {f.notes ? `· ${f.notes}` : ''}
                    </div>
                    {f.status === 'completed' && f.outcomeNote && (
                      <div className="text-base font-medium text-[#27272A]">ผลการติดตาม: {f.outcomeNote}</div>
                    )}
                    {canEditFollowUp && completingId === f.id && (
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
                          className="fm-btn fm-btn-lime min-h-[48px] px-4 text-lg font-bold"
                        >
                          บันทึกผลและปิดรายการ
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {f.status === 'completed' ? (
                      <span className="fm-sticker bg-[#C8FF00] text-base text-[#141413]">
                        ดำเนินการเสร็จสิ้น
                      </span>
                    ) : canEditFollowUp ? (
                      <>
                        {f.status === 'open' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleFollowUpStatus(f.id, 'in_progress')}
                            className="fm-btn min-h-[48px] bg-[#DBEAFE] px-4 py-2 text-base font-bold text-[#141413]"
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
                          className="fm-btn fm-btn-lime min-h-[48px] px-4 py-2 text-base font-bold"
                        >
                          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>เยี่ยมสำเร็จ</span>
                        </button>
                      </>
                    ) : (
                      <span className="fm-sticker bg-[#E2E8F0] text-base text-[#141413]">
                        {f.status === 'open'
                          ? 'รอติดตาม'
                          : f.status === 'in_progress'
                            ? 'กำลังดำเนินการ'
                            : f.status}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Visitors & Members Split Ledgers */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Visitors Section */}
        <section className="fm-panel min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b-2 border-[#141413] bg-[#DBEAFE] px-6 py-4">
            <h2 className="font-display text-2xl font-extrabold text-[#141413]">
              ทำเนียบผู้เยี่ยม ({workspace.visitors.length})
            </h2>
            <UserCheck className="h-6 w-6 shrink-0 text-[#141413]" aria-hidden="true" />
          </div>

          <div className="divide-y-2 divide-[#141413]">
            {workspace.visitors.length === 0 ? (
              <div className="bg-white p-8 text-center">
                <p className="text-lg font-extrabold text-[#141413]">
                  ยังไม่มีข้อมูลผู้เยี่ยมใหม่ในขอบเขตของคุณ
                </p>
                <p className="mt-1.5 text-base font-medium text-[#27272A]">
                  {canWriteAnyGroup
                    ? 'ใช้แบบฟอร์ม “บันทึกผู้เยี่ยมใหม่” ด้านบน หรือเพิ่มผู้เยี่ยมขณะส่งรายงานประจำสัปดาห์'
                    : 'ข้อมูลผู้เยี่ยมจะแสดงเมื่อผู้นำกลุ่มบันทึกผู้เยี่ยมใหม่ในกลุ่มหรือในรายงานประจำสัปดาห์'}
                </p>
              </div>
            ) : (
              workspace.visitors.map((v) => {
                const canManageVisitor = v.firstOriginGroupId
                  ? editableGroupIds.has(v.firstOriginGroupId)
                  : isAdmin;

                return (
                  <div
                    key={v.id}
                    className="flex flex-col justify-between gap-3 bg-white px-6 py-4"
                  >
                    <div className="min-w-0">
                      <div className="text-base font-extrabold text-[#141413]">{v.fullName}</div>
                      <div className="text-base font-medium text-[#27272A]">
                        {v.originGroupName} · โทร: {v.phone ?? 'ไม่ระบุ'} · PDPA:{' '}
                        {v.consentForContact ? 'ยินยอมแล้ว' : 'ยังไม่ให้เบอร์'} · มา {v.visitCount} ครั้ง ·{' '}
                        {VISITOR_STATUS_TH[v.followupStatus] ?? v.followupStatus}
                      </div>
                    </div>

                    {(v.convertedMemberId || canManageVisitor) && (
                      <div className="flex flex-wrap items-center gap-2">
                        {canManageVisitor && !v.convertedMemberId && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRecordVisitorReturn(v.id, v.firstOriginGroupId)}
                              className="fm-btn fm-btn-paper min-h-[48px] px-3.5 py-2 text-base font-bold"
                              title="บันทึกว่าผู้เยี่ยมกลับมาอีกครั้ง"
                            >
                              <span>กลับมาอีกครั้ง</span>
                            </button>
                            <select
                              aria-label="เปลี่ยนสถานะผู้เยี่ยม"
                              disabled={busy}
                              value={v.followupStatus}
                              onChange={(e) => handleUpdateVisitorStatus(v.id, e.target.value)}
                              className="fm-input min-h-[48px] w-full min-w-0 text-base font-medium sm:w-auto"
                            >
                              <option value="first_visit">มาครั้งแรก</option>
                              <option value="awaiting_followup">รอติดตาม</option>
                              <option value="contacted">ติดต่อแล้ว</option>
                              <option value="returned">กลับมาแล้ว</option>
                              <option value="ongoing_care">ดูแลต่อเนื่อง</option>
                              <option value="completed">ดูแลครบแล้ว</option>
                            </select>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleConvertVisitor(v.id, v.firstOriginGroupId)}
                              className="fm-btn fm-btn-violet min-h-[48px] px-3.5 py-2 text-base font-bold"
                            >
                              <span>รับเป็นสมาชิกกลุ่ม</span>
                            </button>
                          </>
                        )}
                        {v.convertedMemberId && (
                          <span className="fm-sticker bg-[#C8FF00] text-base text-[#141413]">
                            โอนเป็นสมาชิกแล้ว
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Members Section */}
        <section className="fm-panel min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#141413] bg-[#FEF3C7] px-6 py-4">
            <h2 className="font-display text-2xl font-extrabold text-[#141413]">
              สมาชิกกลุ่มพันธกิจบ้าน ({workspace.members.length})
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {canWriteAnyGroup && (
                <button
                  type="button"
                  onClick={() => setShowAddMember(!showAddMember)}
                  className="fm-btn fm-btn-paper min-h-[48px] px-3 text-base font-bold"
                >
                  {showAddMember ? 'ปิดฟอร์ม' : '+ เพิ่มสมาชิกใหม่'}
                </button>
              )}
              {isAdminOrBodyLeader && (
                <button
                  type="button"
                  onClick={() => setShowAddExisting(!showAddExisting)}
                  className="fm-btn min-h-[48px] bg-[#DBEAFE] px-3 text-base font-bold text-[#141413]"
                >
                  {showAddExisting ? 'ปิด' : 'เพิ่มสมาชิกเดิม'}
                </button>
              )}
              <Users className="h-6 w-6 shrink-0 text-[#141413]" aria-hidden="true" />
            </div>
          </div>

          {/* Form to Add New Member */}
          {canWriteAnyGroup && showAddMember && (
            <form onSubmit={handleCreateMember} className="space-y-3 border-b-2 border-[#141413] bg-[#FEF9C3] p-4">
              <h3 className="text-lg font-bold text-[#141413]">เพิ่มสมาชิกใหม่ในกลุ่ม</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  required
                  value={memFullName}
                  onChange={(e) => setMemFullName(e.target.value)}
                  placeholder="ชื่อ-นามสกุล *"
                  className="fm-input min-h-[48px] w-full min-w-0 text-base"
                />
                <input
                  type="text"
                  value={memDisplayName}
                  onChange={(e) => setMemDisplayName(e.target.value)}
                  placeholder="ชื่อเรียก/ชื่อเล่น"
                  className="fm-input min-h-[48px] w-full min-w-0 text-base"
                />
                <input
                  type="tel"
                  value={memPhone}
                  onChange={(e) => setMemPhone(e.target.value)}
                  placeholder="เบอร์โทรศัพท์"
                  className="fm-input min-h-[48px] w-full min-w-0 text-base"
                />
                <select
                  aria-label="บทบาทในกลุ่ม"
                  value={memRole}
                  onChange={(e) => setMemRole(e.target.value)}
                  className="fm-input min-h-[48px] w-full min-w-0 text-base font-medium"
                >
                  <option value="member">สมาชิกทั่วไป</option>
                  <option value="core_leader">แกนนำ</option>
                  <option value="host">เจ้าของบ้าน</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={busy || !memFullName.trim()}
                className="fm-btn fm-btn-lime min-h-[48px] px-4 text-base font-bold"
              >
                บันทึกสมาชิกใหม่
              </button>
            </form>
          )}

          {/* Form to Add Existing Member to Group */}
          {isAdminOrBodyLeader && showAddExisting && (
            <form onSubmit={handleAddExistingMember} className="space-y-3 border-b-2 border-[#141413] bg-[#EFF6FF] p-4">
              <h3 className="text-lg font-bold text-[#141413]">เพิ่มสมาชิกเดิมเข้ากลุ่ม (สิทธิ์ผู้ดูแล/หัวหน้าบอดี้)</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  aria-label="เลือกสมาชิกเดิม"
                  required
                  value={existingMemberId}
                  onChange={(e) => setExistingMemberId(e.target.value)}
                  className="fm-input min-h-[48px] w-full min-w-0 text-base font-medium"
                >
                  <option value="">-- เลือกสมาชิกเดิมในทำเนียบ --</option>
                  {workspace.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName} ({m.groupName})
                    </option>
                  ))}
                </select>
                <select
                  aria-label="บทบาทสมาชิก"
                  value={existingRole}
                  onChange={(e) => setExistingRole(e.target.value)}
                  className="fm-input min-h-[48px] w-full min-w-0 text-base font-medium"
                >
                  <option value="member">สมาชิกทั่วไป</option>
                  <option value="core_leader">แกนนำ</option>
                  <option value="host">เจ้าของบ้าน</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={busy || !existingMemberId}
                className="fm-btn fm-btn-violet min-h-[48px] px-4 text-base font-bold"
              >
                เพิ่มเข้ากลุ่มนี้
              </button>
            </form>
          )}

          <div className="max-h-[460px] divide-y-2 divide-[#141413] overflow-y-auto">
            {workspace.members.length === 0 ? (
              <div className="bg-white p-8 text-center">
                <p className="text-lg font-extrabold text-[#141413]">
                  ยังไม่มีรายชื่อสมาชิกในกลุ่มที่คุณดูแล
                </p>
                <p className="mt-1.5 text-base font-medium text-[#27272A]">
                  {!canWriteAnyGroup
                    ? 'รายชื่อสมาชิกจะแสดงเมื่อผู้นำกลุ่มหรือผู้ดูแลเพิ่มสมาชิกเข้ากลุ่มแล้ว'
                    : 'กดปุ่ม “เพิ่มสมาชิกใหม่” ที่มุมขวาบนของการ์ดนี้ เพื่อเพิ่มรายชื่อสมาชิกเข้ากลุ่ม'}
                </p>
              </div>
            ) : (
              workspace.members.map((m) => (
                <div
                  key={m.membershipId}
                  className="flex flex-col justify-between gap-3 bg-white px-6 py-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="text-base font-extrabold text-[#141413]">{m.fullName}</div>
                    <div className="text-base font-medium text-[#27272A]">
                      {m.groupName} · โทร: {m.phone ?? '-'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="fm-sticker bg-[#E2E8F0] text-base text-[#141413]">
                      {m.membershipRole}
                    </span>
                    {editableGroupIds.has(m.groupId) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleEndMembership(m.groupId, m.id)}
                        className="fm-btn fm-btn-paper min-h-[48px] px-3.5 py-2 text-base font-bold text-[#881337] hover:bg-[#FFE4E6]"
                        title="สิ้นสุดการเป็นสมาชิกกลุ่มนี้"
                      >
                        <UserX className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>สิ้นสุดสมาชิกภาพ</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
