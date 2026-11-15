import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).nullable().optional();

export const pastoralActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_member'),
    groupId: z.string().uuid(),
    fullName: z.string().trim().min(2).max(120),
    displayName: z.string().trim().min(1).max(60),
    phoneE164: optText(20),
    email: optText(254),
    membershipRole: text(40).optional(),
    notes: optText(2000),
  }),
  z.object({
    action: z.literal('register_visitor'),
    groupId: z.string().uuid(),
    fullName: z.string().trim().min(2).max(120),
    nickname: optText(60),
    phoneE164: optText(20),
    lineUserId: optText(64),
    consentForContact: z.boolean(),
    visitType: z.enum(['new_visitor', 'returning_visitor']).optional(),
    visitedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    weeklyReportId: z.string().uuid().nullable().optional(),
    notes: optText(2000),
    createFollowUp: z.boolean().optional(),
    followUpTitle: optText(200),
  }),
  z.object({
    action: z.literal('convert_visitor'),
    visitorId: z.string().uuid(),
    targetGroupId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal('update_follow_up'),
    followUpId: z.string().uuid(),
    status: z.enum(['open', 'in_progress', 'completed', 'cancelled']),
    notes: optText(2000),
  }),
]);
