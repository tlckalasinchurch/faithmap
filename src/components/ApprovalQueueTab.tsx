'use client';

import { useState } from 'react';
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
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-2xl font-bold text-slate-900">
          คิวตรวจทานและอนุมัติรายงาน ({workspace.overview.selectedPeriod.periodKey})
        </h2>
        <p className="mt-1 text-base text-slate-600">
          บังคับใช้ลำดับการตรวจทานจากหัวหน้าแคร์/ผู้ประสานงานก่อนอนุมัติ (DEC-04), ห้ามผู้ส่งอนุมัติตนเอง (DEC-05) และปิดซ่อนฉบับร่างส่วนตัว (FR-07.5)
        </p>
      </div>

      {banner && (
        <div
          role="alert"
          className={`rounded-xl border p-4 text-base font-semibold ${
            banner.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
              : 'border-rose-300 bg-rose-50 text-rose-950'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="space-y-4">
        {workspace.reports.map((report) => {
          const canReview =
            supervisorGroups.has(report.groupId) &&
            !report.isDraftHidden &&
            !report.isBlocked &&
            ['submitted', 'under_review'].includes(report.status);
          const isSelfSubmitter = report.submittedByUserId === actor.user.id;
          const canApproveRole =
            bodyLeaderBodies.has(report.bodyId) &&
            !report.isDraftHidden &&
            ['submitted', 'under_review'].includes(report.status);

          const noteText = notesById[report.id] ?? '';

          return (
            <div
              key={report.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-bold text-slate-900">
                      {report.groupName}
                    </h3>
                    <span className="text-sm text-slate-500">({report.bodyName})</span>
                  </div>
                  <div className="mt-2">
                    <StatusBadge
                      status={report.status}
                      isBlocked={report.isBlocked}
                      isLate={report.isLate}
                    />
                  </div>
                </div>

                <div className="text-sm text-slate-600 sm:text-right">
                  {report.requiresSupervisorReview ? (
                    <span className="inline-block rounded-lg bg-slate-100 px-2.5 py-1 font-medium">
                      เส้นทาง: หัวหน้ากลุ่ม → ผู้ตรวจทาน (แคร์/ประสานงาน) → หัวหน้าบอดี้
                    </span>
                  ) : (
                    <span className="inline-block rounded-lg bg-teal-50 px-2.5 py-1 font-medium text-teal-900">
                      เส้นทางตรง (CD-03): ไม่มีผู้ตรวจทาน → หัวหน้าบอดี้อนุมัติได้ทันที
                    </span>
                  )}
                </div>
              </div>

              {report.isDraftHidden ? (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-base text-slate-700">
                  <EyeOff className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
                  <span>
                    ผู้นำกลุ่มกำลังแก้ไขฉบับร่างส่วนตัว ข้อมูลรายละเอียดถูกปกปิดจนกว่าจะกดส่งรายงาน (FR-07.5)
                  </span>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="tabular-nums grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-base sm:grid-cols-4">
                    <div>
                      <span className="text-xs text-slate-500">สถานะประชุม</span>
                      <div className="font-bold">
                        {report.meetingHeld ? 'จัดประชุม' : 'งดประชุม'}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">ผู้เข้าร่วมรวม</span>
                      <div className="font-bold">{report.totalAttendees} คน</div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">ผู้เยี่ยมใหม่</span>
                      <div className="font-bold">{report.newVisitorsCount} คน</div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">ผู้ส่งรายงาน</span>
                      <div className="font-semibold">{report.submittedByName ?? '-'}</div>
                    </div>
                  </div>

                  {report.summaryNotes && (
                    <p className="text-base text-slate-700">
                      <strong>สรุปกลุ่ม:</strong> {report.summaryNotes}
                    </p>
                  )}
                  {report.prayerRequests && (
                    <p className="text-base text-slate-700">
                      <strong>คำอธิษฐาน:</strong> {report.prayerRequests}
                    </p>
                  )}
                  {report.revisionReason && (
                    <p className="rounded-lg bg-amber-50 p-3 text-base text-amber-900">
                      <strong>เหตุผลส่งกลับแก้ไข:</strong> {report.revisionReason}
                    </p>
                  )}
                  {report.isBlocked && (
                    <div className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-base text-rose-950">
                      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden="true" />
                      <div>
                        <strong>ติดขัด (Blocked):</strong> {report.blockedReason} — ต้องแก้ปัญหาผู้นำบอดี้ก่อนปลดล็อก (CD-07)
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(canReview || canApproveRole || (isAdmin && report.isBlocked)) && (
                <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) =>
                      setNotesById((prev) => ({ ...prev, [report.id]: e.target.value }))
                    }
                    placeholder="หมายเหตุการตรวจทาน / เหตุผลในการส่งกลับขอแก้ไข..."
                    className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3 text-base"
                  />

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
                          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2 text-base font-bold text-white hover:bg-indigo-800 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                          <span>ผ่านการตรวจทาน → ส่งต่อหัวหน้าบอดี้</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === report.id}
                          onClick={() =>
                            runAction(
                              report,
                              {
                                action: 'review',
                                reportId: report.id,
                                decision: 'request_revision',
                                notesOrReason: noteText,
                                expectedVersion: report.version,
                              },
                              `ส่งกลับรายงาน ${report.groupName} ให้ผู้นำกลุ่มแก้ไขแล้ว`
                            )
                          }
                          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-amber-600 bg-amber-50 px-4 py-2 text-base font-bold text-amber-950 hover:bg-amber-100"
                        >
                          <RotateCcw className="h-5 w-5" aria-hidden="true" />
                          <span>ส่งกลับขอแก้ไข</span>
                        </button>
                      </>
                    )}

                    {canApproveRole && (
                      <>
                        {isSelfSubmitter ? (
                          <span className="inline-flex min-h-[48px] items-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-900">
                            คุณเป็นผู้ส่งรายงานนี้ จึงไม่อนุญาตให้อนุมัติรายงานตนเอง (DEC-05)
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busyId === report.id || report.isBlocked}
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
                              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-teal-700 px-5 py-2 text-base font-bold text-white hover:bg-teal-800 disabled:opacity-50"
                            >
                              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                              <span>อนุมัติรายงาน</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyId === report.id || report.isBlocked}
                              onClick={() =>
                                runAction(
                                  report,
                                  {
                                    action: 'approve',
                                    reportId: report.id,
                                    decision: 'request_revision',
                                    notesOrReason: noteText,
                                    expectedVersion: report.version,
                                  },
                                  `หัวหน้าบอดี้ส่งกลับ ${report.groupName} เพื่อแก้ไขแล้ว`
                                )
                              }
                              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-amber-600 bg-amber-50 px-4 py-2 text-base font-bold text-amber-950 hover:bg-amber-100"
                            >
                              <RotateCcw className="h-5 w-5" aria-hidden="true" />
                              <span>ส่งกลับแก้ไข</span>
                            </button>
                          </>
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
                        className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-rose-700 px-5 py-2 text-base font-bold text-white hover:bg-rose-800"
                      >
                        <Unlock className="h-5 w-5" aria-hidden="true" />
                        <span>ปลดล็อกรายงาน (Admin Unblock CD-07)</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenReportForGroup(report.groupId)}
                      className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-base font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      ดูหน้าแบบฟอร์ม
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
