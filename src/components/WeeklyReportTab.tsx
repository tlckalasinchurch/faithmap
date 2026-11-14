'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CloudOff,
  Save,
  Send,
  UserPlus,
  Wifi,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  clearOfflineDraft,
  loadOfflineDraft,
  saveOfflineDraft,
} from '@/lib/offline-drafts';
import type { WorkspacePayload } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

export function WeeklyReportTab({
  workspace,
  preselectedGroupId,
  onRefresh,
}: {
  workspace: WorkspacePayload;
  preselectedGroupId?: string | null;
  onRefresh: () => Promise<void>;
}) {
  const period = workspace.overview.selectedPeriod;
  const leaderGroupIds = useMemo(
    () => new Set(workspace.actor.groupLeaderGroupIds),
    [workspace.actor.groupLeaderGroupIds]
  );

  const editableGroups = workspace.groups.filter((g) => leaderGroupIds.has(g.id));
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    preselectedGroupId && editableGroups.some((g) => g.id === preselectedGroupId)
      ? preselectedGroupId
      : editableGroups[0]?.id ?? workspace.groups[0]?.id ?? ''
  );

  useEffect(() => {
    if (
      preselectedGroupId &&
      editableGroups.some((g) => g.id === preselectedGroupId)
    ) {
      setSelectedGroupId(preselectedGroupId);
    }
  }, [preselectedGroupId, editableGroups]);

  const canEditSelected = leaderGroupIds.has(selectedGroupId);
  const selectedGroup = workspace.groups.find((g) => g.id === selectedGroupId);
  const groupMembers = useMemo(
    () => workspace.members.filter((m) => m.groupId === selectedGroupId),
    [workspace.members, selectedGroupId]
  );

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [meetingHeld, setMeetingHeld] = useState(true);
  const [notHeldReason, setNotHeldReason] = useState('');
  const [meetingDate, setMeetingDate] = useState(period.startDate);
  const [totalAttendees, setTotalAttendees] = useState(0);
  const [memberAttendees, setMemberAttendees] = useState(0);
  const [newVisitorsCount, setNewVisitorsCount] = useState(0);
  const [returningVisitorsCount, setReturningVisitorsCount] = useState(0);
  const [childrenCount, setChildrenCount] = useState(0);
  const [offeringAmountThb, setOfferingAmountThb] = useState('0');
  const [summaryNotes, setSummaryNotes] = useState('');
  const [prayerRequests, setPrayerRequests] = useState('');
  const [careNeedsNotes, setCareNeedsNotes] = useState('');
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, 'present' | 'absent' | 'excused'>
  >({});

  const [reportStatus, setReportStatus] = useState<string>('not_submitted');
  const [revisionReason, setRevisionReason] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [version, setVersion] = useState<number | undefined>(undefined);

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'offline_queued' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const loadedKeyRef = useRef<string>('');

  // Quick inline visitor state (DEC-10 PDPA)
  const [showVisitorForm, setShowVisitorForm] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [visitorNickname, setVisitorNickname] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitorConsent, setVisitorConsent] = useState(false);
  const [visitorFollowUp, setVisitorFollowUp] = useState(true);
  const [visitorError, setVisitorError] = useState<string | null>(null);
  const [visitorBusy, setVisitorBusy] = useState(false);

  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const loadGroupReport = useCallback(async () => {
    if (!selectedGroupId) return;
    const key = `${period.id}:${selectedGroupId}`;
    loadedKeyRef.current = key;
    setStatusMessage(null);

    try {
      const res = await apiRequest<{
        detail: {
          report: {
            status: string;
            isDraftHidden: boolean;
            meetingHeld: boolean | null;
            notHeldReason: string | null;
            meetingDate: string | null;
            totalAttendees: number;
            memberAttendees: number;
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
            version: number;
          };
          attendanceRecords: Array<{
            memberId: string;
            attendanceStatus: 'present' | 'absent' | 'excused';
          }>;
        } | null;
      }>(`/api/v1/reports?periodId=${period.id}&groupId=${selectedGroupId}`);

      const detail = res.detail;
      const offline = await loadOfflineDraft(period.id, selectedGroupId);

      if (detail?.report && !detail.report.isDraftHidden) {
        const r = detail.report;
        setReportStatus(r.status);
        setRevisionReason(r.revisionReason);
        setIsBlocked(r.isBlocked);
        setBlockedReason(r.blockedReason);
        setVersion(r.version);
        setMeetingHeld(r.meetingHeld ?? true);
        setNotHeldReason(r.notHeldReason ?? '');
        setMeetingDate(r.meetingDate || period.startDate);
        setTotalAttendees(r.totalAttendees);
        setMemberAttendees(r.memberAttendees);
        setNewVisitorsCount(r.newVisitorsCount);
        setReturningVisitorsCount(r.returningVisitorsCount);
        setChildrenCount(r.childrenCount);
        setOfferingAmountThb(String(r.offeringAmountThb ?? '0'));
        setSummaryNotes(r.summaryNotes ?? '');
        setPrayerRequests(r.prayerRequests ?? '');
        setCareNeedsNotes(r.careNeedsNotes ?? '');

        const map: Record<string, 'present' | 'absent' | 'excused'> = {};
        for (const m of groupMembers) map[m.id] = 'present';
        for (const rec of detail.attendanceRecords) map[rec.memberId] = rec.attendanceStatus;
        setAttendanceMap(map);
      } else {
        setReportStatus(detail?.report?.status ?? 'not_submitted');
        setRevisionReason(null);
        setIsBlocked(false);
        setBlockedReason(null);
        setVersion(undefined);
        setMeetingHeld(true);
        setNotHeldReason('');
        setMeetingDate(period.startDate);
        setMemberAttendees(groupMembers.length);
        setTotalAttendees(groupMembers.length);
        setNewVisitorsCount(0);
        setReturningVisitorsCount(0);
        setChildrenCount(0);
        setOfferingAmountThb('0');
        setSummaryNotes('');
        setPrayerRequests('');
        setCareNeedsNotes('');
        const map: Record<string, 'present' | 'absent' | 'excused'> = {};
        for (const m of groupMembers) map[m.id] = 'present';
        setAttendanceMap(map);
      }

      if (offline && !offline.synced && canEditSelected) {
        const p = offline.payload;
        if (typeof p.summaryNotes === 'string') setSummaryNotes(p.summaryNotes);
        if (typeof p.totalAttendees === 'number') setTotalAttendees(p.totalAttendees);
        setSaveState('offline_queued');
        setStatusMessage('กู้คืนฉบับร่างค้างส่งจากหน่วยความจำออฟไลน์ในเครื่องเรียบร้อย (CD-01)');
      } else {
        setSaveState('idle');
      }
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'โหลดข้อมูลรายงานไม่สำเร็จ');
    }
  }, [period.id, period.startDate, selectedGroupId, groupMembers, canEditSelected]);

  useEffect(() => {
    void loadGroupReport();
  }, [loadGroupReport]);

  function buildPayload() {
    return {
      meetingHeld,
      notHeldReason: meetingHeld ? null : notHeldReason,
      meetingDate,
      totalAttendees: Number(totalAttendees) || 0,
      memberAttendees: Number(memberAttendees) || 0,
      newVisitorsCount: Number(newVisitorsCount) || 0,
      returningVisitorsCount: Number(returningVisitorsCount) || 0,
      childrenCount: Number(childrenCount) || 0,
      offeringAmountThb,
      summaryNotes,
      prayerRequests,
      careNeedsNotes,
      attendance: Object.entries(attendanceMap).map(([memberId, attendanceStatus]) => ({
        memberId,
        attendanceStatus,
      })),
      ...(version !== undefined ? { expectedVersion: version } : {}),
    };
  }

  function handleToggleAttendance(
    memberId: string,
    status: 'present' | 'absent' | 'excused'
  ) {
    const next = { ...attendanceMap, [memberId]: status };
    setAttendanceMap(next);
    const presentCount = Object.values(next).filter((s) => s === 'present').length;
    setMemberAttendees(presentCount);
    setTotalAttendees(
      presentCount +
        (Number(newVisitorsCount) || 0) +
        (Number(returningVisitorsCount) || 0)
    );
  }

  const isLocked = ['submitted', 'under_review', 'approved'].includes(reportStatus);

  async function handleSaveDraft() {
    if (!canEditSelected || isLocked) return;
    setSaveState('saving');
    setStatusMessage(null);
    const payload = buildPayload();

    try {
      const res = await apiRequest<{ report: { version: number; status: string } }>(
        '/api/v1/reports',
        {
          method: 'POST',
          body: {
            action: 'save_draft',
            periodId: period.id,
            groupId: selectedGroupId,
            payload,
          },
        }
      );
      setVersion(res.report.version);
      setReportStatus(res.report.status);
      setSaveState('saved');
      await clearOfflineDraft(period.id, selectedGroupId);
      setStatusMessage('บันทึกร่างรายงานเรียบร้อย (ฉบับร่างนี้เป็นส่วนตัว เฉพาะผู้นำกลุ่ม)');
      await onRefresh();
    } catch (err) {
      await saveOfflineDraft({
        key: `${period.id}:${selectedGroupId}`,
        periodId: period.id,
        groupId: selectedGroupId,
        payload,
        savedAt: new Date().toISOString(),
        synced: false,
      });
      setSaveState('offline_queued');
      setStatusMessage(
        err instanceof Error
          ? `${err.message} — ระบบสำรองฉบับร่างลงเครื่องออฟไลน์ไว้ให้แล้ว (CD-01)`
          : 'สำรองฉบับร่างในเครื่องแล้ว จะซิงก์เมื่อออนไลน์'
      );
    }
  }

  async function handleSubmitReport() {
    if (!canEditSelected || isLocked) return;
    setSubmitting(true);
    setStatusMessage(null);
    const payload = buildPayload();

    try {
      const res = await apiRequest<{
        report: { version: number; status: string; isBlocked: boolean; blockedReason: string | null };
      }>('/api/v1/reports', {
        method: 'POST',
        idempotencyKey:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `sub-${Date.now()}`,
        body: {
          action: 'submit',
          periodId: period.id,
          groupId: selectedGroupId,
          payload,
        },
      });
      setVersion(res.report.version);
      setReportStatus(res.report.status);
      setIsBlocked(res.report.isBlocked);
      setBlockedReason(res.report.blockedReason);
      await clearOfflineDraft(period.id, selectedGroupId);
      setStatusMessage(
        res.report.isBlocked
          ? `ส่งรายงานแล้ว แต่ถูกติดสถานะ Blocked (${res.report.blockedReason}) ระบบแจ้งเตือนผู้ดูแลระบบแล้ว`
          : 'ส่งรายงานประจำสัปดาห์เรียบร้อยแล้ว! ขอบคุณที่ร่วมรับใช้'
      );
      await onRefresh();
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'ส่งรายงานไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuickVisitorSubmit(e: React.FormEvent) {
    e.preventDefault();
    setVisitorBusy(true);
    setVisitorError(null);
    try {
      await apiRequest('/api/v1/pastoral', {
        method: 'POST',
        body: {
          action: 'register_visitor',
          groupId: selectedGroupId,
          fullName: visitorName,
          nickname: visitorNickname || null,
          phoneE164: visitorPhone || null,
          consentForContact: visitorConsent,
          visitType: 'new_visitor',
          visitedOn: meetingDate,
          createFollowUp: visitorFollowUp,
        },
      });
      setNewVisitorsCount((n) => n + 1);
      setTotalAttendees((t) => t + 1);
      setVisitorName('');
      setVisitorNickname('');
      setVisitorPhone('');
      setVisitorConsent(false);
      setShowVisitorForm(false);
      await onRefresh();
    } catch (err) {
      setVisitorError(err instanceof Error ? err.message : 'บันทึกผู้เยี่ยมไม่สำเร็จ');
    } finally {
      setVisitorBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-teal-800">
              ส่งรายงานประจำสัปดาห์ {period.periodKey}
            </p>
            <h2 className="text-2xl font-bold text-slate-900">
              {selectedGroup?.nameTh ?? 'เลือกกลุ่มพันธกิจบ้าน'}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {isOnline ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
                ออนไลน์
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
                ออฟไลน์
              </span>
            )}
            <StatusBadge status={reportStatus} isBlocked={isBlocked} />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-base font-semibold text-slate-800">
            เลือกกลุ่มพันธกิจบ้านของคุณ
          </label>
          <select
            aria-label="เลือกกลุ่มพันธกิจบ้าน"
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-lg font-medium text-slate-900"
          >
            {(editableGroups.length > 0 ? editableGroups : workspace.groups).map((g) => (
              <option key={g.id} value={g.id}>
                {g.nameTh} ({g.district}) — [{g.currentReport.status}]
              </option>
            ))}
          </select>
        </div>

        {!canEditSelected && (
          <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-4 text-base text-slate-700">
            คุณกำลังดูกลุ่มนี้ในสิทธิ์ผู้ตรวจทาน/ผู้บริหาร (เฉพาะหัวหน้ากลุ่มของกลุ่มนี้เท่านั้นที่แก้ไขหรือบันทึกร่างได้ · FR-07.5)
          </div>
        )}

        {revisionReason && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <p className="text-base font-bold">คำแนะนำให้แก้ไขเพิ่มเติมก่อนส่งอีกครั้ง</p>
              <p className="mt-1 text-base">{revisionReason}</p>
            </div>
          </div>
        )}

        {isBlocked && (
          <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-950">
            <p className="text-base font-bold">รายงานนี้ถูกติดสถานะ Blocked ({blockedReason})</p>
            <p className="text-sm">ระบบส่งแจ้งเตือนผู้ดูแลระบบเพื่อมอบหมายหัวหน้าบอดี้ที่ใช้งานได้แล้ว</p>
          </div>
        )}

        {statusMessage && (
          <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-4 text-base font-medium text-teal-900">
            {statusMessage}
          </div>
        )}
      </div>

      {/* 3-Step Indicator (Elderly-accessible large touch tabs) */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { num: 1 as const, label: '1. การประชุม' },
          { num: 2 as const, label: '2. เช็คชื่อ & ผู้เยี่ยม' },
          { num: 3 as const, label: '3. สรุป & ส่ง' },
        ].map((item) => (
          <button
            key={item.num}
            type="button"
            onClick={() => setStep(item.num)}
            className={`min-h-[52px] rounded-xl border px-3 py-2 text-base font-bold transition ${
              step === item.num
                ? 'border-teal-700 bg-teal-700 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900">ขั้นตอนที่ 1: สถานะการจัดประชุมสัปดาห์นี้</h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!canEditSelected || isLocked}
              onClick={() => setMeetingHeld(true)}
              className={`min-h-[56px] rounded-xl border-2 px-4 py-3 text-lg font-bold transition ${
                meetingHeld
                  ? 'border-teal-700 bg-teal-50 text-teal-900'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              จัดประชุมกลุ่มตามปกติ
            </button>
            <button
              type="button"
              disabled={!canEditSelected || isLocked}
              onClick={() => setMeetingHeld(false)}
              className={`min-h-[56px] rounded-xl border-2 px-4 py-3 text-lg font-bold transition ${
                !meetingHeld
                  ? 'border-amber-600 bg-amber-50 text-amber-950'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              งดประชุมสัปดาห์นี้
            </button>
          </div>

          {!meetingHeld ? (
            <div>
              <label className="mb-1.5 block text-base font-semibold text-slate-800">
                ระบุเหตุผลที่งดประชุม *
              </label>
              <textarea
                rows={3}
                disabled={!canEditSelected || isLocked}
                value={notHeldReason}
                onChange={(e) => setNotHeldReason(e.target.value)}
                placeholder="เช่น สมาชิกส่วนใหญ่ติดภารกิจงานประเพณีชุมชน / ร่วมงานรวมคริสตจักร"
                className="w-full rounded-xl border border-slate-300 p-3 text-lg text-slate-900"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-base font-semibold text-slate-800">
                วันที่พบปะประชุม
              </label>
              <input
                type="date"
                disabled={!canEditSelected || isLocked}
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 px-4 py-2 text-lg text-slate-900"
              />
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="min-h-[52px] rounded-xl bg-teal-700 px-6 py-3 text-lg font-bold text-white hover:bg-teal-800"
            >
              ถัดไป: เช็คชื่อและผู้เยี่ยม
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xl font-bold text-slate-900">
              ขั้นตอนที่ 2: เช็คชื่อสมาชิกและบันทึกผู้เยี่ยมใหม่
            </h3>
            {canEditSelected && (
              <button
                type="button"
                onClick={() => setShowVisitorForm((v) => !v)}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-teal-700 bg-teal-50 px-4 py-2 text-base font-bold text-teal-900 hover:bg-teal-100"
              >
                <UserPlus className="h-5 w-5" aria-hidden="true" />
                <span>ลงทะเบียนผู้เยี่ยมใหม่ (PDPA)</span>
              </button>
            )}
          </div>

          {showVisitorForm && (
            <form
              onSubmit={handleQuickVisitorSubmit}
              className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/70 p-4"
            >
              <h4 className="text-base font-bold text-teal-950">
                เพิ่มผู้เยี่ยมใหม่ในกลุ่ม (ปฏิบัติตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล DEC-10)
              </h4>
              {visitorError && (
                <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
                  {visitorError}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  required
                  value={visitorName}
                  onChange={(e) => setVisitorName(e.target.value)}
                  placeholder="ชื่อ-นามสกุลผู้เยี่ยม *"
                  className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base"
                />
                <input
                  type="text"
                  value={visitorNickname}
                  onChange={(e) => setVisitorNickname(e.target.value)}
                  placeholder="ชื่อเล่น (ถ้ามี)"
                  className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base"
                />
                <input
                  type="tel"
                  value={visitorPhone}
                  onChange={(e) => setVisitorPhone(e.target.value)}
                  placeholder="เบอร์โทร +66... (ต้องขอความยินยอม)"
                  className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base sm:col-span-2"
                />
              </div>
              <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base">
                <input
                  type="checkbox"
                  checked={visitorConsent}
                  onChange={(e) => setVisitorConsent(e.target.checked)}
                  className="h-5 w-5 accent-teal-700"
                />
                <span>
                  ผู้เยี่ยมให้ความยินยอมเก็บข้อมูลติดต่อและรับการเยี่ยมติดตาม (PDPA DEC-10)
                </span>
              </label>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-base text-slate-800">
                <input
                  type="checkbox"
                  checked={visitorFollowUp}
                  onChange={(e) => setVisitorFollowUp(e.target.checked)}
                  className="h-5 w-5 accent-teal-700"
                />
                <span>สร้างงานเยี่ยมติดตามอัตโนมัติ (Follow-Up)</span>
              </label>
              <button
                type="submit"
                disabled={visitorBusy}
                className="min-h-[48px] rounded-xl bg-teal-700 px-5 py-2 text-base font-bold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {visitorBusy ? 'กำลังบันทึก...' : 'บันทึกผู้เยี่ยมใหม่'}
              </button>
            </form>
          )}

          {meetingHeld && (
            <>
              <div className="space-y-2.5">
                {groupMembers.map((m) => {
                  const status = attendanceMap[m.id] ?? 'present';
                  return (
                    <div
                      key={m.id}
                      className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center"
                    >
                      <div className="text-lg font-semibold text-slate-900">
                        {m.fullName}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(['present', 'absent', 'excused'] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            disabled={!canEditSelected || isLocked}
                            onClick={() => handleToggleAttendance(m.id, opt)}
                            className={`min-h-[48px] min-w-[74px] rounded-xl border px-3 text-base font-bold transition ${
                              status === opt
                                ? opt === 'present'
                                  ? 'border-emerald-700 bg-emerald-700 text-white'
                                  : opt === 'absent'
                                  ? 'border-rose-700 bg-rose-700 text-white'
                                  : 'border-amber-600 bg-amber-600 text-white'
                                : 'border-slate-300 bg-white text-slate-700'
                            }`}
                          >
                            {opt === 'present' ? 'มา' : opt === 'absent' ? 'ขาด' : 'ลา'}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-base font-semibold text-slate-800">
                    จำนวนผู้เข้าร่วมทั้งหมด
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={!canEditSelected || isLocked}
                    value={totalAttendees}
                    onChange={(e) => setTotalAttendees(Number(e.target.value))}
                    className="tabular-nums min-h-[48px] w-full rounded-xl border border-slate-300 px-4 text-lg font-bold"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-base font-semibold text-slate-800">
                    สมาชิกประจำ
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={!canEditSelected || isLocked}
                    value={memberAttendees}
                    onChange={(e) => setMemberAttendees(Number(e.target.value))}
                    className="tabular-nums min-h-[48px] w-full rounded-xl border border-slate-300 px-4 text-lg font-bold"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-base font-semibold text-slate-800">
                    ผู้เยี่ยมใหม่ (คน)
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={!canEditSelected || isLocked}
                    value={newVisitorsCount}
                    onChange={(e) => setNewVisitorsCount(Number(e.target.value))}
                    className="tabular-nums min-h-[48px] w-full rounded-xl border border-slate-300 px-4 text-lg font-bold"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-base font-semibold text-slate-800">
                    ผู้กลับมาเยี่ยม (คน)
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={!canEditSelected || isLocked}
                    value={returningVisitorsCount}
                    onChange={(e) => setReturningVisitorsCount(Number(e.target.value))}
                    className="tabular-nums min-h-[48px] w-full rounded-xl border border-slate-300 px-4 text-lg font-bold"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-5 py-3 text-lg font-semibold text-slate-800"
            >
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="min-h-[52px] rounded-xl bg-teal-700 px-6 py-3 text-lg font-bold text-white hover:bg-teal-800"
            >
              ถัดไป: คำอธิษฐานและส่งรายงาน
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900">
            ขั้นตอนที่ 3: บันทึกคำอธิษฐาน การดูแล และส่งรายงาน
          </h3>

          <div>
            <label className="mb-1.5 block text-base font-semibold text-slate-800">
              สรุปบรรยากาศและการแบ่งปันในกลุ่ม
            </label>
            <textarea
              rows={3}
              disabled={!canEditSelected || isLocked}
              value={summaryNotes}
              onChange={(e) => setSummaryNotes(e.target.value)}
              placeholder="สรุปสิ่งดีที่เกิดขึ้นในกลุ่มสัปดาห์นี้..."
              className="w-full rounded-xl border border-slate-300 p-3 text-lg text-slate-900"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-base font-semibold text-slate-800">
              หัวข้ออธิษฐานและการหนุนใจ
            </label>
            <textarea
              rows={2}
              disabled={!canEditSelected || isLocked}
              value={prayerRequests}
              onChange={(e) => setPrayerRequests(e.target.value)}
              placeholder="เช่น อธิษฐานเผื่อสุขภาพสมาชิก..."
              className="w-full rounded-xl border border-slate-300 p-3 text-lg text-slate-900"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-base font-semibold text-slate-800">
              ความต้องการการเยี่ยมเยียน / การอภิบาลเร่งด่วน
            </label>
            <textarea
              rows={2}
              disabled={!canEditSelected || isLocked}
              value={careNeedsNotes}
              onChange={(e) => setCareNeedsNotes(e.target.value)}
              placeholder="ระบุหากต้องการหัวหน้าแคร์หรือศิษยาภิบาลร่วมเยี่ยม..."
              className="w-full rounded-xl border border-slate-300 p-3 text-lg text-slate-900"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              disabled={!canEditSelected || isLocked || saveState === 'saving'}
              onClick={handleSaveDraft}
              className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-lg font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              <Save className="h-5 w-5" aria-hidden="true" />
              <span>
                {saveState === 'saving'
                  ? 'กำลังบันทึกร่าง...'
                  : 'บันทึกร่าง (Draft ส่วนตัว)'}
              </span>
            </button>

            <button
              type="button"
              disabled={!canEditSelected || isLocked || submitting}
              onClick={handleSubmitReport}
              className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 py-3 text-lg font-bold text-white shadow-sm hover:bg-teal-800 disabled:opacity-50"
            >
              {isLocked ? (
                <>
                  <Check className="h-5 w-5" aria-hidden="true" />
                  <span>ส่งรายงานแล้ว ({reportStatus})</span>
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" aria-hidden="true" />
                  <span>{submitting ? 'กำลังส่ง...' : 'ส่งรายงานประจำสัปดาห์'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
