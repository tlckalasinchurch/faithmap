/**
 * Rules for the MINI App weekly report screen. Pure functions, no network.
 * They decide what to SHOW. The server still checks every request (CD-02, CD-08, DEC-04, DEC-05).
 */
export type ReportStatus =
  | 'not_submitted'
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'needs_revision'
  | 'approved'
  | string;

export const MINI_STATUS_TH: Record<string, string> = {
  not_submitted: 'ยังไม่ได้เริ่มรายงาน',
  draft: 'ฉบับร่าง (ยังไม่ส่ง)',
  submitted: 'ส่งแล้ว รอตรวจ',
  under_review: 'กำลังตรวจ',
  needs_revision: 'ต้องแก้ไขแล้วส่งใหม่',
  approved: 'อนุมัติแล้ว',
};

export interface ReportCapabilityInput {
  status: ReportStatus;
  isBlocked: boolean;
  requiresSupervisorReview: boolean;
  submittedByUserId: string | null;
  actorUserId: string;
  isGroupLeader: boolean;
  isSupervisor: boolean;
  isBodyLeader: boolean;
}

export interface ReportCapabilities {
  canEdit: boolean;
  canSubmit: boolean;
  canReview: boolean;
  canApprove: boolean;
  /** Reviewer may send the report back with a reason. */
  canRequestRevision: boolean;
  readOnly: boolean;
}

export function getReportCapabilities(i: ReportCapabilityInput): ReportCapabilities {
  const editable = ['not_submitted', 'draft', 'needs_revision'].includes(i.status);
  const canEdit = i.isGroupLeader && editable && !i.isBlocked;
  const inReview = i.status === 'submitted' || i.status === 'under_review';
  const notOwn = i.submittedByUserId !== i.actorUserId;
  // DEC-04: when a supervisor exists, the supervisor reviews first. Only then the Body Leader approves.
  const canReview = i.isSupervisor && inReview && i.requiresSupervisorReview && i.status === 'submitted' && notOwn;
  const supervisorDone = !i.requiresSupervisorReview || i.status === 'under_review';
  const canApprove = i.isBodyLeader && inReview && supervisorDone && notOwn; // CD-02, DEC-05
  return {
    canEdit,
    canSubmit: canEdit,
    canReview,
    canApprove,
    canRequestRevision: canReview || canApprove,
    readOnly: !canEdit && !canReview && !canApprove,
  };
}

export interface ReportForm {
  meetingHeld: boolean;
  notHeldReason: string;
  meetingDate: string;
  newVisitorsCount: string;
  returningVisitorsCount: string;
  childrenCount: string;
  offeringAmountThb: string;
  summaryNotes: string;
  prayerRequests: string;
  careNeedsNotes: string;
  attendance: Record<string, 'present' | 'absent' | 'excused'>;
}

export const REPORT_TEXT_MAX = 4000;

function toCount(v: string): number {
  const n = Number(v.trim() === '' ? 0 : v);
  return Number.isInteger(n) ? n : NaN; // 1.5 and text are errors, never rounded
}

/** Returns Thai messages. An empty list means the form can be submitted. */
export function validateReportForm(f: ReportForm): string[] {
  const errors: string[] = [];
  if (!f.meetingHeld && !f.notHeldReason.trim()) errors.push('กรุณาบอกเหตุผลที่ไม่ได้จัดการประชุม');
  for (const [label, v] of [
    ['จำนวนผู้เยี่ยมใหม่', f.newVisitorsCount],
    ['จำนวนผู้เยี่ยมซ้ำ', f.returningVisitorsCount],
    ['จำนวนเด็ก', f.childrenCount],
  ] as const) {
    const n = toCount(v);
    if (!Number.isInteger(n) || n < 0) errors.push(`${label}ต้องเป็นตัวเลข 0 ขึ้นไป`);
  }
  const offering = Number(f.offeringAmountThb.trim() === '' ? 0 : f.offeringAmountThb);
  if (!Number.isFinite(offering) || offering < 0) errors.push('ยอดถวายต้องเป็นตัวเลข 0 ขึ้นไป');
  for (const [label, v] of [
    ['สรุปการประชุม', f.summaryNotes],
    ['เรื่องขอบคุณและอธิษฐาน', f.prayerRequests],
    ['เรื่องที่ต้องดูแล', f.careNeedsNotes],
  ] as const) {
    if (v.length > REPORT_TEXT_MAX) errors.push(`${label}ยาวเกิน ${REPORT_TEXT_MAX} ตัวอักษร`);
  }
  return errors;
}

/**
 * Builds the body the existing /api/v1/reports contract expects.
 * Member counts come from the attendance marks, so the numbers can never disagree with the list.
 */
export function buildReportPayload(f: ReportForm, expectedVersion?: number) {
  const marks = Object.entries(f.attendance);
  const memberAttendees = marks.filter(([, s]) => s === 'present').length;
  const newVisitorsCount = toCount(f.newVisitorsCount);
  const returningVisitorsCount = toCount(f.returningVisitorsCount);
  const childrenCount = toCount(f.childrenCount);
  return {
    meetingHeld: f.meetingHeld,
    notHeldReason: f.meetingHeld ? null : f.notHeldReason.trim(),
    meetingDate: f.meetingDate || null,
    totalAttendees: f.meetingHeld ? memberAttendees + newVisitorsCount + returningVisitorsCount + childrenCount : 0,
    memberAttendees: f.meetingHeld ? memberAttendees : 0,
    newVisitorsCount,
    returningVisitorsCount,
    childrenCount,
    offeringAmountThb: f.offeringAmountThb.trim() === '' ? '0' : f.offeringAmountThb.trim(),
    summaryNotes: f.summaryNotes,
    prayerRequests: f.prayerRequests,
    careNeedsNotes: f.careNeedsNotes,
    attendance: marks.map(([memberId, attendanceStatus]) => ({ memberId, attendanceStatus })),
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
  };
}
