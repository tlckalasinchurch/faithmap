import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  doublePrecision,
  numeric,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const organizationSettings = pgTable('organization_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationName: text('organization_name').notNull(),
  pilotProvince: text('pilot_province').notNull().default('กาฬสินธุ์'),
  timezone: text('timezone').notNull().default('Asia/Bangkok'),
  periodStartDay: text('period_start_day').notNull().default('monday'),
  deadlineWeekday: text('deadline_weekday').notNull().default('sunday'),
  deadlineTimeLocal: text('deadline_time_local').notNull().default('20:00'),
  briefWeekday: text('brief_weekday').notNull().default('sunday'),
  briefTimeLocal: text('brief_time_local').notNull().default('20:30'),
  retentionMonths: integer('retention_months').notNull().default(36),
  updatedByUserId: uuid('updated_by_user_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const members = pgTable(
  'members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    memberCode: text('member_code').notNull().unique(),
    fullName: text('full_name').notNull(),
    displayName: text('display_name').notNull(),
    phoneE164: text('phone_e164'),
    lineUserId: text('line_user_id'),
    email: text('email'),
    membershipStatus: text('membership_status').notNull().default('active'),
    privacyConsentStatus: text('privacy_consent_status').notNull().default('consented'),
    consentRecordedAt: timestamp('consent_recorded_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'members_status_chk',
      sql`${t.membershipStatus} IN ('active', 'inactive', 'transferred', 'archived')`
    ),
    check(
      'members_consent_chk',
      sql`${t.privacyConsentStatus} IN ('consented', 'pending', 'withdrawn')`
    ),
  ]
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    memberId: uuid('member_id').references(() => members.id, { onDelete: 'set null' }),
    username: text('username').notNull().unique(),
    displayName: text('display_name').notNull(),
    email: text('email'),
    phoneE164: text('phone_e164'),
    systemRole: text('system_role').notNull().default('standard_user'),
    status: text('status').notNull().default('pending_activation'),
    passwordHash: text('password_hash'),
    lineUserId: text('line_user_id'),
    preferredUiMode: text('preferred_ui_mode').notNull().default('auto'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'users_system_role_chk',
      sql`${t.systemRole} IN ('super_admin', 'admin', 'mission_leader', 'standard_user')`
    ),
    check(
      'users_status_chk',
      sql`${t.status} IN ('pending_activation', 'active', 'suspended', 'revoked')`
    ),
    index('users_status_idx').on(t.status),
  ]
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    csrfTokenHash: text('csrf_token_hash').notNull(),
    authMethod: text('auth_method').notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auth_sessions_user_idx').on(t.userId)]
);

export const externalIdentities = pgTable(
  'external_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('external_identities_active_provider_sub_uidx')
      .on(t.provider, t.providerSubject)
      .where(sql`${t.revokedAt} IS NULL`),
    index('external_identities_user_idx').on(t.userId),
  ]
);

export const userPasskeys = pgTable(
  'user_passkeys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull().unique(),
    publicKeyB64: text('public_key_b64').notNull(),
    signCount: integer('sign_count').notNull().default(0),
    deviceLabel: text('device_label').notNull().default('อุปกรณ์หลัก'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [index('user_passkeys_user_idx').on(t.userId)]
);

export const bodies = pgTable(
  'bodies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(),
    nameTh: text('name_th').notNull(),
    nameEn: text('name_en'),
    region: text('region').notNull().default('ภาคตะวันออกเฉียงเหนือ'),
    province: text('province').notNull().default('กาฬสินธุ์'),
    status: text('status').notNull().default('active'),
    sortOrder: integer('sort_order').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('bodies_status_chk', sql`${t.status} IN ('active', 'inactive', 'archived')`),
  ]
);

export const houseMissionGroups = pgTable(
  'house_mission_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupCode: text('group_code').notNull().unique(),
    bodyId: uuid('body_id')
      .notNull()
      .references(() => bodies.id, { onDelete: 'restrict' }),
    nameTh: text('name_th').notNull(),
    nameEn: text('name_en'),
    district: text('district').notNull(),
    subdistrict: text('subdistrict'),
    province: text('province').notNull().default('กาฬสินธุ์'),
    addressSummary: text('address_summary').notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    meetingDayOfWeek: integer('meeting_day_of_week').notNull().default(5),
    meetingTimeLocal: text('meeting_time_local').notNull().default('19:00'),
    status: text('status').notNull().default('active'),
    targetAttendance: integer('target_attendance').notNull().default(12),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'groups_status_chk',
      sql`${t.status} IN ('active', 'inactive', 'merged', 'archived')`
    ),
    check(
      'groups_meeting_day_chk',
      sql`${t.meetingDayOfWeek} BETWEEN 1 AND 7`
    ),
    index('groups_body_idx').on(t.bodyId),
    index('groups_status_idx').on(t.status),
  ]
);

