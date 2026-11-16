import { z } from 'zod';

const attendanceItemSchema = z.object({
  memberId: z.string().uuid(),
  attendanceStatus: z.enum(['present', 'absent', 'leave', 'online']),
});

const reportPayloadSchema = z.object({
  meetingHeld: z.boolean(),
  notHeldReason: z.string().max(4000).nullable().optional(),
  meetingDate: z.string().max(4000).nullable().optional(),
  totalAttendees: z.number().int().min(0),
  memberAttendees: z.number().int().min(0),
  newVisitorsCount: z.number().int().min(0),
  returningVisitorsCount: z.number().int().min(0),
  childrenCount: z.number().int().min(0),
  offeringAmountThb: z.union([z.number().finite().min(0), z.string().max(40)]).optional(),
  summaryNotes: z.string().max(4000).nullable().optional(),
  prayerRequests: z.string().max(4000).nullable().optional(),
  careNeedsNotes: z.string().max(4000).nullable().optional(),
  teachingTopic: z.string().max(300).nullable().optional(),
  scriptureRef: z.string().max(200).nullable().optional(),
  activities: z
    .object({ prayer: z.boolean().optional(), fellowship: z.boolean().optional(), other: z.string().max(300).nullable().optional() })
    .nullable()
    .optional(),
  locationText: z.string().max(500).nullable().optional(),
  atmosphereNotes: z.string().max(2000).nullable().optional(),
  followupNeedsText: z.string().max(2000).nullable().optional(),
  nextWeekPlan: z.string().max(2000).nullable().optional(),
  supportNeededText: z.string().max(2000).nullable().optional(),
  attendance: z.array(attendanceItemSchema).max(300).optional(),
  expectedVersion: z.number().int().positive().optional(),
});

export const reportActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save_draft'),
    periodId: z.string().uuid(),
    groupId: z.string().uuid(),
    payload: reportPayloadSchema,
  }),
  z.object({
    action: z.literal('submit'),
    periodId: z.string().uuid(),
    groupId: z.string().uuid(),
    payload: reportPayloadSchema,
  }),
  z.object({
    action: z.literal('review'),
    reportId: z.string().uuid(),
    decision: z.enum(['forward', 'request_revision']),
    notesOrReason: z.string().max(4000).nullable().optional(),
    // Required: the person must name the version they looked at.
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('approve'),
    reportId: z.string().uuid(),
    decision: z.enum(['approve', 'request_revision']),
    notesOrReason: z.string().max(4000).nullable().optional(),
    // Required: the person must name the version they looked at.
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('unblock'),
    reportId: z.string().uuid(),
    notes: z.string().max(4000).nullable().optional(),
  }),
]);
