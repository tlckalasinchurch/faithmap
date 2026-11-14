'use client';

import { useState } from 'react';
import { CalendarCheck2, FileText, Lock, Sparkles } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { WorkspacePayload } from '@/lib/types';

export function MeetingBriefTab({
  workspace,
  onRefresh,
}: {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
}) {
  const [selectedBriefId, setSelectedBriefId] = useState<string>(
    workspace.briefs[0]?.id ?? ''
  );
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const brief =
    workspace.briefs.find((b) => b.id === selectedBriefId) || workspace.briefs[0];
  const canGenerate =
    workspace.actor.user.systemRole === 'admin' ||
    workspace.actor.user.systemRole === 'super_admin' ||
    workspace.actor.user.systemRole === 'mission_leader' ||
    workspace.actor.bodyLeaderBodyIds.length > 0;

  async function handleGenerateCurrentBrief() {
    setGenerating(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ brief: { id: string } }>('/api/v1/insights', {
        method: 'POST',
        body: {
          action: 'generate_brief',
          periodId: workspace.overview.selectedPeriod.id,
        },
      });
      setSelectedBriefId(res.brief.id);
      setFeedback('สร้างสรุปประชุมผู้บริหาร (Immutable Snapshot) เรียบร้อยแล้ว');
      await onRefresh();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'ไม่สามารถสร้างสรุปประชุมได้');
    } finally {
      setGenerating(false);
    }
  }

  const s = (brief?.sectionsJson ?? {}) as Record<string, unknown>;
  const subHealth = (s.section2SubmissionHealth ?? {}) as Record<string, number>;
  const attTrend = (s.section3AttendanceTrend ?? {}) as Record<string, number>;
  const bodyRows = Array.isArray(s.section4BodyBreakdown)
    ? (s.section4BodyBreakdown as Array<Record<string, unknown>>)
    : [];
  const lateMissing = Array.isArray(s.section5LateAndMissingGroups)
    ? (s.section5LateAndMissingGroups as string[])
    : [];
  const blockedList = Array.isArray(s.section6BlockedAndEscalations)
    ? (s.section6BlockedAndEscalations as string[])
    : [];
  const visitorSummary = (s.section7NewVisitorsSummary ?? {}) as Record<string, number>;
  const openFollowUps = Array.isArray(s.section8OpenFollowUps)
    ? (s.section8OpenFollowUps as string[])
    : [];
  const prayerThemes = Array.isArray(s.section9PrayerAndCareThemes)
    ? (s.section9PrayerAndCareThemes as string[])
    : [];
  const actionDecisions = Array.isArray(s.section10ActionDecisions)
    ? (s.section10ActionDecisions as string[])
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-teal-800">
            <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
            <span>สรุปประชุมผู้บริหารทุกวันอาทิตย์ 20:30 น. (DEC-01)</span>
          </div>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            รายงานสรุป 10 หัวข้อสำหรับผู้นำและศิษยาภิบาล
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {workspace.briefs.length > 0 && (
            <select
              aria-label="เลือกฉบับสรุปประชุม"
              value={brief?.id ?? ''}
              onChange={(e) => setSelectedBriefId(e.target.value)}
              className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-base font-medium text-slate-900"
            >
              {workspace.briefs.map((b) => (
                <option key={b.id} value={b.id}>
                  สัปดาห์ {b.periodKey} ({b.startDate})
                </option>
              ))}
            </select>
          )}

          {canGenerate && (
            <button
              type="button"
              disabled={generating}
              onClick={handleGenerateCurrentBrief}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-base font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>
                {generating
                  ? 'กำลังบันทึก...'
                  : `สร้างสรุปสัปดาห์ ${workspace.overview.selectedPeriod.periodKey}`}
              </span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-base font-medium text-teal-900">
          {feedback}
        </div>
      )}

      {!brief ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-lg text-slate-600">
          <FileText className="mx-auto mb-3 h-10 w-10 text-slate-400" aria-hidden="true" />
          <p>ยังไม่มีเอกสารสรุปประชุมสำหรับบทบาทของคุณหรือรอบที่เลือก</p>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-xl font-bold text-slate-900">
                1. ภาพรวม: {String(s.section1Overview ?? brief.periodKey)}
              </h3>
              <p className="text-sm text-slate-600">
                สร้างเมื่อ {new Date(brief.generatedAt).toLocaleString('th-TH')}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-900">
              <Lock className="h-4 w-4" aria-hidden="true" />
              <span>บันทึกถาวรแก้ไขไม่ได้ (Immutable Snapshot)</span>
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-base font-bold text-slate-900">2. สถานะการส่งรายงาน</h4>
              <p className="tabular-nums mt-2 text-base text-slate-700">
                คาดหวัง {subHealth.expected ?? 0} · ส่งแล้ว {subHealth.submitted ?? 0} · อนุมัติแล้ว{' '}
                {subHealth.approved ?? 0} · ค้างส่ง {subHealth.missing ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-base font-bold text-slate-900">3. สถิติผู้เข้าร่วมประจำสัปดาห์</h4>
              <p className="tabular-nums mt-2 text-base text-slate-700">
                ผู้เข้าร่วมรวม {attTrend.periodAttendance ?? 0} ท่าน · ผู้เยี่ยมใหม่{' '}
                {attTrend.newVisitors ?? 0} · กลับมาเยี่ยม {attTrend.returningVisitors ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
              <h4 className="text-base font-bold text-slate-900">4. สรุปแยกตามบอดี้</h4>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {bodyRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  >
                    <span className="font-semibold">{String(row.bodyName)}</span>: กลุ่ม{' '}
                    {String(row.activeGroups)} · อนุมัติ {String(row.approved)} · ผู้เข้าร่วม{' '}
                    {String(row.attendance)}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-base font-bold text-slate-900">5. กลุ่มที่ส่งช้าหรือยังไม่ส่ง</h4>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                {lateMissing.length > 0 ? (
                  lateMissing.map((item, i) => <li key={i}>{item}</li>)
                ) : (
                  <li>ส่งครบตรงเวลาทุกกลุ่ม</li>
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-base font-bold text-slate-900">6. รายการติดขัด / Escalation</h4>
              <ul className="mt-2 list-disc pl-5 text-sm text-rose-800">
                {blockedList.length > 0 ? (
                  blockedList.map((item, i) => <li key={i}>{item}</li>)
                ) : (
                  <li className="text-slate-700">ไม่มีรายการติดขัด</li>
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-base font-bold text-slate-900">7. สรุปผู้เยี่ยมใหม่</h4>
              <p className="mt-2 text-sm text-slate-700">
                ผู้เยี่ยมใหม่ {visitorSummary.totalNewVisitors ?? 0} ท่าน · กลับมาเยี่ยม{' '}
                {visitorSummary.returningVisitors ?? 0} ท่าน (ปฏิบัติตาม DEC-06 ไม่เปิดเผย PII รายบุคคล)
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-base font-bold text-slate-900">8. งานเยี่ยมติดตามที่เปิดอยู่</h4>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                {openFollowUps.length > 0 ? (
                  openFollowUps.map((f, i) => <li key={i}>{f}</li>)
                ) : (
                  <li>ไม่มีรายการติดตามค้าง</li>
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-base font-bold text-slate-900">9. หัวข้ออธิษฐานและการอภิบาล</h4>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                {prayerThemes.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
              <h4 className="text-base font-bold text-teal-950">10. ข้อเสนอเพื่อการตัดสินใจ</h4>
              <ul className="mt-2 list-disc pl-5 text-sm font-medium text-teal-900">
                {actionDecisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
