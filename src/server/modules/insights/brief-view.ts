import type { ActorContext } from '../identity/service';
import { isAdmin, isGlobalMetricsReader } from '../authz/policy';
import { AppError } from '../errors';

/**
 * DEC-06 and DEC-18 (owner decision Q-9). The stored Meeting Brief is one immutable record for the whole
 * organization. Nobody edits it. The API builds a new response from it for each caller:
 *
 * - Admin: the whole record (group names, no free text).
 * - Pastor (mission_leader): organization-wide numbers only. No group names, no free text.
 * - Body Leader: numbers and group names of the Body that the person leads. Nothing of other Bodies.
 *
 * A person who has several of these roles gets the union of what each role may read.
 * Any other person gets no brief. Free text is never stored in a brief (Q-2, Q-7).
 */

export const BRIEF_SCHEMA_VERSION = 2;

/** Numbers and group names of one Body in one brief. It holds no free text. */
export interface BriefBodySlice {
  bodyId: string;
  bodyName: string;
  activeGroups: number;
  submittedReports: number;
  approvedReports: number;
  missingReports: number;
  heldMeetings: number;
  confirmedNotHeld: number;
  lateReports: number;
  blockedReports: number;
  periodAttendance: number;
  newVisitors: number;
  returningVisitors: number;
  openFollowUps: number;
  groupsWithPrayerRequests: number;
  missingGroupNames: string[];
  lateGroupNames: string[];
  blockedGroupNotes: string[];
}

export interface BriefRow {
  id: string;
  periodId: string;
  generatedAt: Date;
  generatedByJob: boolean;
  generatedByUserId: string | null;
  isImmutable: boolean;
  sectionsJson: unknown;
  metricsJson: unknown;
  [key: string]: unknown;
}

export type BriefViewScope = 'organization_detail' | 'organization_aggregate' | 'body';

type Json = Record<string, unknown>;

