'use client';

import { useState } from 'react';
import { Check, Copy, FileText, Lock, Sparkles } from 'lucide-react';
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
  const [copied, setCopied] = useState(false);

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

  async function handleCopySummary() {
    if (!brief) return;
    const text = [
      `⚡ สรุปประชุมผู้นำพันธกิจบ้าน จ.กาฬสินธุ์ (${brief.periodKey})`,
      `• ส่งรายงาน: ${subHealth.submitted ?? 0}/${subHealth.expected ?? 0} (อนุมัติ ${subHealth.approved ?? 0})`,
      `• ผู้เข้าร่วมรวม: ${attTrend.periodAttendance ?? 0} ท่าน (ผู้เยี่ยมใหม่ ${attTrend.newVisitors ?? 0})`,
      `• ข้อเสนอตัดสินใจ: ${actionDecisions.join(' | ') || '-'}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFeedback('คัดลอกข้อความไม่สำเร็จ');
    }
  }

  return (
    <div className="space-y-6">
      <section className="fm-panel-ink flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-[#F0F4F8]">
            สรุปประชุมผู้นำวันอาทิตย์ 20:30 น. (10 หัวข้อ)
          </h1>
          <p className="mt-1.5 text-base font-medium text-[#E2E8F0]">
            บันทึกสรุปประจำสัปดาห์สำหรับผู้นำและศิษยาภิบาล (ซ่อนข้อมูลส่วนตัวรายบุคคล)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {workspace.briefs.length > 0 && (
            <select
              aria-label="เลือกฉบับสรุปประชุม"
              value={brief?.id ?? ''}
              onChange={(e) => setSelectedBriefId(e.target.value)}
              className="min-h-[48px] rounded-xl border-2 border-[#F0F4F8] bg-[#27272A] px-4 py-2 text-base font-bold text-[#F0F4F8]"
            >
              {workspace.briefs.map((b) => (
                <option key={b.id} value={b.id} className="bg-[#141413] text-[#F0F4F8]">
                  สัปดาห์ {b.periodKey} ({b.startDate})
                </option>
              ))}
            </select>
          )}

          {brief && (
            <button
              type="button"
              onClick={handleCopySummary}
              className="fm-btn fm-btn-paper text-base"
            >
              {copied ? (
                <Check className="h-4 w-4 text-[#047857]" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{copied ? 'คัดลอกเข้า LINE แล้ว!' : 'คัดลอกส่งแชตผู้นำ'}</span>
            </button>
          )}

          {canGenerate && (
            <button
              type="button"
              disabled={generating}
              onClick={handleGenerateCurrentBrief}
              className="fm-btn fm-btn-lime text-base"
            >
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              <span>
                {generating
                  ? 'กำลังบันทึก…'
                  : `ออกรายงานสรุป ${workspace.overview.selectedPeriod.periodKey}`}
              </span>
            </button>
          )}
        </div>
      </section>

      {feedback && (
        <div className="fm-panel bg-[#C8FF00] p-4 text-base font-extrabold text-[#141413]">
          {feedback}
        </div>
      )}

      {!brief ? (
        <div className="fm-panel p-8 text-center text-lg font-bold text-[#27272A]">
          <FileText className="mx-auto mb-3 h-10 w-10 text-[#141413]" aria-hidden="true" />
          <p>ยังไม่มีเอกสารสรุปประชุมสำหรับบทบาทของคุณหรือรอบที่เลือก</p>
        </div>
      ) : (
        <section className="fm-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#141413] bg-[#E2E8F0] px-6 py-4">
            <div>
              <h2 className="font-display text-2xl font-extrabold text-[#141413]">
                หัวข้อที่ 1 · ภาพรวม: {String(s.section1Overview ?? brief.periodKey)}
              </h2>
              <p className="font-mono text-base font-bold text-[#27272A]">
                สร้างเมื่อ {new Date(brief.generatedAt).toLocaleString('th-TH')}
              </p>
            </div>
            <span className="fm-sticker bg-[#C8FF00] text-[#141413]">
              <Lock className="h-4 w-4" aria-hidden="true" />
              <span>บันทึกถาวรแล้ว</span>
            </span>
          </div>

          <p className="border-b-2 border-[#141413] bg-white px-6 py-3 text-base font-bold text-[#27272A]">
            {brief.viewScope === 'body'
              ? `ข้อมูลเฉพาะบอดี้ของคุณ${brief.viewBodyNames && brief.viewBodyNames.length > 0 ? `: ${brief.viewBodyNames.join(', ')}` : ''}`
              : brief.viewScope === 'organization_aggregate'
                ? 'ข้อมูลภาพรวมทั้งองค์กร แสดงเป็นตัวเลข ไม่แสดงชื่อกลุ่มหรือข้อความจากรายงาน'
                : 'ข้อมูลทั้งองค์กร'}
          </p>
          {brief.viewScope === 'body' && Object.keys(s).length <= 1 ? (
            <p className="p-6 text-base font-bold text-[#27272A]">
              สรุปฉบับนี้สร้างก่อนระบบแยกข้อมูลตามบอดี้ จึงยังไม่แสดงตัวเลขของบอดี้คุณ กรุณาติดต่อผู้ดูแลระบบ
            </p>
          ) : (
          <div className="grid divide-y-2 divide-[#141413] md:grid-cols-2 md:divide-y-0">
            <div className="border-b-2 border-[#141413] bg-white p-5 md:border-r-2">
              <h3 className="font-display text-lg font-extrabold text-[#141413]">
                หัวข้อที่ 2 · ภาพรวมการส่งรายงาน
              </h3>
              <p className="tabular-nums mt-2 font-mono text-base font-bold text-[#27272A]">
                ต้องส่ง {subHealth.expected ?? 0} · ส่งแล้ว {subHealth.submitted ?? 0} · อนุมัติแล้ว{' '}
                {subHealth.approved ?? 0} · ค้างส่ง {subHealth.missing ?? 0}
              </p>
            </div>

            <div className="border-b-2 border-[#141413] bg-[#DBEAFE] p-5">
              <h3 className="font-display text-lg font-extrabold text-[#141413]">
                หัวข้อที่ 3 · สถิติผู้เข้าร่วมประจำสัปดาห์
              </h3>
              <p className="tabular-nums mt-2 font-mono text-base font-bold text-[#141413]">
                ผู้เข้าร่วมรวม {attTrend.periodAttendance ?? 0} ท่าน · ผู้เยี่ยมใหม่{' '}
                {attTrend.newVisitors ?? 0} · กลับมาเยี่ยม {attTrend.returningVisitors ?? 0}
              </p>
            </div>

            <div className="border-b-2 border-[#141413] bg-[#F0F4F8] p-5 md:col-span-2">
              <h3 className="font-display text-lg font-extrabold text-[#141413]">
                หัวข้อที่ 4 · สรุปแยกตามบอดี้พันธกิจ
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {bodyRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border-2 border-[#141413] bg-white px-4 py-3 text-base font-bold text-[#141413]"
                  >
                    <span className="font-extrabold">{String(row.bodyName)}</span>: กลุ่ม{' '}
                    {String(row.activeGroups)} · อนุมัติ {String(row.approved)} · ผู้เข้าร่วม{' '}
                    {String(row.attendance)}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-b-2 border-[#141413] bg-white p-5 md:border-r-2">
              <h3 className="font-display text-lg font-extrabold text-[#141413]">
                หัวข้อที่ 5 · กลุ่มที่ส่งช้าหรือยังไม่ส่ง
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-base font-medium text-[#27272A]">
                {lateMissing.length > 0 ? (
                  lateMissing.map((item, i) => <li key={i}>{item}</li>)
                ) : (
                  <li>ส่งครบตรงเวลาทุกกลุ่ม</li>
                )}
              </ul>
            </div>

            <div className="border-b-2 border-[#141413] bg-[#FFE4E6] p-5">
              <h3 className="font-display text-lg font-extrabold text-[#881337]">
                หัวข้อที่ 6 · รายการติดปัญหาส่งต่อ
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-base font-bold text-[#881337]">
                {blockedList.length > 0 ? (
                  blockedList.map((item, i) => <li key={i}>{item}</li>)
                ) : (
                  <li>ไม่มีรายการติดขัด</li>
                )}
              </ul>
            </div>

            <div className="border-b-2 border-[#141413] bg-white p-5 md:border-r-2">
              <h3 className="font-display text-lg font-extrabold text-[#141413]">
                หัวข้อที่ 7 · สรุปผู้เยี่ยมใหม่
              </h3>
              <p className="mt-2 text-base font-medium text-[#27272A]">
                ผู้เยี่ยมใหม่ {visitorSummary.totalNewVisitors ?? 0} ท่าน · กลับมาเยี่ยม{' '}
                {visitorSummary.returningVisitors ?? 0} ท่าน (ไม่เปิดเผยชื่อและเบอร์โทรรายบุคคล)
              </p>
            </div>

            <div className="border-b-2 border-[#141413] bg-white p-5">
              <h3 className="font-display text-lg font-extrabold text-[#141413]">
                หัวข้อที่ 8 · งานเยี่ยมติดตามที่เปิดอยู่
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-base font-medium text-[#27272A]">
                {openFollowUps.length > 0 ? (
                  openFollowUps.map((f, i) => <li key={i}>{f}</li>)
                ) : (
                  <li>ไม่มีรายการติดตามค้าง</li>
                )}
              </ul>
            </div>

            <div className="bg-white p-5 md:border-r-2 md:border-[#141413]">
              <h3 className="font-display text-lg font-extrabold text-[#141413]">
                หัวข้อที่ 9 · หัวข้ออธิษฐานและการอภิบาล
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-base font-medium text-[#27272A]">
                {prayerThemes.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>

            <div className="bg-[#C8FF00] p-5">
              <h3 className="font-display text-lg font-extrabold text-[#141413]">
                หัวข้อที่ 10 · ข้อเสนอเพื่อการตัดสินใจในที่ประชุม
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-base font-extrabold text-[#141413]">
                {actionDecisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          </div>
          )}
        </section>
      )}
    </div>
  );
}
