'use client';

import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  FileWarning,
  Flame,
  ShieldAlert,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import type { WorkspacePayload } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

export function DashboardTab({
  workspace,
  selectedPeriodId,
  onSelectPeriod,
  onNavigateTab,
  onOpenGroupReport,
}: {
  workspace: WorkspacePayload;
  selectedPeriodId: string;
  onSelectPeriod: (periodId: string) => void;
  onNavigateTab: (tab: string) => void;
  onOpenGroupReport: (groupId: string) => void;
}) {
  const { metrics, selectedPeriod, periods, bodyBreakdown } = workspace.overview;
  const submissionRate =
    metrics.expectedReports > 0
      ? Math.round((metrics.submittedReports / metrics.expectedReports) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Blocked Escalation Alert Strip (CD-07) */}
      {metrics.blockedReports > 0 && (
        <section className="fm-panel flex flex-col justify-between gap-4 bg-[#FFE4E6] p-5 text-[#881337] sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <FileWarning className="mt-1 h-7 w-7 shrink-0 text-[#BE123C]" aria-hidden="true" />
            <div>
              <h2 className="font-display text-xl font-extrabold text-[#881337]">
                พบรายงานติดปัญหาส่งต่อ จำนวน {metrics.blockedReports} กลุ่ม — ต้องให้ผู้ดูแลปลดล็อกด่วน
              </h2>
              <p className="mt-1 text-base font-medium text-[#881337]">
                กลุ่มที่ส่งรายงานแล้วแต่บอดี้ยังไม่มีหัวหน้าบอดี้ที่พร้อมอนุมัติ ถูกพักไว้ในคิวเพื่อให้ผู้ดูแลระบบตรวจสอบ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('approvals')}
            className="fm-btn fm-btn-coral shrink-0 text-base"
          >
            <span>เปิดคิวตรวจ/ปลดล็อก</span>
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </section>
      )}

      {/* First Viewport Asymmetric Bento Deck */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Hero Bento Cell: Mission Pulse & Streak (7 cols) */}
        <section className="fm-panel-ink flex min-w-0 flex-col justify-between p-5 sm:p-7 lg:col-span-7">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-[#F0F4F8] sm:text-4xl">
                สรุปผลประจำสัปดาห์ {selectedPeriod.periodKey}
              </h1>
              <span className="fm-sticker bg-[#FFB703] text-[#141413]">
                <Flame className="h-4 w-4" aria-hidden="true" />
                <span>ส่งแล้ว {submissionRate}%</span>
              </span>
            </div>

            <p className="mt-2 text-base font-medium text-[#E2E8F0]">
              รอบจันทร์ {selectedPeriod.startDate} ถึงอาทิตย์ {selectedPeriod.endDate} · ปิดรับรายงาน
              20:00 น. · ประชุมสรุป 20:30 น.
            </p>

            {/* Signature Move: Live Mission Rhythm Bar */}
            <div className="mt-6 border-y-2 border-[#27272A] py-4">
              <div className="flex items-center justify-between text-sm font-bold text-[#F0F4F8]">
                <span>ความคืบหน้าการส่งรายงานทั้งจังหวัดกาฬสินธุ์</span>
                <span className="tabular-nums font-mono text-base text-[#C8FF00]">
                  {metrics.submittedReports} / {metrics.expectedReports} กลุ่ม ({submissionRate}%)
                </span>
              </div>
              <div className="mt-2.5 h-5 w-full overflow-hidden rounded-full border-2 border-[#F0F4F8] bg-[#27272A] p-0.5">
                <div
                  className="h-full w-full origin-left rounded-full bg-[#C8FF00] transition-transform duration-300"
                  style={{ transform: `scaleX(${Math.max(0.08, submissionRate / 100)})` }}
                />
              </div>

              <div className="tabular-nums mt-4 grid grid-cols-3 gap-3 pt-2 text-left">
                <div className="border-r border-[#27272A] pr-2">
                  <div className="font-mono text-2xl font-extrabold text-[#C8FF00]">
                    {metrics.activeBodies}
                  </div>
                  <div className="text-xs font-bold text-[#E2E8F0]">บอดี้ใช้งาน</div>
                </div>
                <div className="border-r border-[#27272A] pr-2">
                  <div className="font-mono text-2xl font-extrabold text-[#F0F4F8]">
                    {metrics.heldMeetings}
                  </div>
                  <div className="text-xs font-bold text-[#E2E8F0]">
                    จัดประชุม (งด {metrics.confirmedNotHeld})
                  </div>
                </div>
                <div>
                  <div className="font-mono text-2xl font-extrabold text-[#FFB703]">
                    {metrics.openFollowUps}
                  </div>
                  <div className="text-xs font-bold text-[#E2E8F0]">งานเยี่ยมติดตามเปิดอยู่</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => onNavigateTab('report')}
                className="fm-btn fm-btn-lime text-base"
              >
                <Sparkles className="h-5 w-5" aria-hidden="true" />
                <span>+ ส่งรายงานสัปดาห์นี้ทันที</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('brief')}
                className="fm-btn border-[#F0F4F8] bg-[#27272A] text-sm text-[#F0F4F8] hover:bg-[#1D4ED8]"
              >
                <span>เปิดสรุปประชุม 20:30</span>
              </button>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <select
                aria-label="เลือกรอบสัปดาห์"
                value={selectedPeriodId}
                onChange={(e) => onSelectPeriod(e.target.value)}
                className="min-h-[48px] w-full max-w-full rounded-xl border-2 border-[#F0F4F8] bg-[#27272A] px-3 py-2 text-sm font-bold text-[#F0F4F8] sm:w-auto"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#141413] text-[#F0F4F8]">
                    {p.periodKey} ({p.startDate} – {p.endDate}) [{p.status}]
                  </option>
                ))}
              </select>

              <a
                href={`/api/v1/insights?export=reports&periodId=${selectedPeriod.id}`}
                className="fm-btn fm-btn-paper text-sm"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>CSV รายงาน</span>
              </a>
            </div>
          </div>
        </section>

        {/* Right 2x2 Tactile KPI Matrix (5 cols) */}
        <section
          aria-label="ตัวชี้วัดหลักประจำสัปดาห์"
          className="fm-panel grid min-w-0 grid-cols-1 divide-y-2 divide-[#141413] overflow-hidden sm:grid-cols-2 sm:divide-y-0 lg:col-span-5"
        >
          <div className="flex flex-col justify-between border-b-2 border-[#141413] bg-[#C8FF00] p-5 sm:border-r-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-extrabold text-[#141413]">
                รายงานที่ส่งแล้ว
              </h2>
              <CheckCircle2 className="h-5 w-5 text-[#141413]" aria-hidden="true" />
            </div>
            <div className="tabular-nums my-3 font-mono text-4xl font-extrabold text-[#141413]">
              {metrics.submittedReports}/{metrics.expectedReports}
            </div>
            <p className="text-sm font-bold text-[#141413]">
              กลุ่มพันธกิจใช้งานทั้งหมด {metrics.activeGroups} กลุ่ม
            </p>
          </div>

          <div className="flex flex-col justify-between border-b-2 border-[#141413] bg-[#FEF3C7] p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-extrabold text-[#141413]">
                ค้างส่ง / ร่างส่วนตัว
              </h2>
              <Clock className="h-5 w-5 text-[#141413]" aria-hidden="true" />
            </div>
            <div className="tabular-nums my-3 font-mono text-4xl font-extrabold text-[#141413]">
              {metrics.missingReports}
            </div>
            <p className="text-sm font-bold text-[#27272A]">
              ส่งหลังกำหนด 20:00 น. {metrics.lateReports} กลุ่ม
            </p>
          </div>

          <div className="flex flex-col justify-between bg-[#DBEAFE] p-5 sm:border-r-2 sm:border-[#141413]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-extrabold text-[#141413]">
                ผู้เข้าร่วมสัปดาห์นี้
              </h2>
              <Users className="h-5 w-5 text-[#141413]" aria-hidden="true" />
            </div>
            <div className="tabular-nums my-3 font-mono text-4xl font-extrabold text-[#141413]">
              {metrics.periodAttendance}
            </div>
            <p className="text-sm font-bold text-[#141413]">
              ผู้เยี่ยมใหม่ {metrics.newVisitors} · กลับมาเยี่ยม {metrics.returningVisitors}
            </p>
          </div>

          <div
            className={`flex flex-col justify-between p-5 ${
              metrics.blockedReports > 0 ? 'bg-[#FFE4E6]' : 'bg-[#FFFFFF]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-extrabold text-[#141413]">
                ติดปัญหาส่งต่อ
              </h2>
              {metrics.blockedReports > 0 ? (
                <ShieldAlert className="h-5 w-5 text-[#BE123C]" aria-hidden="true" />
              ) : (
                <UserPlus className="h-5 w-5 text-[#141413]" aria-hidden="true" />
              )}
            </div>
            <div className="tabular-nums my-3 font-mono text-4xl font-extrabold text-[#141413]">
              {metrics.blockedReports}
            </div>
            <p className="text-sm font-bold text-[#27272A]">
              {metrics.blockedReports > 0
                ? 'รอผู้ดูแลระบบตรวจสอบและปลดล็อก'
                : 'เส้นทางอนุมัติปกติครบทุกบอดี้'}
            </p>
          </div>
        </section>
      </div>

      {/* Live Group Rhythm Radar + Body Breakdown Ledger */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Body Breakdown Ledger (7 cols) */}
        <section className="fm-panel min-w-0 overflow-hidden lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#141413] bg-[#E2E8F0] px-6 py-4">
            <h2 className="font-display text-2xl font-extrabold text-[#141413]">
              สรุปยอดแยกตามสายงานบอดี้
            </h2>
            <a
              href="/api/v1/insights?export=visitors"
              className="fm-btn fm-btn-paper min-h-[48px] px-3.5 py-1.5 text-sm"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>ส่งออก CSV ผู้เยี่ยม</span>
            </a>
          </div>

          {/* Mobile Stacked Cards (prevents horizontal table truncation on 390px screens) */}
          <div className="divide-y-2 divide-[#141413] md:hidden">
            {bodyBreakdown.map((b) => (
              <div key={b.bodyId} className="space-y-3 bg-[var(--fm-paper)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-extrabold text-[#141413]">{b.bodyName}</span>
                  <span className="rounded-md border border-[#141413] bg-[#E2E8F0] px-2 py-0.5 font-mono text-xs font-bold text-[#141413]">
                    {b.bodyCode}
                  </span>
                </div>
                <div className="tabular-nums grid grid-cols-5 gap-2 text-center font-mono text-sm">
                  <div className="rounded-lg border border-[#141413] bg-[var(--fm-canvas)] p-2">
                    <div className="text-[11px] font-bold">ทั้งหมด</div>
                    <div className="font-extrabold">{b.expectedReports}</div>
                  </div>
                  <div className="rounded-lg border border-[#141413] bg-[var(--fm-canvas)] p-2">
                    <div className="text-[11px] font-bold">ส่งแล้ว</div>
                    <div className="font-extrabold text-[#1D4ED8]">{b.submittedReports}</div>
                  </div>
                  <div className="rounded-lg border border-[#141413] bg-[var(--fm-canvas)] p-2">
                    <div className="text-[11px] font-bold">อนุมัติ</div>
                    <div className="font-extrabold text-[#047857]">{b.approvedReports}</div>
                  </div>
                  <div className="rounded-lg border border-[#141413] bg-[var(--fm-canvas)] p-2">
                    <div className="text-[11px] font-bold">ติดขัด</div>
                    <div className="font-extrabold text-[#BE123C]">{b.blockedReports}</div>
                  </div>
                  <div className="rounded-lg border border-[#141413] bg-[#C8FF00] p-2">
                    <div className="text-[11px] font-bold">คนรวม</div>
                    <div className="font-extrabold text-[#141413]">{b.attendance}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[580px] border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-[#141413] bg-[#F0F4F8] text-sm font-extrabold text-[#141413]">
                  <th className="py-3.5 pl-6 pr-4">บอดี้พันธกิจ</th>
                  <th className="px-3 py-3.5 text-right">ทั้งหมด</th>
                  <th className="px-3 py-3.5 text-right">ส่งแล้ว</th>
                  <th className="px-3 py-3.5 text-right">อนุมัติ</th>
                  <th className="px-3 py-3.5 text-right">ติดขัด</th>
                  <th className="py-3.5 pl-3 pr-6 text-right">ผู้เข้าร่วม</th>
                </tr>
              </thead>
              <tbody className="tabular-nums divide-y-2 divide-[#141413] text-base">
                {bodyBreakdown.map((b) => (
                  <tr key={b.bodyId} className="bg-white transition hover:bg-[#F0F4F8]">
                    <td className="py-4 pl-6 pr-4 font-extrabold text-[#141413]">
                      {b.bodyName}
                      <span className="ml-2 rounded-md border border-[#141413] bg-[#E2E8F0] px-2 py-0.5 font-mono text-xs font-bold text-[#141413]">
                        {b.bodyCode}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-right font-mono font-bold">
                      {b.expectedReports}
                    </td>
                    <td className="px-3 py-4 text-right font-mono font-extrabold text-[#1D4ED8]">
                      {b.submittedReports}
                    </td>
                    <td className="px-3 py-4 text-right font-mono font-extrabold text-[#047857]">
                      {b.approvedReports}
                    </td>
                    <td className="px-3 py-4 text-right font-mono font-extrabold text-[#BE123C]">
                      {b.blockedReports}
                    </td>
                    <td className="py-4 pl-3 pr-6 text-right font-mono text-lg font-extrabold text-[#141413]">
                      {b.attendance}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Live Group Feed Strip (5 cols) */}
        <section className="fm-panel min-w-0 overflow-hidden lg:col-span-5">
          <div className="flex items-center justify-between gap-2 border-b-2 border-[#141413] bg-[#C8FF00] px-6 py-4">
            <h2 className="font-display text-2xl font-extrabold text-[#141413]">
              รายชื่อกลุ่มบ้านทั้งหมด ({workspace.groups.length})
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTab('map')}
              className="fm-btn fm-btn-paper min-h-[48px] px-3.5 py-1.5 text-xs"
            >
              ดูแผนที่
            </button>
          </div>

          <div className="divide-y-2 divide-[#141413]">
            {workspace.groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onOpenGroupReport(g.id)}
                className="flex w-full flex-wrap items-center justify-between gap-3 bg-[var(--fm-paper)] px-6 py-4 text-left transition-colors hover:bg-[#F0F4F8]"
              >
                <div>
                  <div className="text-base font-extrabold text-[#141413]">{g.nameTh}</div>
                  <div className="text-sm font-medium text-[#27272A]">
                    อ.{g.district} · {g.bodyName}
                  </div>
                </div>
                <StatusBadge
                  status={g.currentReport.status}
                  isBlocked={g.currentReport.isBlocked}
                  isLate={g.currentReport.isLate}
                />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
