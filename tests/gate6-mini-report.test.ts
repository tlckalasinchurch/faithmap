import { describe, expect, it } from 'vitest';
import {
  buildReportPayload,
  getReportCapabilities,
  validateReportForm,
  type ReportCapabilityInput,
  type ReportForm,
} from '@/lib/mini-report';
import { reportActionSchema } from '@/app/api/v1/reports/schema';

const base: ReportCapabilityInput = {
  status: 'draft',
  isBlocked: false,
  requiresSupervisorReview: false,
  submittedByUserId: null,
  actorUserId: 'u-me',
  isGroupLeader: false,
  isSupervisor: false,
  isBodyLeader: false,
};
const caps = (o: Partial<ReportCapabilityInput>) => getReportCapabilities({ ...base, ...o });

describe('MINI report: what each role can do per status', () => {
  it('a group leader edits and submits a draft, a new report and a returned report', () => {
    for (const status of ['not_submitted', 'draft', 'needs_revision']) {
      expect(caps({ status, isGroupLeader: true })).toMatchObject({ canEdit: true, canSubmit: true, canApprove: false });
    }
  });
  it('a submitted or approved report is read-only for the group leader', () => {
    for (const status of ['submitted', 'under_review', 'approved']) {
      expect(caps({ status, isGroupLeader: true }).canEdit).toBe(false);
    }
  });
  it('a blocked report cannot be edited', () => {
    expect(caps({ isGroupLeader: true, isBlocked: true }).canEdit).toBe(false);
  });
  it('someone who is not the leader of the group cannot edit, even a body leader', () => {
    expect(caps({ isBodyLeader: true }).canEdit).toBe(false);
    expect(caps({}).readOnly).toBe(true);
  });
  it('supervisor reviews first (DEC-04); the body leader cannot approve before that', () => {
    const waiting = { status: 'submitted', requiresSupervisorReview: true, submittedByUserId: 'u-leader' };
    expect(caps({ ...waiting, isSupervisor: true })).toMatchObject({ canReview: true, canApprove: false });
    expect(caps({ ...waiting, isBodyLeader: true })).toMatchObject({ canReview: false, canApprove: false });
    expect(caps({ ...waiting, status: 'under_review', isBodyLeader: true }).canApprove).toBe(true);
  });
  it('without a supervisor the body leader approves directly (CD-03)', () => {
    expect(caps({ status: 'submitted', submittedByUserId: 'u-leader', isBodyLeader: true }).canApprove).toBe(true);
  });
  it('nobody approves a report they submitted (DEC-05)', () => {
    expect(caps({ status: 'submitted', submittedByUserId: 'u-me', isBodyLeader: true }).canApprove).toBe(false);
    expect(caps({ status: 'submitted', requiresSupervisorReview: true, submittedByUserId: 'u-me', isSupervisor: true }).canReview).toBe(false);
  });
  it('approved is final: no action for anyone', () => {
    const c = caps({ status: 'approved', isGroupLeader: true, isSupervisor: true, isBodyLeader: true, submittedByUserId: 'x' });
    expect(c).toMatchObject({ canEdit: false, canReview: false, canApprove: false, canRequestRevision: false, readOnly: true });
  });
  it('a reviewer who can act may also send the report back', () => {
    expect(caps({ status: 'submitted', submittedByUserId: 'x', isBodyLeader: true }).canRequestRevision).toBe(true);
    expect(caps({ status: 'draft', isGroupLeader: true }).canRequestRevision).toBe(false);
  });
});

const form: ReportForm = {
  meetingHeld: true,
  notHeldReason: '',
  meetingDate: '2026-11-15',
  newVisitorsCount: '1',
  returningVisitorsCount: '0',
  childrenCount: '2',
  offeringAmountThb: '150',
  summaryNotes: 'นมัสการและแบ่งปันพระวจนะ',
  prayerRequests: '',
  careNeedsNotes: '',
  teachingTopic: '',
  scriptureRef: '',
  actPrayer: false,
  actFellowship: false,
  actOther: '',
  locationText: '',
  atmosphereNotes: '',
  followupNeedsText: '',
  nextWeekPlan: '',
  supportNeededText: '',
  attendance: {
    '00000000-0000-4000-8000-000000000001': 'present',
    '00000000-0000-4000-8000-000000000002': 'present',
    '00000000-0000-4000-8000-000000000003': 'absent',
  },
};

describe('MINI report: form validation and payload', () => {
  it('accepts a complete form', () => {
    expect(validateReportForm(form)).toEqual([]);
  });
  it('requires a reason when the meeting was not held', () => {
    expect(validateReportForm({ ...form, meetingHeld: false })).toHaveLength(1);
    expect(validateReportForm({ ...form, meetingHeld: false, notHeldReason: 'ฝนตกหนัก' })).toEqual([]);
  });
  it('rejects negative, fractional and non-numeric counts', () => {
    for (const bad of ['-1', '1.5', 'abc']) {
      expect(validateReportForm({ ...form, childrenCount: bad })).not.toEqual([]);
    }
  });
  it('rejects a negative offering and text over the limit', () => {
    expect(validateReportForm({ ...form, offeringAmountThb: '-5' })).not.toEqual([]);
    expect(validateReportForm({ ...form, summaryNotes: 'ก'.repeat(4001) })).not.toEqual([]);
  });
  it('counts attendance from the marks, so the totals always agree with the list', () => {
    const p = buildReportPayload(form);
    expect(p.memberAttendees).toBe(2);
    expect(p.totalAttendees).toBe(2 + 1 + 0 + 2);
    expect(p.attendance).toHaveLength(3);
  });
  it('sends zero attendance and the reason when no meeting was held', () => {
    const p = buildReportPayload({ ...form, meetingHeld: false, notHeldReason: ' ฝนตก ' });
    expect(p).toMatchObject({ meetingHeld: false, notHeldReason: 'ฝนตก', totalAttendees: 0, memberAttendees: 0 });
  });
  it('builds a body the existing API contract accepts, for draft and submit', () => {
    const payload = buildReportPayload(form, 3);
    const ids = { periodId: '00000000-0000-4000-8000-0000000000aa', groupId: '00000000-0000-4000-8000-0000000000bb' };
    for (const action of ['save_draft', 'submit'] as const) {
      expect(reportActionSchema.safeParse({ action, ...ids, payload }).success).toBe(true);
    }
    expect(payload.expectedVersion).toBe(3);
    expect(buildReportPayload(form)).not.toHaveProperty('expectedVersion');
  });
});
