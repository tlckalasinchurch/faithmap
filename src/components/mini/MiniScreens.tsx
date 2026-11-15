'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import type { WorkspacePayload } from '@/lib/types';
import { getMiniNav, miniRoleLabel, type MiniNavKey } from '@/lib/mini-nav';
import type { LiffAdapter } from '@/lib/liff/adapter';
import { LineRedirecting, lineLink } from '@/lib/liff/line-auth-client';
import { StatusBadge } from '@/components/StatusBadge';
import { BigButton, Loading, Notice, ScreenTitle } from './ui';

const DAYS = ['', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const ROLE_TH: Record<string, string> = {
  body_leader: 'หัวหน้าบอดี้',
  care_leader: 'ผู้ดูแลแคร์',
  coordinator: 'ผู้ประสานงาน',
  group_leader: 'ผู้รับผิดชอบกลุ่ม',
  other_authorized: 'ผู้ได้รับมอบหมาย',
};
const GROWTH_STATUS_TH: Record<string, string> = {
  RAW: 'ยังไม่ตรวจสอบ',
  NORMALIZED: 'จัดรูปแบบแล้ว',
  VERIFIED: 'ตรวจสอบแล้ว',
  PENDING_REVIEW: 'รอตรวจสอบ',
  CONFLICT: 'ข้อมูลขัดแย้ง',
  INCOMPLETE: 'ข้อมูลไม่ครบ',
};

export function Home({
  data,
  adapter,
  go,
}: {
  data: WorkspacePayload;
  adapter: LiffAdapter | null;
  go: (k: MiniNavKey | 'link') => void;
}) {
  const nav = getMiniNav(data.actor);
  const unread = data.notifications.filter((n) => !n.readAt).length;
  const noRole = nav.length <= 2;
  return (
    <section className="space-y-5">
      <div>
        <p className="text-lg text-[#27272A]">สวัสดี</p>
        <h2 className="text-3xl font-extrabold leading-tight text-[#141413]">{data.actor.user.displayName}</h2>
        <p className="mt-1 text-xl font-semibold text-[#1D4ED8]">{miniRoleLabel(data.actor)}</p>
      </div>
      {noRole && (
        <Notice tone="info">บัญชีของคุณกำลังรอรับหน้าที่ เมื่อผู้ดูแลระบบมอบหมายแล้ว เมนูอื่นจะแสดงที่นี่</Notice>
      )}
      <nav aria-label="เมนูหลัก" className="grid grid-cols-2 gap-3">
        {nav
          .filter((i) => i.key !== 'home')
          .map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => go(item.key)}
              className="fm-btn fm-btn-paper min-h-[96px] text-xl font-bold"
            >
              {item.label}
              {item.key === 'notifications' && unread > 0 ? ` (${unread})` : ''}
            </button>
          ))}
      </nav>
      {adapter && (
        <BigButton tone="paper" onClick={() => go('link')}>
          เชื่อมบัญชีกับ LINE
        </BigButton>
      )}
    </section>
  );
}

export function Reports({ data }: { data: WorkspacePayload }) {
  const period = data.overview.selectedPeriod;
  return (
    <section className="space-y-4">
      <ScreenTitle>รายงานประจำสัปดาห์</ScreenTitle>
      <p className="text-lg text-[#27272A]">สัปดาห์: {period.periodKey}</p>
      {data.reports.length === 0 && <Notice tone="info">ยังไม่มีรายงานในสัปดาห์นี้</Notice>}
      <ul className="space-y-3">
        {data.reports.map((r) => (
          <li key={r.id} className="space-y-2 border-2 border-[#141413] bg-white p-4">
            <p className="text-xl font-bold">{r.groupName}</p>
            <p className="text-lg text-[#27272A]">{r.district}</p>
            <StatusBadge status={r.status} isBlocked={r.isBlocked} isLate={r.isLate} />
            {r.status === 'needs_revision' && r.revisionReason && (
              <p className="text-lg">เหตุผลที่ส่งกลับ: {r.revisionReason}</p>
            )}
          </li>
        ))}
      </ul>
      <Notice tone="info">แบบฟอร์มส่งรายงานในแอปนี้ยังไม่เปิดใช้งาน กรุณาส่งรายงานผ่านเว็บ FaithMap ก่อน</Notice>
    </section>
  );
}

