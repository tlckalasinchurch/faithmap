'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import type { WorkspacePayload } from '@/lib/types';
import {
  buildReportPayload,
  getReportCapabilities,
  MINI_STATUS_TH,
  validateReportForm,
  type ReportForm,
} from '@/lib/mini-report';
import { StatusBadge } from '@/components/StatusBadge';
import { BigButton, Field, Loading, Notice, ScreenTitle } from './ui';

type Mark = 'present' | 'absent' | 'excused';
const MARK_TH: Record<Mark, string> = { present: 'มา', absent: 'ไม่มา', excused: 'ลา' };

interface Detail {
  report: {
    id: string;
    status: string;
    isDraftHidden: boolean;
    meetingHeld: boolean | null;
    notHeldReason: string | null;
    meetingDate: string | null;
    newVisitorsCount: number;
    returningVisitorsCount: number;
    childrenCount: number;
    offeringAmountThb: string;
    summaryNotes: string | null;
    prayerRequests: string | null;
    careNeedsNotes: string | null;
    revisionReason: string | null;
    isBlocked: boolean;
    blockedReason: string | null;
    requiresSupervisorReview: boolean;
    submittedByUserId: string | null;
    bodyId: string | null;
    version: number;
  };
  attendanceRecords: Array<{ memberId: string; attendanceStatus: Mark }>;
}

function emptyForm(weekStart: string): ReportForm {
  return {
    meetingHeld: true,
    notHeldReason: '',
    meetingDate: weekStart,
    newVisitorsCount: '0',
    returningVisitorsCount: '0',
    childrenCount: '0',
    offeringAmountThb: '0',
    summaryNotes: '',
    prayerRequests: '',
    careNeedsNotes: '',
    attendance: {},
  };
}

