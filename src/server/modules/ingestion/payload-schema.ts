import { z } from 'zod';

export const importPayloadSchema = z.object({
  sourceArchiveName: z.string().min(1).max(300),
  selectionPolicyVersion: z.string().max(40).optional(),
  groups: z.array(
    z.object({
      groupRef: z.string().min(1).max(500),
      groupNameFromSheet: z.string().min(1).max(500),
      formTitle: z.string().max(2000).nullable().optional(),
      district: z.string().max(2000).nullable().optional(),
      subdistrict: z.string().max(2000).nullable().optional(),
      village: z.string().max(2000).nullable().optional(),
      meetingDay: z.string().max(2000).nullable().optional(),
      meetingTimeStart: z.union([z.string().max(2000), z.number()]).nullable().optional(),
      meetingTimeEnd: z.union([z.string().max(2000), z.number()]).nullable().optional(),
      meetingPlace: z.string().max(2000).nullable().optional(),
      leader: z.string().max(2000).nullable().optional(),
      coordinator: z.string().max(2000).nullable().optional(),
      careLabel: z.string().max(2000).nullable().optional(),
      careCode: z.string().max(2000).nullable().optional(),
      teamName: z.string().max(2000).nullable().optional(),
      registeredTotal: z.union([z.string().max(2000), z.number()]).nullable().optional(),
      mapUrlRaw: z.string().max(2000).nullable().optional(),
      groupPhotoUrl: z.string().max(2000).nullable().optional(),
      sourceFile: z.string().min(1).max(500),
      sourceSheet: z.string().min(1).max(500),
    })
  ).max(500),
  members: z.array(
    z.object({
      memberRowRef: z.string().min(1).max(500),
      groupRef: z.string().min(1).max(500),
      sequenceRaw: z.union([z.string().max(2000), z.number()]).nullable().optional(),
      fullNameRaw: z.string().max(2000).nullable().optional(),
      nicknameRaw: z.string().max(2000).nullable().optional(),
      ageRaw: z.union([z.string().max(2000), z.number()]).nullable().optional(),
      occupationRaw: z.string().max(2000).nullable().optional(),
      studyWorkplaceRaw: z.string().max(2000).nullable().optional(),
      familyStatusRaw: z.string().max(2000).nullable().optional(),
      locationRaw: z.string().max(2000).nullable().optional(),
      salvationDateRaw: z.string().max(2000).nullable().optional(),
      responseAttitudeRaw: z.string().max(2000).nullable().optional(),
      groupAttendanceLevelRaw: z.string().max(2000).nullable().optional(),
      discipleshipGoalRaw: z.string().max(2000).nullable().optional(),
      targetTimeframeRaw: z.string().max(2000).nullable().optional(),
      disciplerNameRaw: z.string().max(2000).nullable().optional(),
      sourceFile: z.string().min(1).max(500),
      sourceSheet: z.string().min(1).max(500),
      sourceRow: z.number().int().min(1),
      rawCells: z
        .record(z.string(), z.unknown())
        .refine((v) => JSON.stringify(v).length <= 20_000, 'rawCells too large')
        .optional(),
    })
  ).max(20000),
});
