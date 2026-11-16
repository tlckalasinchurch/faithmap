'use client';

import { useRef, useState } from 'react';
import {
  CheckCircle2,
  EyeOff,
  RotateCcw,
  ShieldAlert,
  Unlock,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { ReportQueueItem, WorkspacePayload } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

export function ApprovalQueueTab({
  workspace,
  onRefresh,
  onOpenReportForGroup,
}: {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
  onOpenReportForGroup: (groupId: string) => void;
}) {
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'BLOCKED' | 'APPROVED'>('ALL');
  const [reasonErrorId, setReasonErrorId] = useState<string | null>(null);
  const noteInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const filteredReports = workspace.reports.filter((r) => {
    if (statusFilter === 'PENDING') {
      return ['submitted', 'under_review'].includes(r.status) && !r.isBlocked;
    }
    if (statusFilter === 'BLOCKED') {
      return r.isBlocked || r.status === 'needs_revision';
    }
    if (statusFilter === 'APPROVED') {
      return r.status === 'approved';
    }
    return true;
  });

  const actor = workspace.actor;
  const supervisorGroups = new Set(actor.supervisorGroupIds);
  const bodyLeaderBodies = new Set(actor.bodyLeaderBodyIds);
  const isAdmin =
    actor.user.systemRole === 'admin' || actor.user.systemRole === 'super_admin';

  async function runAction(
    report: ReportQueueItem,
    body: Record<string, unknown>,
    successMsg: string
  ) {
    setBusyId(report.id);
    setBanner(null);
    try {
      await apiRequest('/api/v1/reports', {
        method: 'POST',
        body,
      });
      setBanner({ type: 'ok', text: successMsg });
      await onRefresh();
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'ดำเนินการไม่สำเร็จ',
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="fm-panel-ink p-6">
        <h1 className="font-display text-3xl font-extrabold text-[#F0F4F8]">
          คิวตรวจทานและอนุมัติรายงาน · รอบ {workspace.overview.selectedPeriod.periodKey}
        </h1>
        <p className="mt-2 text-base font-medium text-[#E2E8F0]">
          ตรวจสอบและอนุมัติรายงานตามลำดับจากหัวหน้าแคร์/ผู้ประสานงานสู่หัวหน้าบอดี้
        </p>
      </section>

      {banner && (
        <div
          role="alert"
          className={`fm-panel p-4 text-base font-extrabold ${
            banner.type === 'ok'
              ? 'bg-[#C8FF00] text-[#141413]'
              : 'bg-[#FFE4E6] text-[#881337]'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'ALL' as const, label: `ทั้งหมด (${workspace.reports.length})` },
          { id: 'PENDING' as const, label: 'รอตรวจ / รออนุมัติ' },
          { id: 'BLOCKED' as const, label: 'ติดขัด / ขอแก้ไข' },
          { id: 'APPROVED' as const, label: 'อนุมัติแล้ว' },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatusFilter(f.id)}
            className={`min-h-[48px] rounded-xl border-2 border-[var(--fm-ink)] px-3.5 py-1.5 text-base font-extrabold ${
              statusFilter === f.id
                ? 'bg-[var(--fm-ink)] text-[var(--fm-lime)]'
                : 'bg-[var(--fm-paper)] text-[var(--fm-ink)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="fm-panel divide-y-2 divide-[#141413] overflow-hidden">
        {filteredReports.length === 0 ? (
          <div className="bg-white p-8 text-center">
            <p className="text-lg font-extrabold text-[#141413]">
              {workspace.reports.length === 0
                ? `ยังไม่มีรายงานส่งเข้ามาในรอบ ${workspace.overview.selectedPeriod.periodKey}`
                : 'ไม่มีรายงานที่ตรงกับตัวกรองนี้'}
            </p>
            <p className="mt-1.5 text-base font-medium text-[#27272A]">
              {workspace.reports.length === 0
                ? 'เมื่อผู้รับผิดชอบพันธกิจบ้านกดส่งรายงานประจำสัปดาห์ รายการจะปรากฏที่นี่เพื่อให้คุณตรวจทานและอนุมัติ'
                : 'ลองเปลี่ยนตัวกรองสถานะด้านบนหรือดูรายการทั้งหมดในรอบนี้'}
            </p>
            {statusFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className="fm-btn fm-btn-paper mt-4 min-h-[48px] px-4 text-base font-bold"
              >
                แสดงรายงานทั้งหมด ({workspace.reports.length})
              </button>
            )}
          </div>
        ) : (
        filteredReports.map((report) => {
          const canReview =
            supervisorGroups.has(report.groupId) &&
            !report.isDraftHidden &&
            !report.isBlocked &&
            ['submitted', 'under_review'].includes(report.status);
          const isSelfSubmitter = report.submittedByUserId === actor.user.id;
          const canApproveRole =
            (report.bodyId ? bodyLeaderBodies.has(report.bodyId) : false) &&
            !report.isDraftHidden &&
            ['submitted', 'under_review'].includes(report.status);

          const noteText = notesById[report.id] ?? '';

          return (
            <article key={report.id} className="bg-white p-6">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="font-display text-2xl font-extrabold text-[#141413]">
                      {report.groupName}
                    </h2>
                    <span className="rounded-lg border-2 border-[#141413] bg-[#E2E8F0] px-2.5 py-0.5 text-base font-bold text-[#141413]">
                      {report.bodyName}
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <StatusBadge
                      status={report.status}
                      isBlocked={report.isBlocked}
                      isLate={report.isLate}
                    />
                  </div>
                </div>

                <div className="text-base sm:text-right">
                  {report.requiresSupervisorReview ? (
                    <span className="fm-sticker bg-[#F0F4F8] text-[#141413]">
                      เส้นทาง: ผู้นำกลุ่ม → ผู้ตรวจทาน (แคร์/ประสานงาน) → หัวหน้าบอดี้
                    </span>
                  ) : (
                    <span className="fm-sticker bg-[#C8FF00] text-[#141413]">
                      เส้นทางตรง: ไม่มีผู้ตรวจทาน → หัวหน้าบอดี้อนุมัติได้ทันที
                    </span>
                  )}
                </div>
              </div>

              {report.isDraftHidden ? (
                <div className="mt-4 flex items-center gap-3 rounded-xl border-2 border-[#141413] bg-[#E2E8F0] p-4 text-base font-bold text-[#141413]">
                  <EyeOff className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span>
                    ผู้นำกลุ่มกำลังแก้ไขฉบับร่างส่วนตัว ข้อมูลรายละเอียดยังไม่เปิดให้ดูจนกว่าจะกดส่งรายงาน
                  </span>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="tabular-nums grid grid-cols-2 divide-x-2 divide-[#141413] rounded-xl border-2 border-[#141413] bg-[#F0F4F8] text-base sm:grid-cols-4">
                    <div className="p-3">
                      <div className="text-base font-bold text-[#27272A]">สถานะประชุม</div>
                      <div className="mt-0.5 font-extrabold text-[#141413]">
                        {report.meetingHeld ? 'จัดประชุม' : 'งดประชุม'}
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-base font-bold text-[#27272A]">ผู้เข้าร่วมรวม</div>
                      <div className="mt-0.5 font-mono font-extrabold text-[#141413]">
                        {report.totalAttendees} คน
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-base font-bold text-[#27272A]">ผู้เยี่ยมใหม่</div>
                      <div className="mt-0.5 font-mono font-extrabold text-[#1D4ED8]">
                        {report.newVisitorsCount} คน
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-base font-bold text-[#27272A]">ผู้ส่งรายงาน</div>
                      <div className="mt-0.5 font-bold text-[#141413]">
                        {report.submittedByName ?? '-'}
                      </div>
                    </div>
                  </div>

                  {report.summaryNotes && (
                    <p className="text-base font-medium text-[#141413]">
                      <strong className="font-extrabold">สรุปกลุ่ม:</strong> {report.summaryNotes}
                    </p>
                  )}
                  {report.prayerRequests && (
                    <p className="text-base font-medium text-[#141413]">
                      <strong className="font-extrabold">คำอธิษฐาน:</strong> {report.prayerRequests}
                    </p>
                  )}
                  {report.revisionReason && (
                    <p className="rounded-xl border-2 border-[#141413] bg-[#FEF3C7] p-3 text-base font-bold text-[#141413]">
                      <strong>เหตุผลส่งกลับแก้ไข:</strong> {report.revisionReason}
                    </p>
                  )}
                  {report.isBlocked && (
                    <div className="flex items-start gap-2.5 rounded-xl border-2 border-[#141413] bg-[#FFE4E6] p-3.5 text-base font-bold text-[#881337]">
                      <ShieldAlert
                        className="mt-0.5 h-5 w-5 shrink-0 text-[#BE123C]"
                        aria-hidden="true"
                      />
                      <div>
                        <strong>ติดปัญหาส่งต่อ:</strong> {report.blockedReason} —
                        ต้องแก้ปัญหาหัวหน้าบอดี้ก่อนจึงจะปลดล็อกได้
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(canReview || canApproveRole || (isAdmin && report.isBlocked)) && (
                <div className="mt-4 space-y-3 border-t-2 border-dashed border-[#141413]/30 pt-4">
                  <input
                    ref={(el) => {
                      noteInputRefs.current[report.id] = el;
                    }}
                    type="text"
                    value={noteText}
                    onChange={(e) => {
                      setReasonErrorId((prev) => (prev === report.id ? null : prev));
                      setNotesById((prev) => ({ ...prev, [report.id]: e.target.value }));
                    }}
                    placeholder="หมายเหตุการตรวจทาน / เหตุผลในการส่งกลับขอแก้ไข…"
                    className={`fm-input w-full ${
                      reasonErrorId === report.id ? 'border-[var(--fm-coral)] ring-2 ring-[var(--fm-coral)]' : ''
                    }`}
                  />
                  {reasonErrorId === report.id && (
                    <p className="text-base font-extrabold text-[var(--fm-coral)]">
                      กรุณาระบุเหตุผลในการส่งกลับขอแก้ไขก่อนกดปุ่มนี้
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2.5">
                    {canReview && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === report.id}
                          onClick={() =>
                            runAction(
                              report,
                              {
                                action: 'review',
                                reportId: report.id,
                                decision: 'forward',
                                notesOrReason: noteText || 'ตรวจทานถูกต้อง',
                                expectedVersion: report.version,
                              },
                              `ตรวจทานรายงาน ${report.groupName} และส่งต่อหัวหน้าบอดี้แล้ว`
                            )
                          }
                          className="fm-btn fm-btn-violet text-base"
                        >
                          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                          <span>ผ่านการตรวจทาน → ส่งต่อหัวหน้าบอดี้</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === report.id}
                          onClick={() => {
                            if (!noteText.trim()) {
                              setReasonErrorId(report.id);
                              noteInputRefs.current[report.id]?.focus();
                              return;
                            }
                            void runAction(
                              report,
                              {
                                action: 'review',
                                reportId: report.id,
                                decision: 'request_revision',
                                notesOrReason: noteText.trim(),
                                expectedVersion: report.version,
                              },
                              `ส่งกลับรายงาน ${report.groupName} ให้ผู้นำกลุ่มแก้ไขแล้ว`
                            );
                          }}
                          className="fm-btn bg-[#FFB703] text-base text-[#141413]"
                        >
                          <RotateCcw className="h-5 w-5" aria-hidden="true" />
                          <span>ส่งกลับขอแก้ไข</span>
                        </button>
                      </>
                    )}

                    {canApproveRole && (
                      <>
                        {isSelfSubmitter ? (
                          <span className="inline-flex min-h-[48px] items-center rounded-xl border-2 border-[#141413] bg-[#FFE4E6] px-4 text-base font-extrabold text-[#881337]">
                            ผู้ส่งรายงานไม่สามารถอนุมัติรายงานของตนเองได้
                          </span>
                        ) : (
                          (() => {
                            const awaitingSupervisorReview =
                              report.requiresSupervisorReview && !report.supervisorReviewedAt;
                            return (
                              <>
                                {awaitingSupervisorReview && (
                                  <span className="inline-flex min-h-[48px] items-center rounded-xl border-2 border-[#141413] bg-[#FEF3C7] px-4 text-base font-extrabold text-[#92400E]">
                                    รอหัวหน้าแคร์/ผู้ประสานงานตรวจทานก่อน (DEC-04)
                                  </span>
                                )}
                                <button
                                  type="button"
                                  disabled={
                                    busyId === report.id ||
                                    report.isBlocked ||
                                    awaitingSupervisorReview
                                  }
                                  title={
                                    awaitingSupervisorReview
                                      ? 'รอหัวหน้าแคร์/ผู้ประสานงานตรวจทานก่อน (DEC-04)'
                                      : undefined
                                  }
                                  onClick={() =>
                                    runAction(
                                      report,
                                      {
                                        action: 'approve',
                                        reportId: report.id,
                                        decision: 'approve',
                                        notesOrReason: noteText || 'อนุมัติ',
                                        expectedVersion: report.version,
                                      },
                                      `อนุมัติรายงาน ${report.groupName} เรียบร้อยแล้ว`
                                    )
                                  }
                                  className="fm-btn fm-btn-lime text-base"
                                >
                                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                                  <span>อนุมัติรายงาน</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === report.id || report.isBlocked}
                                  onClick={() => {
                                    if (!noteText.trim()) {
                                      setReasonErrorId(report.id);
                                      noteInputRefs.current[report.id]?.focus();
                                      return;
                                    }
                                    void runAction(
                                      report,
                                      {
                                        action: 'approve',
                                        reportId: report.id,
                                        decision: 'request_revision',
                                        notesOrReason: noteText.trim(),
                                        expectedVersion: report.version,
                                      },
                                      `หัวหน้าบอดี้ส่งกลับ ${report.groupName} เพื่อแก้ไขแล้ว`
                                    );
                                  }}
                                  className="fm-btn bg-[#FFB703] text-base text-[#141413]"
                                >
                                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                                  <span>ส่งกลับแก้ไข</span>
                                </button>
                              </>
                            );
                          })()
                        )}
                      </>
                    )}

                    {isAdmin && report.isBlocked && (
                      <button
                        type="button"
                        disabled={busyId === report.id}
                        onClick={() =>
                          runAction(
                            report,
                            {
                              action: 'unblock',
                              reportId: report.id,
                              notes: noteText || 'ผู้ดูแลระบบตรวจสอบความพร้อมบอดี้แล้ว',
                            },
                            `ปลดล็อกรายงาน ${report.groupName} เรียบร้อยแล้ว`
                          )
                        }
                        className="fm-btn fm-btn-coral text-base"
                      >
                        <Unlock className="h-5 w-5" aria-hidden="true" />
                        <span>ปลดล็อกให้ส่งต่อได้</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenReportForGroup(report.groupId)}
                      className="fm-btn fm-btn-paper text-base"
                    >
                      <span>เปิดหน้าแบบฟอร์ม</span>
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        }))}
      </section>
    </div>
  );
}