export function MiniReports({ data, reload }: { data: WorkspacePayload; reload: () => Promise<void> }) {
  const period = data.overview.selectedPeriod;
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const leaderIds = useMemo(() => new Set(data.actor.groupLeaderGroupIds), [data.actor.groupLeaderGroupIds]);

  // Rows: every report in scope, plus the groups this person leads that have no report yet.
  const reportByGroup = useMemo(() => new Map(data.reports.map((r) => [r.groupId, r])), [data.reports]);
  const emptyLeaderGroups = data.groups.filter((g) => leaderIds.has(g.id) && !reportByGroup.has(g.id));

  if (openGroupId) {
    return (
      <ReportEditor
        key={openGroupId}
        data={data}
        groupId={openGroupId}
        onBack={() => {
          setOpenGroupId(null);
          void reload();
        }}
        reload={reload}
      />
    );
  }

  return (
    <section className="space-y-4">
      <ScreenTitle>รายงานประจำสัปดาห์</ScreenTitle>
      <p className="text-lg text-[#27272A]">สัปดาห์: {period.periodKey}</p>
      {data.reports.length === 0 && emptyLeaderGroups.length === 0 && (
        <Notice tone="info">ยังไม่มีรายงานในสัปดาห์นี้</Notice>
      )}
      <ul className="space-y-3">
        {emptyLeaderGroups.map((g) => (
          <li key={g.id} className="space-y-2 border-2 border-[#141413] bg-white p-4">
            <p className="text-xl font-bold">{g.nameTh}</p>
            <p className="text-lg text-[#27272A]">{MINI_STATUS_TH.not_submitted}</p>
            <BigButton onClick={() => setOpenGroupId(g.id)}>เริ่มรายงาน</BigButton>
          </li>
        ))}
        {data.reports.map((r) => (
          <li key={r.id} className="space-y-2 border-2 border-[#141413] bg-white p-4">
            <p className="text-xl font-bold">{r.groupName}</p>
            <p className="text-lg text-[#27272A]">{r.district}</p>
            <StatusBadge status={r.status} isBlocked={r.isBlocked} isLate={r.isLate} />
            {r.status === 'needs_revision' && r.revisionReason && (
              <p className="text-lg">เหตุผลที่ส่งกลับ: {r.revisionReason}</p>
            )}
            <BigButton tone="paper" onClick={() => setOpenGroupId(r.groupId)}>
              {leaderIds.has(r.groupId) && ['draft', 'needs_revision'].includes(r.status) ? 'เปิดและแก้ไข' : 'เปิดดู'}
            </BigButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReportEditor({
  data,
  groupId,
  onBack,
  reload,
}: {
  data: WorkspacePayload;
  groupId: string;
  onBack: () => void;
  reload: () => Promise<void>;
}) {
  const period = data.overview.selectedPeriod;
  const group = data.groups.find((g) => g.id === groupId);
  const groupMembers = useMemo(() => data.members.filter((m) => m.groupId === groupId), [data.members, groupId]);

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<ReportForm>(() => emptyForm(period.startDate));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ detail: Detail | null }>(
        `/api/v1/reports?periodId=${period.id}&groupId=${groupId}`
      );
      setDetail(res.detail);
      const next = emptyForm(period.startDate);
      const att: Record<string, Mark> = {};
      const r = res.detail?.report;
      if (r && !r.isDraftHidden) {
        next.meetingHeld = r.meetingHeld ?? true;
        next.notHeldReason = r.notHeldReason ?? '';
        next.meetingDate = r.meetingDate || period.startDate;
        next.newVisitorsCount = String(r.newVisitorsCount);
        next.returningVisitorsCount = String(r.returningVisitorsCount);
        next.childrenCount = String(r.childrenCount);
        next.offeringAmountThb = String(r.offeringAmountThb ?? '0');
        next.summaryNotes = r.summaryNotes ?? '';
        next.prayerRequests = r.prayerRequests ?? '';
        next.careNeedsNotes = r.careNeedsNotes ?? '';
        for (const rec of res.detail!.attendanceRecords) att[rec.memberId] = rec.attendanceStatus;
      } else {
        // A new report starts with nobody marked. The leader must mark each person on purpose.
      }
      next.attendance = att;
      setForm(next);
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'โหลดรายงานไม่สำเร็จ' });
    } finally {
      setLoading(false);
    }
  }, [period.id, period.startDate, groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const report = detail?.report && !detail.report.isDraftHidden ? detail.report : null;
  const listItem = data.reports.find((r) => r.groupId === groupId);
  const status = report?.status ?? 'not_submitted';
  const caps = getReportCapabilities({
    status,
    isBlocked: report?.isBlocked ?? false,
    requiresSupervisorReview: report?.requiresSupervisorReview ?? listItem?.requiresSupervisorReview ?? false,
    submittedByUserId: report?.submittedByUserId ?? null,
    actorUserId: data.actor.user.id,
    isGroupLeader: data.actor.groupLeaderGroupIds.includes(groupId),
    isSupervisor: data.actor.supervisorGroupIds.includes(groupId),
    isBodyLeader: report?.bodyId ? data.actor.bodyLeaderBodyIds.includes(report.bodyId) : false,
  });

  function set<K extends keyof ReportForm>(key: K, value: ReportForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setConfirmSubmit(false);
  }
  function mark(memberId: string, m: Mark) {
    setForm((f) => ({ ...f, attendance: { ...f.attendance, [memberId]: m } }));
    setConfirmSubmit(false);
  }

  async function send(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest('/api/v1/reports', {
        method: 'POST',
        body,
        idempotencyKey: crypto.randomUUID(),
      });
      setConfirmSubmit(false);
      setReviewNote('');
      setErrors([]);
      await reload();
      await load();
      setMessage({ tone: 'info', text: okText }); // after the screen shows the new status
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  }

  function groupBody(action: 'save_draft' | 'submit') {
    return {
      action,
      periodId: period.id,
      groupId,
      payload: buildReportPayload(form, report?.version),
    };
  }

  async function saveDraft() {
    const errs = validateReportForm(form).filter((e) => !e.includes('เหตุผลที่ไม่ได้จัดการประชุม'));
    setErrors(errs);
    if (errs.length) return;
    await send(groupBody('save_draft'), 'บันทึกฉบับร่างแล้ว (ยังไม่ได้ส่ง)');
  }

  async function submit() {
    const errs = validateReportForm(form);
    const unmarked = form.meetingHeld ? groupMembers.filter((m) => !form.attendance[m.id]).length : 0;
    if (unmarked > 0) errs.push(`ยังไม่ได้เช็คชื่อสมาชิก ${unmarked} คน`);
    setErrors(errs);
    if (errs.length) return;
    if (!confirmSubmit) {
      setConfirmSubmit(true);
      return;
    }
    await send(groupBody('submit'), 'ส่งรายงานแล้ว');
  }

  async function review(decision: 'forward' | 'request_revision') {
    if (!report) return;
    if (decision === 'request_revision' && !reviewNote.trim()) {
      setErrors(['กรุณาเขียนเหตุผลที่ส่งกลับให้แก้ไข']);
      return;
    }
    setErrors([]);
    await send(
      { action: 'review', reportId: report.id, decision, notesOrReason: reviewNote.trim() || null, expectedVersion: report.version },
      decision === 'forward' ? 'ส่งต่อให้หัวหน้าบอดี้แล้ว' : 'ส่งกลับให้แก้ไขแล้ว'
    );
  }

  async function approve(decision: 'approve' | 'request_revision') {
    if (!report) return;
    if (decision === 'request_revision' && !reviewNote.trim()) {
      setErrors(['กรุณาเขียนเหตุผลที่ส่งกลับให้แก้ไข']);
      return;
    }
    setErrors([]);
    await send(
      { action: 'approve', reportId: report.id, decision, notesOrReason: reviewNote.trim() || null, expectedVersion: report.version },
      decision === 'approve' ? 'อนุมัติรายงานแล้ว' : 'ส่งกลับให้แก้ไขแล้ว'
    );
  }

  const disabled = !caps.canEdit || busy;
  const numberInput = (label: string, key: 'newVisitorsCount' | 'returningVisitorsCount' | 'childrenCount') => (
    <Field label={label}>
      <input
        className="fm-input min-h-[56px] w-full text-lg"
        inputMode="numeric"
        value={form[key]}
        disabled={disabled}
        onChange={(e) => set(key, e.target.value)}
      />
    </Field>
  );

  return (
    <section className="space-y-5">
      <BigButton tone="paper" onClick={onBack}>
        ← กลับรายการรายงาน
      </BigButton>
      <ScreenTitle>{group?.nameTh ?? 'รายงานกลุ่ม'}</ScreenTitle>
      <p className="text-lg text-[#27272A]">สัปดาห์: {period.periodKey}</p>
      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="space-y-2">
            <StatusBadge status={status} isBlocked={report?.isBlocked} isLate={listItem?.isLate} />
            <p className="text-lg">{MINI_STATUS_TH[status] ?? status}</p>
          </div>
          {status === 'needs_revision' && report?.revisionReason && (
            <Notice tone="warn">ส่งกลับให้แก้ไข เหตุผล: {report.revisionReason}</Notice>
          )}
          {report?.isBlocked && <Notice tone="warn">รายงานนี้ถูกระงับ: {report.blockedReason ?? 'ติดต่อผู้ดูแลระบบ'}</Notice>}
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
          {errors.length > 0 && (
            <Notice tone="error">
              <ul className="list-disc space-y-1 pl-5">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Notice>
          )}
          {caps.readOnly && status !== 'not_submitted' && (
            <Notice tone="info">รายงานนี้อยู่ในสถานะที่แก้ไขไม่ได้ คุณดูข้อมูลได้อย่างเดียว</Notice>
          )}
          {caps.readOnly && status === 'not_submitted' && (
            <Notice tone="info">กลุ่มนี้ยังไม่ได้ส่งรายงาน และคุณไม่ได้เป็นผู้รับผิดชอบกลุ่มนี้</Notice>
          )}

          {(report || caps.canEdit) && (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <fieldset className="space-y-3" disabled={disabled}>
                <legend className="text-xl font-bold">สัปดาห์นี้มีการประชุมหรือไม่</legend>
                <div className="grid grid-cols-2 gap-3">
                  <BigButton tone={form.meetingHeld ? 'lime' : 'paper'} onClick={() => set('meetingHeld', true)}>
                    มีประชุม
                  </BigButton>
                  <BigButton tone={!form.meetingHeld ? 'lime' : 'paper'} onClick={() => set('meetingHeld', false)}>
                    ไม่มีประชุม
                  </BigButton>
                </div>
              </fieldset>

              {!form.meetingHeld && (
                <Field label="เหตุผลที่ไม่ได้ประชุม">
                  <textarea
                    className="fm-input min-h-[120px] w-full text-lg"
                    maxLength={4000}
                    value={form.notHeldReason}
                    disabled={disabled}
                    onChange={(e) => set('notHeldReason', e.target.value)}
                  />
                </Field>
              )}

              {form.meetingHeld && (
                <>
                  <Field label="วันที่ประชุม">
                    <input
                      className="fm-input min-h-[56px] w-full text-lg"
                      type="date"
                      value={form.meetingDate}
                      disabled={disabled}
                      onChange={(e) => set('meetingDate', e.target.value)}
                    />
                  </Field>

                  <fieldset className="space-y-3" disabled={disabled}>
                    <legend className="text-xl font-bold">เช็คชื่อสมาชิก ({groupMembers.length} คน)</legend>
                    {groupMembers.length === 0 && <Notice tone="info">กลุ่มนี้ยังไม่มีรายชื่อสมาชิก</Notice>}
                    <ul className="space-y-3">
                      {groupMembers.map((m) => (
                        <li key={m.id} className="space-y-2 border-2 border-[#141413] bg-white p-3">
                          <p className="text-xl font-bold">{m.displayName}</p>
                          <div className="grid grid-cols-3 gap-2" role="group" aria-label={`สถานะของ ${m.displayName}`}>
                            {(Object.keys(MARK_TH) as Mark[]).map((k) => (
                              <button
                                key={k}
                                type="button"
                                aria-pressed={form.attendance[m.id] === k}
                                onClick={() => mark(m.id, k)}
                                className={`fm-btn min-h-[56px] text-lg font-bold ${form.attendance[m.id] === k ? 'fm-btn-lime' : 'fm-btn-paper'}`}
                              >
                                {MARK_TH[k]}
                              </button>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </fieldset>

                  {numberInput('ผู้เยี่ยมใหม่ (คน)', 'newVisitorsCount')}
                  {numberInput('ผู้เยี่ยมที่มาซ้ำ (คน)', 'returningVisitorsCount')}
                  {numberInput('เด็ก (คน)', 'childrenCount')}
                  <Field label="ยอดถวาย (บาท)">
                    <input
                      className="fm-input min-h-[56px] w-full text-lg"
                      inputMode="decimal"
                      value={form.offeringAmountThb}
                      disabled={disabled}
                      onChange={(e) => set('offeringAmountThb', e.target.value)}
                    />
                  </Field>
                  <Field label="สรุปการประชุม">
                    <textarea className="fm-input min-h-[120px] w-full text-lg" maxLength={4000} value={form.summaryNotes} disabled={disabled} onChange={(e) => set('summaryNotes', e.target.value)} />
                  </Field>
                  <Field label="เรื่องขอบคุณและอธิษฐาน">
                    <textarea className="fm-input min-h-[120px] w-full text-lg" maxLength={4000} value={form.prayerRequests} disabled={disabled} onChange={(e) => set('prayerRequests', e.target.value)} />
                  </Field>
                  <Field label="เรื่องที่ต้องดูแลสมาชิก">
                    <textarea className="fm-input min-h-[120px] w-full text-lg" maxLength={4000} value={form.careNeedsNotes} disabled={disabled} onChange={(e) => set('careNeedsNotes', e.target.value)} />
                  </Field>
                </>
              )}
            </form>
          )}

          {caps.canEdit && (
            <div className="space-y-3">
              <BigButton tone="paper" onClick={() => void saveDraft()} disabled={busy}>
                บันทึกฉบับร่าง
              </BigButton>
              {confirmSubmit && (
                <Notice tone="warn">กดยืนยันอีกครั้งเพื่อส่งรายงาน หลังส่งแล้วจะแก้ไขไม่ได้จนกว่าจะถูกส่งกลับ</Notice>
              )}
              <BigButton onClick={() => void submit()} disabled={busy}>
                {confirmSubmit ? 'ยืนยันส่งรายงาน' : 'ส่งรายงาน'}
              </BigButton>
            </div>
          )}

          {(caps.canReview || caps.canApprove) && (
            <div className="space-y-3 border-t-2 border-[#141413] pt-4">
              <ScreenTitle>ตรวจรายงาน</ScreenTitle>
              <Field label="หมายเหตุ (จำเป็นเมื่อส่งกลับ)">
                <textarea className="fm-input min-h-[120px] w-full text-lg" maxLength={4000} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
              </Field>
              {caps.canReview && (
                <BigButton onClick={() => void review('forward')} disabled={busy}>
                  ตรวจแล้ว ส่งต่อหัวหน้าบอดี้
                </BigButton>
              )}
              {caps.canApprove && (
                <BigButton onClick={() => void approve('approve')} disabled={busy}>
                  อนุมัติรายงาน
                </BigButton>
              )}
              <BigButton tone="coral" onClick={() => void (caps.canApprove ? approve('request_revision') : review('request_revision'))} disabled={busy}>
                ส่งกลับให้แก้ไข
              </BigButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}