export const reportingPeriods = pgTable(
  'reporting_periods',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    periodKey: text('period_key').notNull().unique(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }).notNull(),
    briefScheduledAt: timestamp('brief_scheduled_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'reporting_periods_status_chk',
      sql`${t.status} IN ('open', 'cutoff_reached', 'brief_published', 'closed')`
    ),
  ]
);

export const groupBodyTransfers = pgTable(
  'group_body_transfers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => houseMissionGroups.id, { onDelete: 'cascade' }),
    fromBodyId: uuid('from_body_id')
      .notNull()
      .references(() => bodies.id, { onDelete: 'restrict' }),
    toBodyId: uuid('to_body_id')
      .notNull()
      .references(() => bodies.id, { onDelete: 'restrict' }),
    effectivePeriodId: uuid('effective_period_id').references(() => reportingPeriods.id, {
      onDelete: 'set null',
    }),
    reason: text('reason').notNull(),
    transferredByUserId: uuid('transferred_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    transferredAt: timestamp('transferred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('group_transfers_group_idx').on(t.groupId)]
);

export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scopeType: text('scope_type').notNull(),
    bodyId: uuid('body_id').references(() => bodies.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => houseMissionGroups.id, { onDelete: 'cascade' }),
    roleType: text('role_type').notNull(),
    isPrimary: boolean('is_primary').notNull().default(true),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    revokedByUserId: uuid('revoked_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    revokedReason: text('revoked_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'assignments_scope_chk',
      sql`(${t.scopeType} = 'body' AND ${t.bodyId} IS NOT NULL AND ${t.groupId} IS NULL) OR (${t.scopeType} = 'group' AND ${t.groupId} IS NOT NULL AND ${t.bodyId} IS NULL)`
    ),
    check(
      'assignments_role_chk',
      sql`${t.roleType} IN ('body_leader', 'care_leader', 'coordinator', 'group_leader')`
    ),
    check(
      'assignments_scope_role_match_chk',
      sql`(${t.scopeType} = 'body' AND ${t.roleType} = 'body_leader') OR (${t.scopeType} = 'group' AND ${t.roleType} IN ('care_leader', 'coordinator', 'group_leader'))`
    ),
    uniqueIndex('assignments_active_primary_body_uidx')
      .on(t.bodyId, t.roleType)
      .where(sql`${t.effectiveTo} IS NULL AND ${t.isPrimary} = true AND ${t.scopeType} = 'body'`),
    uniqueIndex('assignments_active_primary_group_uidx')
      .on(t.groupId, t.roleType)
      .where(sql`${t.effectiveTo} IS NULL AND ${t.isPrimary} = true AND ${t.scopeType} = 'group'`),
    uniqueIndex('assignments_active_user_group_role_uidx')
      .on(t.userId, t.groupId, t.roleType)
      .where(sql`${t.effectiveTo} IS NULL AND ${t.scopeType} = 'group'`),
    uniqueIndex('assignments_active_user_body_role_uidx')
      .on(t.userId, t.bodyId, t.roleType)
      .where(sql`${t.effectiveTo} IS NULL AND ${t.scopeType} = 'body'`),
    index('assignments_user_active_idx').on(t.userId, t.effectiveTo),
    index('assignments_group_active_idx').on(t.groupId, t.effectiveTo),
    index('assignments_body_active_idx').on(t.bodyId, t.effectiveTo),
  ]
);

export const groupMemberships = pgTable(
  'group_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => houseMissionGroups.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    membershipRole: text('membership_role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('group_memberships_active_uidx')
      .on(t.groupId, t.memberId)
      .where(sql`${t.isActive} = true`),
    index('group_memberships_group_idx').on(t.groupId),
  ]
);

export const visitors = pgTable(
  'visitors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fullName: text('full_name').notNull(),
    nickname: text('nickname'),
    phoneE164: text('phone_e164'),
    lineUserId: text('line_user_id'),
    consentForContact: boolean('consent_for_contact').notNull().default(false),
    consentRecordedAt: timestamp('consent_recorded_at', { withTimezone: true }),
    consentCapturedByUserId: uuid('consent_captured_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    firstOriginGroupId: uuid('first_origin_group_id').references(() => houseMissionGroups.id, {
      onDelete: 'set null',
    }),
    visitCount: integer('visit_count').notNull().default(1),
    convertedMemberId: uuid('converted_member_id').references(() => members.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'visitors_pdpa_consent_chk',
      sql`${t.phoneE164} IS NULL OR ${t.consentForContact} = true`
    ),
  ]
);

