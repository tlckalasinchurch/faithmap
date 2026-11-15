import { z } from 'zod';

// Limits keep one request small and keep every value inside its database column.
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).nullable().optional();

export const orgActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_group'),
    groupCode: z.string().trim().min(2).max(40),
    bodyId: z.string().uuid().nullable().optional(),
    nameTh: z.string().trim().min(2).max(120),
    district: z.string().trim().min(2).max(80),
    subdistrict: optText(80),
    village: optText(80),
    careCodeRaw: optText(40),
    addressSummary: optText(300),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    meetingDayOfWeek: z.number().int().min(1).max(7).nullable().optional(),
    meetingTimeLocal: optText(20),
    targetAttendance: z.number().int().min(1).max(1000).optional(),
    notes: text(2000).optional(),
  }),
  z.object({
    action: z.literal('transfer_group'),
    groupId: z.string().uuid(),
    toBodyId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    action: z.literal('assign_role'),
    userId: z.string().uuid(),
    scopeType: z.enum(['body', 'group']),
    bodyId: z.string().uuid().nullable().optional(),
    groupId: z.string().uuid().nullable().optional(),
    roleType: z.enum(['body_leader', 'care_leader', 'coordinator', 'group_leader', 'other_authorized']),
    isPrimary: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('revoke_assignment'),
    assignmentId: z.string().uuid(),
    reason: z.string().trim().min(2).max(500),
  }),
  z.object({
    action: z.literal('update_user_status'),
    targetUserId: z.string().uuid(),
    nextStatus: z.enum(['pending_activation', 'active', 'suspended', 'revoked']),
    reason: z.string().trim().min(2).max(500),
  }),
]);