export function Groups({ data }: { data: WorkspacePayload }) {
  return (
    <section className="space-y-4">
      <ScreenTitle>กลุ่มของฉัน</ScreenTitle>
      {data.groups.length === 0 && <Notice tone="info">ยังไม่มีกลุ่มที่คุณดูแล</Notice>}
      <ul className="space-y-3">
        {data.groups.map((g) => (
          <li key={g.id} className="space-y-1 border-2 border-[#141413] bg-white p-4">
            <p className="text-xl font-bold">{g.nameTh}</p>
            <p className="text-lg text-[#27272A]">
              อำเภอ{g.district}
              {g.meetingDayOfWeek ? ` · วัน${DAYS[g.meetingDayOfWeek] ?? ''}` : ''}
              {g.meetingTimeLocal ? ` · ${g.meetingTimeLocal} น.` : ''}
            </p>
            {g.assignments.length > 0 && (
              <ul className="pt-1 text-lg">
                {g.assignments.map((a) => (
                  <li key={a.id}>
                    {ROLE_TH[a.roleType] ?? a.roleType}: {a.displayName}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface GrowthRow {
  id: string;
  memberName: string;
  groupName: string | null;
  conversionDateRaw: string | null;
  discipleshipGoalRaw: string | null;
  targetTimeframeRaw: string | null;
  disciplerNameRaw: string | null;
  verificationStatus: string;
}

export function Growth() {
  const [rows, setRows] = useState<GrowthRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiRequest<{ records: GrowthRow[] }>('/api/v1/growth')
      .then((r) => setRows(r.records))
      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ'));
  }, []);
  return (
    <section className="space-y-4">
      <ScreenTitle>การเติบโตของสมาชิก</ScreenTitle>
      {error && <Notice tone="error">{error}</Notice>}
      {!rows && !error && <Loading />}
      {rows?.length === 0 && <Notice tone="info">ยังไม่มีข้อมูลการเติบโต</Notice>}
      <ul className="space-y-3">
        {rows?.map((r) => (
          <li key={r.id} className="space-y-1 border-2 border-[#141413] bg-white p-4 text-lg">
            <p className="text-xl font-bold">{r.memberName}</p>
            {r.groupName && <p className="text-[#27272A]">{r.groupName}</p>}
            {r.conversionDateRaw && <p>วันรับเชื่อ: {r.conversionDateRaw}</p>}
            {r.discipleshipGoalRaw && <p>เป้าหมาย: {r.discipleshipGoalRaw}</p>}
            {r.targetTimeframeRaw && <p>ภายใน: {r.targetTimeframeRaw}</p>}
            {r.disciplerNameRaw && <p>ผู้ดูแลการเติบโต: {r.disciplerNameRaw}</p>}
            <p className="font-semibold text-[#1D4ED8]">สถานะข้อมูล: {GROWTH_STATUS_TH[r.verificationStatus] ?? r.verificationStatus}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Notifications({ data, reload }: { data: WorkspacePayload; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const unread = data.notifications.filter((n) => !n.readAt).length;
  async function markAll() {
    setBusy(true);
    try {
      await apiRequest('/api/v1/insights', { method: 'POST', body: { action: 'mark_all_notifications_read' } });
      await reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <ScreenTitle>แจ้งเตือน</ScreenTitle>
      {data.notifications.length === 0 && <Notice tone="info">ยังไม่มีการแจ้งเตือน</Notice>}
      <ul className="space-y-3">
        {data.notifications.map((n) => (
          <li key={n.id} className={`space-y-1 border-2 border-[#141413] p-4 ${n.readAt ? 'bg-white' : 'bg-[#DBEAFE]'}`}>
            <p className="text-xl font-bold">{n.title}</p>
            <p className="text-lg leading-relaxed">{n.body}</p>
          </li>
        ))}
      </ul>
      {unread > 0 && (
        <BigButton tone="paper" onClick={() => void markAll()} disabled={busy}>
          ทำเครื่องหมายว่าอ่านแล้วทั้งหมด
        </BigButton>
      )}
    </section>
  );
}

interface RegistrationRow {
  id: string;
  requestedName: string;
  lineDisplayName: string | null;
  note: string | null;
  createdAt: string;
}

export function Approvals() {
  const [rows, setRows] = useState<RegistrationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await apiRequest<{ requests: RegistrationRow[] }>('/api/v1/line?status=pending');
      setRows(r.requests);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: 'approve' | 'reject') {
    const label = decision === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ';
    if (!window.confirm(`ยืนยัน${label}คำขอนี้ใช่หรือไม่?`)) return;
    setBusyId(id);
    setError(null);
    try {
      await apiRequest('/api/v1/line', { method: 'POST', body: { action: 'review', requestId: id, decision } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-4">
      <ScreenTitle>คำขอใช้งานที่รออนุมัติ</ScreenTitle>
      <Notice tone="info">เมื่ออนุมัติ ผู้ใช้จะเข้าระบบได้ แต่ยังไม่มีหน้าที่ใดๆ ต้องมอบหน้าที่แยกต่างหาก</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {!rows && !error && <Loading />}
      {rows?.length === 0 && <Notice tone="info">ไม่มีคำขอที่รออนุมัติ</Notice>}
      <ul className="space-y-4">
        {rows?.map((r) => (
          <li key={r.id} className="space-y-3 border-2 border-[#141413] bg-white p-4">
            <p className="text-xl font-bold">{r.requestedName}</p>
            {r.lineDisplayName && <p className="text-lg">ชื่อใน LINE: {r.lineDisplayName}</p>}
            {r.note && <p className="text-lg">ข้อความ: {r.note}</p>}
            <BigButton onClick={() => void decide(r.id, 'approve')} disabled={busyId === r.id}>
              อนุมัติ
            </BigButton>
            <BigButton tone="coral" onClick={() => void decide(r.id, 'reject')} disabled={busyId === r.id}>
              ไม่อนุมัติ
            </BigButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LinkLine({ adapter }: { adapter: LiffAdapter | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  async function link() {
    if (!adapter) return;
    setBusy(true);
    setMsg(null);
    try {
      await lineLink(adapter);
      setMsg({ tone: 'info', text: 'เชื่อมบัญชีกับ LINE เรียบร้อยแล้ว ครั้งต่อไปเข้าสู่ระบบด้วย LINE ได้เลย' });
    } catch (e) {
      if (e instanceof LineRedirecting) return;
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'เชื่อมบัญชีไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <ScreenTitle>เชื่อมบัญชีกับ LINE</ScreenTitle>
      <p className="text-lg leading-relaxed text-[#27272A]">
        เมื่อเชื่อมแล้ว คุณเข้าสู่ระบบด้วย LINE ได้โดยไม่ต้องจำรหัสผ่าน การเชื่อมไม่เปลี่ยนหน้าที่ของคุณ
      </p>
      {adapter?.kind === 'mock' && <Notice tone="warn">โหมดทดสอบ ไม่ใช่ LINE จริง การเชื่อมจะไม่สำเร็จ</Notice>}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <BigButton onClick={() => void link()} disabled={busy || !adapter}>
        {busy ? 'กำลังเชื่อม…' : 'เชื่อมบัญชีกับ LINE'}
      </BigButton>
    </section>
  );
}