export const periodGroupSnapshots = pgTable(
  'period_group_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => reportingPeriods.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => houseMissionGroups.id, { onDelete: 'restrict' }),
    bodyId: uuid('body_id')
      .notNull()
      .references(() => bodies.id, { onDelete: 'restrict' }),
    groupNameSnapshot: text('group_name_snapshot').notNull(),
    bodyNameSnapshot: text('body_name_snapshot').notNull(),
    districtSnapshot: text('district_snapshot').notNull(),
    groupStatusSnapshot: text('group_status_snapshot').notNull(),
    targetAttendanceSnapshot: integer('target_attendance_snapshot').notNull().default(12),
    expectedReport: boolean('expected_report').notNull().default(true),
    primaryGroupLeaderUserId: uuid('primary_group_leader_user_id'),
    supervisorUserIdsJson: jsonb('supervisor_user_ids_json').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('period_group_snapshots_period_group_uidx').on(t.periodId, t.groupId),
    index('period_group_snapshots_body_idx').on(t.periodId, t.bodyId),
  ]
);

export const weeklyReports = pgTable(
  'weekly_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => reportingPeriods.id, { onDelete: 'cascade' }),
    snapshotId: uuid('snapshot_id').references(() => periodGroupSnapshots.id, {
      onDelete: 'set null',
    }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => houseMissionGroups.id, { onDelete: 'restrict' }),
    bodyId: uuid('body_id')
      .notNull()
      .references(() => bodies.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('draft'),
    meetingHeld: boolean('meeting_held'),
    notHeldReason: text('not_held_reason'),
    meetingDate: date('meeting_date'),
    totalAttendees: integer('total_attendees').notNull().default(0),
    memberAttendees: integer('member_attendees').notNull().default(0),
    newVisitorsCount: integer('new_visitors_count').notNull().default(0),
    returningVisitorsCount: integer('returning_visitors_count').notNull().default(0),
    childrenCount: integer('children_count').notNull().default(0),
    offeringAmountThb: numeric('offering_amount_thb', { precision: 12, scale: 2 })
      .notNull()
      .default('0.00'),
    summaryNotes: text('summary_notes'),
    prayerRequests: text('prayer_requests'),
    careNeedsNotes: text('care_needs_notes'),
    isLate: boolean('is_late').notNull().default(false),
    isBlocked: boolean('is_blocked').notNull().default(false),
    blockedReason: text('blocked_reason'),
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
    requiresSupervisorReview: boolean('requires_supervisor_review').notNull().default(false),
    submittedByUserId: uuid('submitted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    supervisorReviewedByUserId: uuid('supervisor_reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    supervisorReviewedAt: timestamp('supervisor_reviewed_at', { withTimezone: true }),
    supervisorNotes: text('supervisor_notes'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    revisionRequestedByUserId: uuid('revision_requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    revisionRequestedAt: timestamp('revision_requested_at', { withTimezone: true }),
    revisionReason: text('revision_reason'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('weekly_reports_period_group_uidx').on(t.periodId, t.groupId),
    check(
      'wr_status_chk',
      sql`${t.status} IN ('draft', 'submitted', 'under_review', 'needs_revision', 'approved')`
    ),
    check(
      'wr_non_negative_counts_chk',
      sql`${t.totalAttendees} >= 0 AND ${t.memberAttendees} >= 0 AND ${t.newVisitorsCount} >= 0 AND ${t.returningVisitorsCount} >= 0 AND ${t.childrenCount} >= 0`
    ),
    check(
      'wr_no_self_approval_chk',
      sql`${t.approvedByUserId} IS NULL OR ${t.submittedByUserId} IS NULL OR ${t.approvedByUserId} <> ${t.submittedByUserId}`
    ),
    check(
      'wr_sequential_review_chk',
      sql`${t.status} <> 'approved' OR ${t.requiresSupervisorReview} = false OR ${t.supervisorReviewedAt} IS NOT NULL`
    ),
    check(
      'wr_approved_fields_chk',
      sql`(${t.status} = 'approved' AND ${t.approvedByUserId} IS NOT NULL AND ${t.approvedAt} IS NOT NULL AND ${t.isBlocked} = false) OR ${t.status} <> 'approved'`
    ),
    check(
      'wr_revision_reason_chk',
      sql`${t.status} <> 'needs_revision' OR (${t.revisionReason} IS NOT NULL AND length(trim(${t.revisionReason})) > 0)`
    ),
    check(
      'wr_submitted_meeting_held_chk',
      sql`${t.status} = 'draft' OR ${t.meetingHeld} IS NOT NULL`
    ),
    check(
      'wr_not_held_reason_chk',
      sql`${t.status} = 'draft' OR ${t.meetingHeld} = true OR (${t.notHeldReason} IS NOT NULL AND length(trim(${t.notHeldReason})) > 0)`
    ),
    index('weekly_reports_body_status_idx').on(t.bodyId, t.status),
    index('weekly_reports_blocked_idx').on(t.isBlocked),
  ]
);

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    weeklyReportId: uuid('weekly_report_id')
      .notNull()
      .references(() => weeklyReports.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    attendanceStatus: text('attendance_status').notNull().default('present'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('attendance_records_report_member_uidx').on(t.weeklyReportId, t.memberId),
    check(
      'attendance_status_chk',
      sql`${t.attendanceStatus} IN ('present', 'absent', 'excused')`
    ),
  ]
);

export const visitorVisits = pgTable(
  'visitor_visits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    visitorId: uuid('visitor_id')
      .notNull()
      .references(() => visitors.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => houseMissionGroups.id, { onDelete: 'cascade' }),
    weeklyReportId: uuid('weekly_report_id').references(() => weeklyReports.id, {
      onDelete: 'set null',
    }),
    periodId: uuid('period_id')
      .notNull()
      .references(() => reportingPeriods.id, { onDelete: 'cascade' }),
    visitType: text('visit_type').notNull(),
    visitedOn: date('visited_on').notNull(),
    recordedByUserId: uuid('recorded_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('visitor_visits_type_chk', sql`${t.visitType} IN ('new_visitor', 'returning_visitor')`),
    index('visitor_visits_group_period_idx').on(t.groupId, t.periodId),
  ]
);

export const followUpItems = pgTable(
  'follow_up_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => houseMissionGroups.id, { onDelete: 'cascade' }),
    visitorId: uuid('visitor_id').references(() => visitors.id, { onDelete: 'set null' }),
    memberId: uuid('member_id').references(() => members.id, { onDelete: 'set null' }),
    sourceReportId: uuid('source_report_id').references(() => weeklyReports.id, {
      onDelete: 'set null',
    }),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    notes: text('notes'),
    status: text('status').notNull().default('open'),
    dueDate: date('due_date'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'follow_up_status_chk',
      sql`${t.status} IN ('open', 'in_progress', 'completed', 'cancelled')`
    ),
    index('follow_up_group_status_idx').on(t.groupId, t.status),
  ]
);

export const reportAuditEvents = pgTable(
  'report_audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    weeklyReportId: uuid('weekly_report_id')
      .notNull()
      .references(() => weeklyReports.id, { onDelete: 'cascade' }),
    periodId: uuid('period_id')
      .notNull()
      .references(() => reportingPeriods.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => houseMissionGroups.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorRole: text('actor_role'),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('report_audit_report_idx').on(t.weeklyReportId, t.createdAt)]
);

export const meetingBriefs = pgTable('meeting_briefs', {
  id: uuid('id').defaultRandom().primaryKey(),
  periodId: uuid('period_id')
    .notNull()
    .unique()
    .references(() => reportingPeriods.id, { onDelete: 'cascade' }),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  generatedByJob: boolean('generated_by_job').notNull().default(false),
  generatedByUserId: uuid('generated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  isImmutable: boolean('is_immutable').notNull().default(true),
  sectionsJson: jsonb('sections_json').$type<Record<string, unknown>>().notNull(),
  metricsJson: jsonb('metrics_json').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull().default('in_app'),
    category: text('category').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    relatedEntityType: text('related_entity_type'),
    relatedEntityId: text('related_entity_id'),
    dedupeKey: text('dedupe_key').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notifications_user_dedupe_uidx').on(t.userId, t.dedupeKey),
    index('notifications_user_read_idx').on(t.userId, t.readAt),
  ]
);

export const lineDispatches = pgTable(
  'line_dispatches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lineUserId: text('line_user_id').notNull(),
    category: text('category').notNull(),
    messageText: text('message_text').notNull(),
    dedupeKey: text('dedupe_key').notNull().unique(),
    status: text('status').notNull().default('queued'),
    providerResponse: jsonb('provider_response').$type<Record<string, unknown>>(),
    attemptCount: integer('attempt_count').notNull().default(1),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'line_dispatches_status_chk',
      sql`${t.status} IN ('queued', 'sent', 'simulated_sent', 'failed', 'skipped_unlinked')`
    ),
  ]
);

export const securityAuditLogs = pgTable(
  'security_audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    ipAddress: text('ip_address'),
    outcome: text('outcome').notNull().default('success'),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('security_audit_outcome_chk', sql`${t.outcome} IN ('success', 'denied', 'error')`),
    index('security_audit_created_idx').on(t.createdAt),
  ]
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scopeKey: text('scope_key').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').$type<unknown>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('idempotency_scope_key_uidx').on(t.scopeKey, t.idempotencyKey),
    index('idempotency_expires_idx').on(t.expiresAt),
  ]
);
