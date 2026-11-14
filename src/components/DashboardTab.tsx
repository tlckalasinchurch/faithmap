'use client';

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileWarning,
  ShieldAlert,
  UserPlus,
  Users,
} from 'lucide-react';
import type { WorkspacePayload } from '@/lib/types';

export function DashboardTab({
  workspace,
  selectedPeriodId,
  onSelectPeriod,
  onNavigateTab,
}: {
  workspace: WorkspacePayload;
  selectedPeriodId: string;
  onSelectPeriod: (periodId: string) => void;
  onNavigateTab: (tab: string) => void;
}) {
  const { metrics, selectedPeriod, periods, bodyBreakdown } = workspace.overview;

  const cards = [
    {
      label: 'รายงานที่ส่งแล้ว',
      value: `${metrics.submittedReports} / ${metrics.expectedReports}`,
      sub: `บอดี้ใช้งาน ${metrics.activeBodies} · กลุ่มใช้งาน ${metrics.activeGroups}`,
      tone: 'border-teal-200 bg-teal-50 text-teal-900',
      Icon: CheckCircle2,
    },
    {
      label: 'ยังไม่ส่งรายงาน (รวมฉบับร่าง)',
      value: String(metrics.missingReports),
      sub: `ส่งหลังกำหนด 20:00 น. ${metrics.lateReports} กลุ่ม`,
      tone:
        metrics.missingReports > 0
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-slate-200 bg-white text-slate-900',
      Icon: Clock,
    },
    {
      label: 'ยอดผู้เข้าร่วมสัปดาห์นี้',
      value: String(metrics.periodAttendance),
      sub: `จัดประชุม ${metrics.heldMeetings} กลุ่ม · งด ${metrics.confirmedNotHeld} กลุ่ม`,
      tone: 'border-slate-200 bg-white text-slate-900',
      Icon: Users,
    },
    {
      label: 'ผู้เยี่ยมใหม่ / กลับมาเยี่ยม',
      value: `${metrics.newVisitors} / ${metrics.returningVisitors}`,
      sub: `งานติดตามเปิดอยู่ ${metrics.openFollowUps} รายการ`,
      tone: 'border-slate-200 bg-white text-slate-900',
      Icon: UserPlus,
    },
    {
      label: 'รายงานติดขัด (Blocked)',
      value: String(metrics.blockedReports),
      sub:
        metrics.blockedReports > 0
          ? 'ต้องรอผู้ดูแลระบบตรวจสอบ/ปลดล็อก (CD-07)'
          : 'ไม่มีรายการติดขัดในรอบนี้',
      tone:
        metrics.blockedReports > 0
          ? 'border-rose-300 bg-rose-50 text-rose-900'
          : 'border-slate-200 bg-white text-slate-900',
      Icon: ShieldAlert,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-teal-800">
            <Activity className="h-4 w-4" aria-hidden="true" />
            <span>รอบรายงานจันทร์–อาทิตย์ (เวลาประเทศไทย DEC-01, DEC-02)</span>
          </div>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            สัปดาห์ {selectedPeriod.periodKey} ({selectedPeriod.startDate} ถึง{' '}
            {selectedPeriod.endDate})
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            กำหนดส่งวันอาทิตย์ 20:00 น. · สรุปประชุมผู้บริหารวันอาทิตย์ 20:30 น.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="เลือกรอบสัปดาห์"
            value={selectedPeriodId}
            onChange={(e) => onSelectPeriod(e.target.value)}
            className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-base font-medium text-slate-900 focus:border-teal-700 focus:outline-none"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.periodKey} ({p.startDate} – {p.endDate}) [{p.status}]
              </option>
            ))}
          </select>

          <a
            href={`/api/v1/insights?export=reports&periodId=${selectedPeriod.id}`}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-base font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>ส่งออก CSV รายงาน</span>
          </a>
        </div>
      </div>

      {metrics.blockedReports > 0 && (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-950 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <FileWarning className="mt-0.5 h-6 w-6 shrink-0 text-rose-700" aria-hidden="true" />
            <div>
              <p className="text-base font-bold">
                พบรายงานที่ติดขัด (Blocked) จำนวน {metrics.blockedReports} กลุ่ม
              </p>
              <p className="text-sm text-rose-800">
                รายงานที่ส่งแล้วแต่บอดี้ยังไม่มีหัวหน้าบอดี้อนุมัติได้จะถูกกันไว้เพื่อให้ผู้ดูแลระบบแก้ไข
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('approvals')}
            className="min-h-[48px] shrink-0 rounded-xl bg-rose-700 px-4 py-2 text-base font-semibold text-white transition hover:bg-rose-800"
          >
            ตรวจสอบคิวอนุมัติ / ปลดล็อก
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.Icon;
          return (
            <div
              key={card.label}
              className={`rounded-2xl border p-5 shadow-sm ${card.tone}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold opacity-90">{card.label}</span>
                <Icon className="h-5 w-5 opacity-80" aria-hidden="true" />
              </div>
              <div className="tabular-nums mt-3 text-3xl font-bold">{card.value}</div>
              <p className="mt-1.5 text-sm opacity-85">{card.sub}</p>
            </div>
          );
        })}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-slate-800">ดัชนี 13 ตัวชี้วัดหลัก</span>
            <AlertCircle className="h-5 w-5 text-teal-700" aria-hidden="true" />
          </div>
          <dl className="tabular-nums mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-700">
            <div>บอดี้ใช้งาน: {metrics.activeBodies}</div>
            <div>กลุ่มใช้งาน: {metrics.activeGroups}</div>
            <div>จัดประชุม: {metrics.heldMeetings}</div>
            <div>งดประชุมยืนยัน: {metrics.confirmedNotHeld}</div>
            <div>ส่งช้า: {metrics.lateReports}</div>
            <div>ผู้เยี่ยมรวม: {metrics.newVisitors + metrics.returningVisitors}</div>
          </dl>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xl font-bold text-slate-900">สรุปรายบอดี้ (ตามสิทธิ์ของคุณ)</h3>
          <a
            href="/api/v1/insights?export=visitors"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>ส่งออก CSV ผู้เยี่ยม</span>
          </a>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 text-sm font-semibold text-slate-600">
                <th className="py-3 pr-4">บอดี้</th>
                <th className="py-3 px-3 text-right">คาดหวัง</th>
                <th className="py-3 px-3 text-right">ส่งแล้ว</th>
                <th className="py-3 px-3 text-right">อนุมัติแล้ว</th>
                <th className="py-3 px-3 text-right">ติดขัด</th>
                <th className="py-3 pl-3 text-right">ผู้เข้าร่วม</th>
              </tr>
            </thead>
            <tbody className="tabular-nums divide-y divide-slate-100 text-base">
              {bodyBreakdown.map((b) => (
                <tr key={b.bodyId} className="hover:bg-slate-50">
                  <td className="py-3.5 pr-4 font-semibold text-slate-900">
                    {b.bodyName}
                    <span className="ml-2 text-xs font-normal text-slate-500">{b.bodyCode}</span>
                  </td>
                  <td className="py-3.5 px-3 text-right">{b.expectedReports}</td>
                  <td className="py-3.5 px-3 text-right font-semibold text-teal-800">
                    {b.submittedReports}
                  </td>
                  <td className="py-3.5 px-3 text-right text-emerald-700">
                    {b.approvedReports}
                  </td>
                  <td className="py-3.5 px-3 text-right font-semibold text-rose-700">
                    {b.blockedReports}
                  </td>
                  <td className="py-3.5 pl-3 text-right font-bold">{b.attendance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
