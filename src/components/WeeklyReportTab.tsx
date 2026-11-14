'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CloudOff,
  Minus,
  Plus,
  Save,
  Send,
  Sparkles,
  UserPlus,
  Wifi,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { normalizeThaiPhone } from '@/lib/phone';
import {
  clearOfflineDraft,
  loadOfflineDraft,
  saveOfflineDraft,
} from '@/lib/offline-drafts';
import type { WorkspacePayload } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

const QUICK_SUMMARY_CHIPS = [
  'นมัสการเปี่ยมพลัง สมาชิกมีส่วนร่วมครบ',
  'หนุนใจเยาวชนคนรุ่นใหม่และแบ่งปันพระวจนะ',
  'ฉลองคำพยานชีวิตและต้อนรับผู้เยี่ยมใหม่',
];

const QUICK_PRAYER_CHIPS = [
  'สุขภาพครอบครัวผู้สูงอายุในชุมชน',
  'การเรียนและการสอบของเยาวชน Gen Z / Alpha',
  'การงานและเศรษฐกิจของครอบครัวสมาชิก',
];

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

  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'offline_queued' | 'error'
  >('idle');
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
        setStatusMessage('กู้คืนฉบับร่างค้างส่งจากในเครื่องเรียบร้อยแล้ว');
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
          ? `${err.message} — ระบบสำรองฉบับร่างไว้ในเครื่องให้แล้ว`
          : 'สำรองฉบับร่างในเครื่องแล้ว จะส่งเข้าระบบเมื่อมีเน็ต'
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
        report: {
          version: number;
          status: string;
          isBlocked: boolean;
          blockedReason: string | null;
        };
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
          ? `ส่งรายงานแล้ว แต่ติดปัญหาส่งต่อ (${res.report.blockedReason}) ระบบแจ้งเตือนผู้ดูแลระบบแล้ว`
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
          phoneE164: normalizeThaiPhone(visitorPhone),
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

  const counterRows = [
    {
      label: 'ผู้เข้าร่วมทั้งหมด',
      value: totalAttendees,
      setter: setTotalAttendees,
      tone: 'bg-[#C8FF00]',
    },
    {
      label: 'สมาชิกประจำที่มา',
      value: memberAttendees,
      setter: (v: number) => {
        const diff = v - memberAttendees;
        setMemberAttendees(v);
        setTotalAttendees((t) => Math.max(0, t + diff));
      },
      tone: 'bg-[var(--fm-paper)]',
    },
    {
      label: 'ผู้เยี่ยมใหม่ (คน)',
      value: newVisitorsCount,
      setter: (v: number) => {
        const diff = v - newVisitorsCount;
        setNewVisitorsCount(v);
        setTotalAttendees((t) => Math.max(0, t + diff));
      },
      tone: 'bg-[#DBEAFE]',
    },
    {
      label: 'ผู้กลับมาเยี่ยม (คน)',
      value: returningVisitorsCount,
      setter: (v: number) => {
        const diff = v - returningVisitorsCount;
        setReturningVisitorsCount(v);
        setTotalAttendees((t) => Math.max(0, t + diff));
      },
      tone: 'bg-[#FEF3C7]',
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Studio Group Header */}
      <section className="fm-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#141413] bg-[#141413] px-6 py-4 text-[#F0F4F8]">
          <h1 className="font-display text-2xl font-extrabold sm:text-3xl">
            {selectedGroup?.nameTh ?? 'เลือกกลุ่มพันธกิจบ้าน'} (รอบ {period.periodKey})
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            {isOnline ? (
              <span className="fm-sticker bg-[#C8FF00] text-[#141413]">
                <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
                <span>เชื่อมต่อเน็ตปกติ</span>
              </span>
            ) : (
              <span className="fm-sticker bg-[#FFB703] text-[#141413]">
                <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
                <span>ไม่มีเน็ต (บันทึกลงเครื่องไว้ก่อนได้)</span>
              </span>
            )}
            <StatusBadge status={reportStatus} isBlocked={isBlocked} />
          </div>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label
              htmlFor="fm-group-select"
              className="mb-1.5 block text-base font-extrabold text-[#141413]"
            >
              เลือกกลุ่มพันธกิจบ้านของคุณ
            </label>
            <select
              id="fm-group-select"
              aria-label="เลือกกลุ่มพันธกิจบ้าน"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="fm-input w-full text-lg font-extrabold"
            >
              {(editableGroups.length > 0 ? editableGroups : workspace.groups).map((g) => {
                const statusLabel =
                  g.currentReport.status === 'approved'
                    ? 'อนุมัติแล้ว'
                    : g.currentReport.status === 'submitted'
                      ? 'ส่งแล้ว'
                      : g.currentReport.status === 'under_review'
                        ? 'กำลังตรวจ'
                        : g.currentReport.status === 'needs_revision'
                          ? 'รอแก้ไข'
                          : g.currentReport.status === 'draft'
                            ? 'ฉบับร่าง'
                            : 'ยังไม่ส่ง';
                return (
                  <option key={g.id} value={g.id}>
                    {g.nameTh} ({g.district}) — {statusLabel}
                  </option>
                );
              })}
            </select>
          </div>

          {!canEditSelected && (
            <div className="border-t-2 border-dashed border-[#141413]/30 pt-3 text-base font-bold text-[#1D4ED8]">
              คุณกำลังดูกลุ่มนี้ในสิทธิ์ผู้ตรวจทาน/ผู้บริหาร (เฉพาะผู้นำกลุ่มของกลุ่มนี้เท่านั้นที่แก้ไขหรือบันทึกร่างได้)
            </div>
          )}

          {revisionReason && (
            <div className="flex items-start gap-3 rounded-xl border-2 border-[#141413] bg-[#FEF3C7] p-4 text-[#141413]">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
              <div>
                <div className="text-base font-extrabold">คำแนะนำให้แก้ไขเพิ่มเติมก่อนส่งอีกครั้ง</div>
                <p className="mt-1 text-base font-medium">{revisionReason}</p>
              </div>
            </div>
          )}

          {isBlocked && (
            <div className="rounded-xl border-2 border-[#141413] bg-[#FFE4E6] p-4 text-[#881337]">
              <div className="text-base font-extrabold">
                รายงานนี้ติดปัญหาส่งต่อ ({blockedReason})
              </div>
              <p className="mt-1 text-sm font-bold">
                ระบบแจ้งเตือนผู้ดูแลระบบเพื่อมอบหมายหัวหน้าบอดี้ที่ใช้งานได้แล้ว
              </p>
            </div>
          )}

          {statusMessage && (
            <div className="rounded-xl border-2 border-[#141413] bg-[#C8FF00] p-4 text-base font-extrabold text-[#141413]">
              {statusMessage}
            </div>
          )}
        </div>
      </section>

      {/* Tactile 3-Step Switcher */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { num: 1 as const, label: 'ขั้นที่ 1 · การประชุม' },
          { num: 2 as const, label: 'ขั้นที่ 2 · เช็คชื่อ & ยอด' },
          { num: 3 as const, label: 'ขั้นที่ 3 · คำอธิษฐาน & ส่ง' },
        ].map((item) => (
          <button
            key={item.num}
            type="button"
            onClick={() => setStep(item.num)}
            className={`fm-btn min-h-[54px] text-base ${
              step === item.num ? 'fm-btn-lime' : 'fm-btn-paper'
            }`}
          >
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* STEP 1: Meeting Status */}
      {step === 1 && (
        <section className="fm-panel space-y-5 p-6">
          <h2 className="font-display text-2xl font-extrabold text-[#141413]">
            ขั้นตอนที่ 1: สัปดาห์นี้กลุ่มของคุณจัดประชุมหรือไม่?
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              disabled={!canEditSelected || isLocked}
              onClick={() => setMeetingHeld(true)}
              className={`fm-btn min-h-[64px] text-lg ${
                meetingHeld ? 'fm-btn-lime' : 'fm-btn-paper'
              }`}
            >
              <span>จัดประชุมกลุ่มตามปกติ</span>
            </button>
            <button
              type="button"
              disabled={!canEditSelected || isLocked}
              onClick={() => setMeetingHeld(false)}
              className={`fm-btn min-h-[64px] text-lg ${
                !meetingHeld ? 'bg-[#FFB703] text-[#141413]' : 'fm-btn-paper'
              }`}
            >
              <span>งดประชุมสัปดาห์นี้</span>
            </button>
          </div>

          {!meetingHeld ? (
            <div>
              <label className="mb-1.5 block text-base font-extrabold text-[#141413]">
                ระบุเหตุผลที่งดประชุม *
              </label>
              <textarea
                rows={3}
                disabled={!canEditSelected || isLocked}
                value={notHeldReason}
                onChange={(e) => setNotHeldReason(e.target.value)}
                placeholder="เช่น สมาชิกร่วมงานบุญประเพณีชุมชน / ร่วมนมัสการรวมระดับบอดี้"
                className="fm-input w-full text-lg"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-base font-extrabold text-[#141413]">
                วันที่พบปะกลุ่มพันธกิจบ้าน
              </label>
              <input
                type="date"
                disabled={!canEditSelected || isLocked}
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="fm-input w-full text-lg font-bold"
              />
            </div>
          )}

          <div className="flex justify-end border-t-2 border-[#141413] pt-4">
            <button
              type="button"
              onClick={() => {
                if (!meetingHeld && !notHeldReason.trim()) {
                  setStatusMessage('กรุณาระบุเหตุผลที่งดประชุมก่อนดำเนินการต่อ');
                  return;
                }
                setStatusMessage(null);
                setStep(meetingHeld ? 2 : 3);
              }}
              className="fm-btn fm-btn-violet min-h-[54px] whitespace-nowrap px-6 text-lg"
            >
              <span>{meetingHeld ? 'ถัดไป: เช็คชื่อและผู้เยี่ยม' : 'ถัดไป: สรุปและส่งรายงาน'}</span>
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {/* STEP 2: Attendance & Tactile Steppers */}
      {step === 2 && (
        <section className="fm-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#141413] bg-[#E2E8F0] px-6 py-4">
            <h2 className="font-display text-2xl font-extrabold text-[#141413]">
              ขั้นตอนที่ 2: เช็คชื่อสมาชิกและแตะนับผู้เยี่ยม
            </h2>
            {canEditSelected && (
              <button
                type="button"
                onClick={() => setShowVisitorForm((v) => !v)}
                className="fm-btn fm-btn-lime text-base"
              >
                <UserPlus className="h-5 w-5" aria-hidden="true" />
                <span>+ ลงทะเบียนผู้เยี่ยมใหม่</span>
              </button>
            )}
          </div>

          <div className="space-y-6 p-6">
            {showVisitorForm && (
              <form
                onSubmit={handleQuickVisitorSubmit}
                className="space-y-4 rounded-xl border-2 border-[#141413] bg-[#F0F4F8] p-5"
              >
                <h3 className="font-display text-lg font-extrabold text-[#141413]">
                  ลงทะเบียนผู้เยี่ยมใหม่ในกลุ่ม
                </h3>
                {visitorError && (
                  <div className="rounded-lg border-2 border-[#141413] bg-[#FFE4E6] p-3 text-sm font-bold text-[#881337]">
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
                    className="fm-input"
                  />
                  <input
                    type="text"
                    value={visitorNickname}
                    onChange={(e) => setVisitorNickname(e.target.value)}
                    placeholder="ชื่อเล่น (ถ้ามี)"
                    className="fm-input"
                  />
                  <input
                    type="tel"
                    value={visitorPhone}
                    onChange={(e) => setVisitorPhone(e.target.value)}
                    placeholder="เบอร์โทร เช่น 081-234-5678"
                    className="fm-input sm:col-span-2"
                  />
                </div>
                <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border-2 border-[#141413] bg-white px-4 py-2 text-base font-bold">
                  <input
                    type="checkbox"
                    checked={visitorConsent}
                    onChange={(e) => setVisitorConsent(e.target.checked)}
                    className="h-5 w-5 accent-[#1D4ED8]"
                  />
                  <span>
                    ผู้เยี่ยมยินยอมให้เก็บเบอร์โทรเพื่อติดต่อเยี่ยมเยียน
                  </span>
                </label>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-base font-bold text-[#141413]">
                  <input
                    type="checkbox"
                    checked={visitorFollowUp}
                    onChange={(e) => setVisitorFollowUp(e.target.checked)}
                    className="h-5 w-5 accent-[#1D4ED8]"
                  />
                  <span>สร้างงานเยี่ยมติดตามอัตโนมัติ (Follow-Up)</span>
                </label>
                <button
                  type="submit"
                  disabled={visitorBusy}
                  className="fm-btn fm-btn-violet text-base"
                >
                  <span>{visitorBusy ? 'กำลังบันทึก...' : 'บันทึกผู้เยี่ยมใหม่เข้ากลุ่ม'}</span>
                </button>
              </form>
            )}

            {meetingHeld && (
              <>
                {/* Member Attendance Ledger */}
                <div className="divide-y-2 divide-[#141413] rounded-xl border-2 border-[#141413] bg-white">
                  {groupMembers.map((m) => {
                    const status = attendanceMap[m.id] ?? 'present';
                    return (
                      <div
                        key={m.id}
                        className="flex flex-col justify-between gap-3 px-4 py-3.5 sm:flex-row sm:items-center"
                      >
                        <div className="text-lg font-extrabold text-[#141413]">
                          {m.fullName}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {(['present', 'absent', 'excused'] as const).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              disabled={!canEditSelected || isLocked}
                              onClick={() => handleToggleAttendance(m.id, opt)}
                              className={`min-h-[48px] min-w-[78px] rounded-xl border-2 border-[#141413] px-3 text-base font-extrabold transition ${
                                status === opt
                                  ? opt === 'present'
                                    ? 'bg-[#C8FF00] text-[#141413] shadow-[2px_2px_0px_#141413]'
                                    : opt === 'absent'
                                    ? 'bg-[#BE123C] text-white shadow-[2px_2px_0px_#141413]'
                                    : 'bg-[#FFB703] text-[#141413] shadow-[2px_2px_0px_#141413]'
                                  : 'bg-[#F0F4F8] text-[#27272A]'
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

                {/* Tactile Counter Deck */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {counterRows.map((item) => (
                    <div
                      key={item.label}
                      className={`flex items-center justify-between gap-3 rounded-xl border-2 border-[#141413] p-4 ${item.tone}`}
                    >
                      <div>
                        <label className="block text-sm font-extrabold text-[#141413]">
                          {item.label}
                        </label>
                        <input
                          type="number"
                          min={0}
                          aria-label={item.label}
                          disabled={!canEditSelected || isLocked}
                          value={item.value}
                          onChange={(e) => item.setter(Math.max(0, Number(e.target.value)))}
                          className="tabular-nums mt-1 w-24 rounded-lg border-2 border-[#141413] bg-[var(--fm-paper)] px-2.5 py-1 font-mono text-2xl font-extrabold text-[#141413]"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={`ลด ${item.label}`}
                          disabled={!canEditSelected || isLocked || item.value <= 0}
                          onClick={() => item.setter(Math.max(0, item.value - 1))}
                          className="fm-btn fm-btn-paper min-h-[48px] min-w-[48px] p-0"
                        >
                          <Minus className="h-5 w-5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`เพิ่ม ${item.label}`}
                          disabled={!canEditSelected || isLocked}
                          onClick={() => item.setter(item.value + 1)}
                          className="fm-btn fm-btn-paper min-h-[48px] min-w-[48px] p-0"
                        >
                          <Plus className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Children Count & Offering Amount */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border-2 border-[#141413] bg-[var(--fm-paper)] p-4">
                    <label
                      htmlFor="fm-children-count"
                      className="block text-sm font-extrabold text-[#141413]"
                    >
                      จำนวนเด็กที่เข้าร่วม (คน)
                    </label>
                    <input
                      id="fm-children-count"
                      type="number"
                      min={0}
                      disabled={!canEditSelected || isLocked}
                      value={childrenCount}
                      onChange={(e) => setChildrenCount(Math.max(0, Number(e.target.value)))}
                      className="fm-input tabular-nums mt-1.5 w-full font-mono text-xl font-extrabold"
                    />
                  </div>
                  <div className="rounded-xl border-2 border-[#141413] bg-[var(--fm-paper)] p-4">
                    <label
                      htmlFor="fm-offering-thb"
                      className="block text-sm font-extrabold text-[#141413]"
                    >
                      ยอดถวายทรัพย์ประจำสัปดาห์ (บาท)
                    </label>
                    <input
                      id="fm-offering-thb"
                      type="number"
                      min={0}
                      step="1"
                      disabled={!canEditSelected || isLocked}
                      value={offeringAmountThb}
                      onChange={(e) => setOfferingAmountThb(e.target.value)}
                      className="fm-input tabular-nums mt-1.5 w-full font-mono text-xl font-extrabold"
                    />
                  </div>
                </div>
              </>
            )}

            {!meetingHeld && (
              <div className="rounded-xl border-2 border-[#141413] bg-[var(--fm-amber)] p-4 text-base font-extrabold text-[#141413]">
                สัปดาห์นี้เลือกงดประชุม ({notHeldReason || 'ระบุเหตุผลแล้ว'}) — ไม่ต้องเช็คชื่อสมาชิก กดถัดไปเพื่อส่งรายงานได้เลย
              </div>
            )}

            <div className="flex justify-between border-t-2 border-[#141413] pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="fm-btn fm-btn-paper min-h-[54px] px-5 text-lg"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                <span>ย้อนกลับ</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="fm-btn fm-btn-violet min-h-[54px] px-6 text-lg"
              >
                <span>ถัดไป: คำอธิษฐานและส่งรายงาน</span>
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* STEP 3: Prayer, Quick Vibe Chips & Submit */}
      {step === 3 && (
        <section className="fm-panel space-y-5 p-6">
          <h2 className="font-display text-2xl font-extrabold text-[#141413]">
            ขั้นตอนที่ 3: บันทึกคำอธิษฐาน การอภิบาล และกดส่งรายงาน
          </h2>

          <div>
            <label className="mb-1.5 block text-base font-extrabold text-[#141413]">
              สรุปบรรยากาศและการแบ่งปันในกลุ่ม
            </label>
            {canEditSelected && !isLocked && (
              <div className="mb-2 flex flex-wrap gap-2">
                {QUICK_SUMMARY_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      setSummaryNotes((prev) => (prev ? `${prev} · ${chip}` : chip))
                    }
                    className="rounded-full border-2 border-[#141413] bg-[#E2E8F0] px-3 py-1 text-xs font-extrabold text-[#141413] transition hover:bg-[#C8FF00]"
                  >
                    <Sparkles className="mr-1 inline h-3 w-3" aria-hidden="true" />
                    + {chip}
                  </button>
                ))}
              </div>
            )}
            <textarea
              rows={3}
              disabled={!canEditSelected || isLocked}
              value={summaryNotes}
              onChange={(e) => setSummaryNotes(e.target.value)}
              placeholder="สรุปสิ่งดีที่เกิดขึ้นในกลุ่มสัปดาห์นี้..."
              className="fm-input w-full text-lg"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-base font-extrabold text-[#141413]">
              หัวข้ออธิษฐานและการหนุนใจ
            </label>
            {canEditSelected && !isLocked && (
              <div className="mb-2 flex flex-wrap gap-2">
                {QUICK_PRAYER_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      setPrayerRequests((prev) => (prev ? `${prev} · ${chip}` : chip))
                    }
                    className="rounded-full border-2 border-[#141413] bg-[#DBEAFE] px-3 py-1 text-xs font-extrabold text-[#141413] transition hover:bg-[#C8FF00] hover:text-[#141413]"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            )}
            <textarea
              rows={2}
              disabled={!canEditSelected || isLocked}
              value={prayerRequests}
              onChange={(e) => setPrayerRequests(e.target.value)}
              placeholder="เช่น อธิษฐานเผื่อสุขภาพสมาชิก..."
              className="fm-input w-full text-lg"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-base font-extrabold text-[#141413]">
              ความต้องการการเยี่ยมเยียน / การอภิบาลเร่งด่วน
            </label>
            <textarea
              rows={2}
              disabled={!canEditSelected || isLocked}
              value={careNeedsNotes}
              onChange={(e) => setCareNeedsNotes(e.target.value)}
              placeholder="ระบุหากต้องการหัวหน้าแคร์หรือศิษยาภิบาลร่วมเยี่ยม..."
              className="fm-input w-full text-lg"
            />
          </div>

          <div className="flex flex-col gap-3 border-t-2 border-[#141413] pt-4 sm:flex-row sm:justify-between">
            <button
              type="button"
              disabled={!canEditSelected || isLocked || saveState === 'saving'}
              onClick={handleSaveDraft}
              className="fm-btn fm-btn-paper min-h-[56px] px-5 text-lg"
            >
              <Save className="h-5 w-5" aria-hidden="true" />
              <span>
                {saveState === 'saving'
                  ? 'กำลังบันทึกร่าง...'
                  : 'บันทึกร่างส่วนตัว (Offline-Ready)'}
              </span>
            </button>

            <button
              type="button"
              disabled={!canEditSelected || isLocked || submitting}
              onClick={handleSubmitReport}
              className="fm-btn fm-btn-lime min-h-[56px] px-7 text-lg"
            >
              <Send className="h-5 w-5" aria-hidden="true" />
              <span>
                {submitting
                  ? 'กำลังส่งรายงาน...'
                  : isLocked
                  ? 'ส่งรายงานแล้ว'
                  : 'ยืนยันส่งรายงานประจำสัปดาห์'}
              </span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