function asRecord(v: unknown): Json {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function readSlices(sections: Json): BriefBodySlice[] | null {
  const raw = sections.bodySlices;
  if (!Array.isArray(raw)) return null;
  return raw.map((r) => {
    const o = asRecord(r);
    const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return {
      bodyId: String(o.bodyId ?? ''),
      bodyName: String(o.bodyName ?? ''),
      activeGroups: num(o.activeGroups),
      submittedReports: num(o.submittedReports),
      approvedReports: num(o.approvedReports),
      missingReports: num(o.missingReports),
      heldMeetings: num(o.heldMeetings),
      confirmedNotHeld: num(o.confirmedNotHeld),
      lateReports: num(o.lateReports),
      blockedReports: num(o.blockedReports),
      periodAttendance: num(o.periodAttendance),
      newVisitors: num(o.newVisitors),
      returningVisitors: num(o.returningVisitors),
      openFollowUps: num(o.openFollowUps),
      groupsWithPrayerRequests: num(o.groupsWithPrayerRequests),
      missingGroupNames: strs(o.missingGroupNames),
      lateGroupNames: strs(o.lateGroupNames),
      blockedGroupNotes: strs(o.blockedGroupNotes),
    };
  });
}

const sum = (xs: BriefBodySlice[], pick: (s: BriefBodySlice) => number) => xs.reduce((a, s) => a + pick(s), 0);

export function prayerCountLine(count: number): string[] {
  return count > 0
    ? [`มี ${count} กลุ่มแจ้งหัวข้ออธิษฐานในสัปดาห์นี้ (ข้อความเป็นข้อมูลจำกัด ดูได้เฉพาะผู้ดูแลกลุ่ม หัวหน้าบอดี้ และผู้ดูแลระบบ)`]
    : ['ไม่มีกลุ่มแจ้งหัวข้ออธิษฐานในสัปดาห์นี้'];
}

export function openFollowUpCountLine(count: number): string[] {
  return count > 0 ? [`มีงานติดตามที่เปิดอยู่ ${count} รายการ (ชื่อรายการเป็นข้อมูลจำกัด)`] : ['ไม่มีรายการติดตามค้าง'];
}

export function actionDecisionLines(blocked: number, missing: number): string[] {
  return [
    ...(blocked > 0 ? [`เร่งแก้ปัญหา Blocked Workflow (${blocked} กลุ่ม) ในระดับผู้ดูแลระบบ`] : []),
    ...(missing > 0 ? [`ติดตามรายงานที่ยังไม่ส่ง ${missing} กลุ่ม`] : ['ทุกกลุ่มส่งรายงานครบถ้วน']),
  ];
}

/** Which scope the caller gets. Null means the caller may not read any brief. */
export function resolveBriefScope(actor: ActorContext): BriefViewScope | null {
  if (isAdmin(actor)) return 'organization_detail';
  if (isGlobalMetricsReader(actor)) return 'organization_aggregate';
  if (actor.bodyLeaderBodyIds.size > 0) return 'body';
  return null;
}

function metricsFromSlices(slices: BriefBodySlice[], activeBodies: number) {
  const active = sum(slices, (s) => s.activeGroups);
  return {
    activeBodies,
    activeGroups: active,
    expectedReports: active,
    submittedReports: sum(slices, (s) => s.submittedReports),
    missingReports: sum(slices, (s) => s.missingReports),
    heldMeetings: sum(slices, (s) => s.heldMeetings),
    confirmedNotHeld: sum(slices, (s) => s.confirmedNotHeld),
    lateReports: sum(slices, (s) => s.lateReports),
    blockedReports: sum(slices, (s) => s.blockedReports),
    periodAttendance: sum(slices, (s) => s.periodAttendance),
    newVisitors: sum(slices, (s) => s.newVisitors),
    returningVisitors: sum(slices, (s) => s.returningVisitors),
    openFollowUps: sum(slices, (s) => s.openFollowUps),
  };
}

/**
 * Returns a new object for the caller. The stored row is never changed.
 * Fails closed: if a body leader reads a brief without body slices (a brief made before version 2),
 * the person gets only the period name and no numbers, because the stored data cannot prove which numbers belong to the Body.
 */
export function buildMeetingBriefView<T extends BriefRow>(brief: T, actor: ActorContext) {
  const scope = resolveBriefScope(actor);
  if (!scope) {
    throw new AppError(403, 'FORBIDDEN', 'เฉพาะผู้นำบอดี้ ศิษยาภิบาล หรือผู้ดูแลระบบที่เข้าดูสรุปประชุมได้');
  }
  const stored = asRecord(brief.sectionsJson);
  const storedMetrics = asRecord(brief.metricsJson);
  const slices = readSlices(stored);
  const ownIds = actor.bodyLeaderBodyIds;

  // Section 1 is a plain title. It holds no personal data.
  const overview = stored.section1Overview;

  const base = (sections: Json, metrics: Json, viewScope: BriefViewScope, bodyNames: string[] = []) => ({
    ...brief,
    sectionsJson: { ...sections, section1Overview: overview ?? '' },
    metricsJson: metrics,
    viewScope,
    viewBodyNames: bodyNames,
  });

  // Legacy brief (no slices): the stored numbers are organization-wide.
  if (!slices) {
    const openCount = num(storedMetrics.openFollowUps);
    const prayerCount = num(stored.section9GroupsWithPrayerRequests);
    const common = {
      section2SubmissionHealth: stored.section2SubmissionHealth ?? {},
      section3AttendanceTrend: stored.section3AttendanceTrend ?? {},
      section4BodyBreakdown: Array.isArray(stored.section4BodyBreakdown) ? stored.section4BodyBreakdown : [],
      section7NewVisitorsSummary: stored.section7NewVisitorsSummary ?? {},
      section8OpenFollowUps: openFollowUpCountLine(openCount),
      section8OpenFollowUpsCount: openCount,
      section9GroupsWithPrayerRequests: prayerCount,
      section9PrayerAndCareThemes: prayerCountLine(prayerCount),
      section10ActionDecisions: Array.isArray(stored.section10ActionDecisions) ? stored.section10ActionDecisions : [],
    };
    if (scope === 'organization_detail') {
      return base(
        {
          ...common,
          section5LateAndMissingGroups: Array.isArray(stored.section5LateAndMissingGroups) ? stored.section5LateAndMissingGroups : [],
          section6BlockedAndEscalations: Array.isArray(stored.section6BlockedAndEscalations) ? stored.section6BlockedAndEscalations : [],
        },
        storedMetrics,
        scope
      );
    }
    if (scope === 'organization_aggregate') {
      const missing = num(storedMetrics.missingReports);
      const late = num(storedMetrics.lateReports);
      const blocked = num(storedMetrics.blockedReports);
      return base(
        {
          ...common,
          section5LateAndMissingGroups: [`ยังไม่ส่ง ${missing} กลุ่ม · ส่งล่าช้า ${late} กลุ่ม`],
          section6BlockedAndEscalations: blocked > 0 ? [`ติดขัด ${blocked} กลุ่ม`] : [],
        },
        storedMetrics,
        scope
      );
    }
    // Body leader, legacy brief: no Body data can be proven. Show nothing but the title.
    return base({}, {}, 'body');
  }

  // Version 2 brief: build from the slices.
  const activeBodies = num(storedMetrics.activeBodies);
  const detailIds = new Set<string>(scope === 'organization_detail' ? slices.map((s) => s.bodyId) : [...ownIds]);
  const orgWide = scope !== 'body';
  const included = orgWide ? slices : slices.filter((s) => ownIds.has(s.bodyId));
  const metrics = metricsFromSlices(included, orgWide ? activeBodies : included.length);
  const prayer = sum(included, (s) => s.groupsWithPrayerRequests);
  const detailSlices = included.filter((s) => detailIds.has(s.bodyId));
  const hiddenSlices = included.filter((s) => !detailIds.has(s.bodyId));
  const approved = sum(included, (s) => s.approvedReports);

  const lateMissingNames = detailSlices.flatMap((s) => [
    ...s.missingGroupNames.map((n) => `${n} (${s.bodyName})`),
    ...s.lateGroupNames.map((n) => `${n} (ส่งล่าช้า)`),
  ]);
  const hiddenLabel = detailSlices.length === 0 ? 'ภาพรวมทั้งองค์กร' : 'บอดี้อื่น';
  const hiddenMissing = sum(hiddenSlices, (s) => s.missingReports);
  const hiddenLate = sum(hiddenSlices, (s) => s.lateReports);
  const hiddenBlocked = sum(hiddenSlices, (s) => s.blockedReports);
  const lateMissingLines = [
    ...lateMissingNames,
    ...(hiddenMissing + hiddenLate > 0 ? [`${hiddenLabel}: ยังไม่ส่ง ${hiddenMissing} กลุ่ม · ส่งล่าช้า ${hiddenLate} กลุ่ม`] : []),
  ];
  const blockedLines = [
    ...detailSlices.flatMap((s) => s.blockedGroupNotes),
    ...(hiddenBlocked > 0 ? [`${hiddenLabel}: ติดขัด ${hiddenBlocked} กลุ่ม`] : []),
  ];

  const sections = {
    briefSchemaVersion: BRIEF_SCHEMA_VERSION,
    section2SubmissionHealth: {
      expected: metrics.expectedReports,
      submitted: metrics.submittedReports,
      approved,
      missing: metrics.missingReports,
    },
    section3AttendanceTrend: {
      periodAttendance: metrics.periodAttendance,
      newVisitors: metrics.newVisitors,
      returningVisitors: metrics.returningVisitors,
    },
    section4BodyBreakdown: included.map((s) => ({
      bodyName: s.bodyName,
      activeGroups: s.activeGroups,
      submitted: s.submittedReports,
      approved: s.approvedReports,
      attendance: s.periodAttendance,
    })),
    section5LateAndMissingGroups: lateMissingLines,
    section6BlockedAndEscalations: blockedLines,
    section7NewVisitorsSummary: {
      totalNewVisitors: metrics.newVisitors,
      returningVisitors: metrics.returningVisitors,
    },
    section8OpenFollowUps: openFollowUpCountLine(metrics.openFollowUps),
    section8OpenFollowUpsCount: metrics.openFollowUps,
    section9GroupsWithPrayerRequests: prayer,
    section9PrayerAndCareThemes: prayerCountLine(prayer),
    section10ActionDecisions: actionDecisionLines(
      metrics.blockedReports,
      metrics.missingReports
    ),
  };
  const viewScope: BriefViewScope = orgWide ? scope : 'body';
  return base(sections, metrics, viewScope, orgWide ? [] : included.map((s) => s.bodyName));
}
