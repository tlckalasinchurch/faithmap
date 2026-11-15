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
  foreignKey,
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
    fullName: text('full_name'),
    nickname: text('nickname'),
    displayName: text('display_name').notNull(),
    ageRaw: text('age_raw'),
    occupationRaw: text('occupation_raw'),
    locationTextRaw: text('location_text_raw'),
    phoneE164: text('phone_e164'),
    lineUserId: text('line_user_id'),
    email: text('email'),
    sourceSequenceNo: text('source_sequence_no'),
    studyWorkplaceRaw: text('study_workplace_raw'),
    familyStatusRaw: text('family_status_raw'),
    membershipStatus: text('membership_status').notNull().default('active'),
    verificationStatus: text('verification_status').notNull().default('unverified'),
    privacyConsentStatus: text('privacy_consent_status').notNull().default('consented'),
    consentRecordedAt: timestamp('consent_recorded_at', { withTimezone: true }),
    sourceBatchId: uuid('source_batch_id'),
    sourceRowRef: text('source_row_ref'),
    sourceProvenance: jsonb('source_provenance').$type<Record<string, unknown>>(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'members_identity_chk',
      sql`${t.fullName} IS NOT NULL OR ${t.nickname} IS NOT NULL`
    ),
    check(
      'members_status_chk',
      sql`${t.membershipStatus} IN ('active', 'inactive', 'transferred', 'archived')`
    ),
    check(
      'members_verification_chk',
      sql`${t.verificationStatus} IN ('unverified', 'pending_review', 'verified')`
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

export const cares = pgTable(
  'cares',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    careCode: text('care_code').notNull().unique(),
    careName: text('care_name'),
    teamName: text('team_name'),
    bodyId: uuid('body_id').references(() => bodies.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('provisional'),
    sourceBatchId: uuid('source_batch_id'),
    sourceRef: text('source_ref'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'cares_status_chk',
      sql`${t.status} IN ('provisional', 'active', 'pending_assignment', 'inactive', 'archived')`
    ),
    index('cares_body_idx').on(t.bodyId),
    index('cares_status_idx').on(t.status),
  ]
);

export const teamFieldPoints = pgTable(
  'team_field_points',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamCode: text('team_code').notNull().default('G'),
    pointNo: integer('point_no').notNull(),
    pointName: text('point_name').notNull(),
    coordinatorName: text('coordinator_name'),
    phoneRaw: text('phone_raw'),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    mapsUrl: text('maps_url'),
    sourceSheet: text('source_sheet').notNull().default('kalasin-field-points'),
    // DEC-17 / Q-8: who may read the point. Both stay NULL until an admin maps the point. NULL matches nobody.
    bodyId: uuid('body_id').references(() => bodies.id, { onDelete: 'set null' }),
    coordinatorUserId: uuid('coordinator_user_id').references(() => users.id, { onDelete: 'set null' }),
    assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('team_field_points_body_idx').on(t.bodyId),
    index('team_field_points_coordinator_idx').on(t.coordinatorUserId),
    uniqueIndex('team_field_points_team_no_uidx').on(t.teamCode, t.pointNo),
    check(
      'team_field_points_coords_chk',
      sql`${t.latitude} BETWEEN -90 AND 90 AND ${t.longitude} BETWEEN -180 AND 180`
    ),
  ]
);

export const houseMissionGroups = pgTable(
  'house_mission_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupCode: text('group_code').notNull().unique(),
    bodyId: uuid('body_id').references(() => bodies.id, { onDelete: 'set null' }),
    careId: uuid('care_id').references(() => cares.id, { onDelete: 'set null' }),
    teamName: text('team_name'),
    nameTh: text('name_th').notNull(),
    nameEn: text('name_en'),
    groupNameFromSheet: text('group_name_from_sheet'),
    formTitle: text('form_title'),
    careCodeRaw: text('care_code_raw'),
    registeredTotalRaw: text('registered_total_raw'),
    registeredTotalInt: integer('registered_total_int'),
    district: text('district').notNull(),
    districtRaw: text('district_raw'),
    subdistrict: text('subdistrict'),
    village: text('village'),
    province: text('province').notNull().default('กาฬสินธุ์'),
    addressSummary: text('address_summary'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    mapUrlRaw: text('map_url_raw'),
    groupPhotoUrl: text('group_photo_url'),
    meetingDayOfWeek: integer('meeting_day_of_week'),
    meetingDayRaw: text('meeting_day_raw'),
    meetingTimeLocal: text('meeting_time_local'),
    meetingTimeRaw: text('meeting_time_raw'),
    status: text('status').notNull().default('active'),
    assignmentStatus: text('assignment_status').notNull().default('assigned'),
    locationStatus: text('location_status').notNull().default('verified'),
    verificationStatus: text('verification_status').notNull().default('RAW'),
    targetAttendance: integer('target_attendance').notNull().default(12),
    sourceBatchId: uuid('source_batch_id'),
    sourceRef: text('source_ref'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'groups_status_chk',
      sql`${t.status} IN ('active', 'inactive', 'merged', 'archived', 'pending_activation')`
    ),
    check(
      'groups_assignment_status_chk',
      sql`${t.assignmentStatus} IN ('assigned', 'pending_assignment')`
    ),
    check(
      'groups_location_status_chk',
      sql`${t.locationStatus} IN ('verified', 'pending_location')`
    ),
    check(
      'groups_verification_status_chk',
      sql`${t.verificationStatus} IN ('RAW', 'NORMALIZED', 'VERIFIED', 'PENDING_REVIEW', 'CONFLICT', 'INCOMPLETE')`
    ),
    check(
      'groups_meeting_day_chk',
      sql`${t.meetingDayOfWeek} IS NULL OR ${t.meetingDayOfWeek} BETWEEN 1 AND 7`
    ),
    check(
      'groups_coords_pair_chk',
      sql`(${t.latitude} IS NULL AND ${t.longitude} IS NULL) OR (${t.latitude} BETWEEN -90 AND 90 AND ${t.longitude} BETWEEN -180 AND 180)`
    ),
    index('groups_body_idx').on(t.bodyId),
    index('groups_care_idx').on(t.careId),
    index('groups_status_idx').on(t.status),
    index('groups_assignment_body_idx').on(t.assignmentStatus, t.bodyId),
    index('groups_location_status_idx').on(t.locationStatus),
    index('groups_district_idx').on(t.district),
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
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    stewardMemberId: uuid('steward_member_id').references(() => members.id, {
      onDelete: 'set null',
    }),
    stewardDisplayName: text('steward_display_name'),
    linkStatus: text('link_status').notNull().default('linked_user'),
    sourceRoleLabel: text('source_role_label'),
    scopeType: text('scope_type').notNull(),
    bodyId: uuid('body_id').references(() => bodies.id, { onDelete: 'cascade' }),
    careId: uuid('care_id').references(() => cares.id, { onDelete: 'cascade' }),
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
      'assignments_steward_identity_chk',
      sql`${t.userId} IS NOT NULL OR ${t.stewardMemberId} IS NOT NULL OR (${t.stewardDisplayName} IS NOT NULL AND length(trim(${t.stewardDisplayName})) > 0)`
    ),
    check(
      'assignments_link_status_chk',
      sql`${t.linkStatus} IN ('linked_user', 'unlinked_pending_account')`
    ),
    check(
      'assignments_scope_chk',
      sql`(${t.scopeType} = 'body' AND ${t.bodyId} IS NOT NULL AND ${t.careId} IS NULL AND ${t.groupId} IS NULL) OR (${t.scopeType} = 'care' AND ${t.careId} IS NOT NULL AND ${t.bodyId} IS NULL AND ${t.groupId} IS NULL) OR (${t.scopeType} = 'group' AND ${t.groupId} IS NOT NULL AND ${t.bodyId} IS NULL AND ${t.careId} IS NULL)`
    ),
    check(
      'assignments_role_chk',
      sql`${t.roleType} IN ('body_leader', 'care_leader', 'coordinator', 'group_leader', 'other_authorized')`
    ),
    check(
      'assignments_scope_role_match_chk',
      sql`(${t.scopeType} = 'body' AND ${t.roleType} = 'body_leader') OR (${t.scopeType} = 'care' AND ${t.roleType} IN ('care_leader', 'other_authorized')) OR (${t.scopeType} = 'group' AND ${t.roleType} IN ('care_leader', 'coordinator', 'group_leader', 'other_authorized'))`
    ),
    uniqueIndex('assignments_active_primary_body_uidx')
      .on(t.bodyId, t.roleType)
      .where(sql`${t.effectiveTo} IS NULL AND ${t.isPrimary} = true AND ${t.scopeType} = 'body'`),
    uniqueIndex('assignments_active_primary_care_uidx')
      .on(t.careId, t.roleType)
      .where(sql`${t.effectiveTo} IS NULL AND ${t.isPrimary} = true AND ${t.scopeType} = 'care'`),
    uniqueIndex('assignments_active_primary_group_uidx')
      .on(t.groupId, t.roleType)
      .where(sql`${t.effectiveTo} IS NULL AND ${t.isPrimary} = true AND ${t.scopeType} = 'group'`),
    uniqueIndex('assignments_active_user_group_role_uidx')
      .on(t.userId, t.groupId, t.roleType)
      .where(sql`${t.effectiveTo} IS NULL AND ${t.scopeType} = 'group' AND ${t.userId} IS NOT NULL`),
    uniqueIndex('assignments_active_user_care_role_uidx')
      .on(t.userId, t.careId, t.roleType)
      .where(sql`${t.effectiveTo} IS NULL AND ${t.scopeType} = 'care' AND ${t.userId} IS NOT NULL`),
    uniqueIndex('assignments_active_user_body_role_uidx')
      .on(t.userId, t.bodyId, t.roleType)
      .where(sql`${t.effectiveTo} IS NULL AND ${t.scopeType} = 'body' AND ${t.userId} IS NOT NULL`),
    index('assignments_user_active_idx').on(t.userId, t.effectiveTo),
    index('assignments_group_active_idx').on(t.groupId, t.effectiveTo),
    index('assignments_care_active_idx').on(t.careId, t.effectiveTo),
    index('assignments_body_active_idx').on(t.bodyId, t.effectiveTo),
  ]
);

export const memberGrowthRecords = pgTable(
  'member_growth_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => houseMissionGroups.id, { onDelete: 'set null' }),
    conversionDateRaw: text('conversion_date_raw'),
    responseAttitudeRaw: text('response_attitude_raw'),
    groupAttendanceLevelRaw: text('group_attendance_level_raw'),
    discipleshipGoalRaw: text('discipleship_goal_raw'),
    targetTimeframeRaw: text('target_timeframe_raw'),
    disciplerNameRaw: text('discipler_name_raw'),
    disciplerAssignmentId: uuid('discipler_assignment_id').references(() => assignments.id, {
      onDelete: 'set null',
    }),
    verificationStatus: text('verification_status').notNull().default('RAW'),
    sourceBatchId: uuid('source_batch_id'),
    sourceFile: text('source_file'),
    sourceSheet: text('source_sheet'),
    sourceRow: integer('source_row'),
    rawCellsJson: jsonb('raw_cells_json')
      .$type<unknown[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'member_growth_verification_chk',
      sql`${t.verificationStatus} IN ('RAW', 'NORMALIZED', 'VERIFIED', 'PENDING_REVIEW', 'CONFLICT', 'INCOMPLETE')`
    ),
    index('member_growth_member_idx').on(t.memberId),
    index('member_growth_group_idx').on(t.groupId),
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
    bodyId: uuid('body_id').references(() => bodies.id, { onDelete: 'set null' }),
    groupNameSnapshot: text('group_name_snapshot').notNull(),
    bodyNameSnapshot: text('body_name_snapshot').notNull().default('รอจัดสรรบอดี้'),
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
    bodyId: uuid('body_id').references(() => bodies.id, { onDelete: 'set null' }),
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

// --- Phase 2: Controlled Import, Staging, Data Quality & Mapping Tables ---

export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    batchCode: text('batch_code').notNull().unique(),
    sourceArchiveName: text('source_archive_name').notNull(),
    fileSha256: text('file_sha256').notNull().unique(),
    selectionPolicyVersion: text('selection_policy_version').notNull().default('1.0'),
    status: text('status').notNull().default('uploaded'),
    summaryJson: jsonb('summary_json').$type<Record<string, unknown>>().notNull().default({}),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rolledBackAt: timestamp('rolled_back_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'import_batches_status_chk',
      sql`${t.status} IN ('uploaded', 'validated', 'staged', 'review_in_progress', 'partially_promoted', 'promoted', 'rolled_back', 'failed')`
    ),
    index('import_batches_status_idx').on(t.status),
  ]
);

export const stagingGroups = pgTable(
  'staging_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id, { onDelete: 'cascade' }),
    groupRef: text('group_ref').notNull(),
    sourceFile: text('source_file').notNull(),
    sourceSheet: text('source_sheet').notNull(),
    rowSha256: text('row_sha256').notNull(),
    groupNameFromSheetRaw: text('group_name_from_sheet_raw').notNull(),
    formTitleRaw: text('form_title_raw'),
    districtRaw: text('district_raw'),
    districtNormalized: text('district_normalized'),
    subdistrictRaw: text('subdistrict_raw'),
    villageRaw: text('village_raw'),
    meetingDayRaw: text('meeting_day_raw'),
    meetingTimeStartRaw: text('meeting_time_start_raw'),
    meetingTimeEndRaw: text('meeting_time_end_raw'),
    meetingPlaceRaw: text('meeting_place_raw'),
    leaderRaw: text('leader_raw'),
    coordinatorRaw: text('coordinator_raw'),
    careLabelRaw: text('care_label_raw'),
    careCodeRaw: text('care_code_raw'),
    registeredTotalRaw: text('registered_total_raw'),
    memberRowCountDerived: integer('member_row_count_derived').notNull().default(0),
    dataStatus: text('data_status').notNull().default('raw'),
    promotedGroupId: uuid('promoted_group_id').references(() => houseMissionGroups.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('staging_groups_batch_sha_uidx').on(t.batchId, t.rowSha256),
    uniqueIndex('staging_groups_batch_ref_uidx').on(t.batchId, t.groupRef),
    check(
      'staging_groups_status_chk',
      sql`${t.dataStatus} IN ('raw', 'normalized', 'pending_review', 'conflict', 'incomplete', 'approved', 'rejected', 'promoted')`
    ),
    index('staging_groups_batch_status_idx').on(t.batchId, t.dataStatus),
  ]
);

export const stagingMemberRows = pgTable(
  'staging_member_rows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id, { onDelete: 'cascade' }),
    stagingGroupId: uuid('staging_group_id')
      .notNull()
      .references(() => stagingGroups.id, { onDelete: 'cascade' }),
    memberRowRef: text('member_row_ref').notNull(),
    sourceFile: text('source_file').notNull(),
    sourceSheet: text('source_sheet').notNull(),
    sourceRow: integer('source_row').notNull(),
    rowSha256: text('row_sha256').notNull(),
    fullNameRaw: text('full_name_raw'),
    nicknameRaw: text('nickname_raw'),
    ageRaw: text('age_raw'),
    occupationRaw: text('occupation_raw'),
    locationRaw: text('location_raw'),
    rawCellsJson: jsonb('raw_cells_json').$type<Record<string, unknown>>().notNull().default({}),
    dataStatus: text('data_status').notNull().default('raw'),
    duplicateCandidateOfMemberId: uuid('duplicate_candidate_of_member_id').references(
      () => members.id,
      { onDelete: 'set null' }
    ),
    promotedMemberId: uuid('promoted_member_id').references(() => members.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('staging_members_batch_sha_uidx').on(t.batchId, t.rowSha256),
    uniqueIndex('staging_members_batch_ref_uidx').on(t.batchId, t.memberRowRef),
    check(
      'staging_members_status_chk',
      sql`${t.dataStatus} IN ('raw', 'normalized', 'pending_review', 'conflict', 'incomplete', 'approved', 'rejected', 'promoted')`
    ),
    index('staging_members_batch_status_idx').on(t.batchId, t.dataStatus),
  ]
);

export const dataQualityIssues = pgTable(
  'data_quality_issues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    batchId: uuid('batch_id').references(() => importBatches.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    issueCode: text('issue_code').notNull(),
    severity: text('severity').notNull().default('review'),
    status: text('status').notNull().default('open'),
    summarySafeText: text('summary_safe_text').notNull(),
    proposedValueJson: jsonb('proposed_value_json').$type<Record<string, unknown>>(),
    resolutionNote: text('resolution_note'),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'dq_target_type_chk',
      sql`${t.targetType} IN ('staging_group', 'staging_member', 'group', 'member')`
    ),
    check('dq_severity_chk', sql`${t.severity} IN ('info', 'review', 'blocking')`),
    check(
      'dq_status_chk',
      sql`${t.status} IN ('open', 'approved_fix', 'rejected', 'resolved', 'deferred')`
    ),
    index('dq_issues_status_code_idx').on(t.status, t.issueCode, t.batchId),
  ]
);

/**
 * Immutable decision history for data-quality issues.
 * A row is never updated or deleted (database trigger). A later decision supersedes an earlier one
 * through supersedesDecisionId. A reversal is a decision of type 'reversed'. The head of the chain is
 * the decision that no other decision supersedes. Two partial unique indexes make a concurrent
 * second decision on the same head fail instead of overwriting.
 */
export const dataQualityDecisions = pgTable(
  'data_quality_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => dataQualityIssues.id, { onDelete: 'restrict' }),
    decisionType: text('decision_type').notNull(),
    supersedesDecisionId: uuid('supersedes_decision_id'),
    reason: text('reason').notNull(),
    decidedByUserId: uuid('decided_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'dq_decision_type_chk',
      sql`${t.decisionType} IN ('approved_fix', 'rejected', 'resolved', 'deferred', 'reversed')`
    ),
    check('dq_decision_reason_chk', sql`length(btrim(${t.reason})) > 0`),
    foreignKey({
      columns: [t.supersedesDecisionId],
      foreignColumns: [t.id],
      name: 'dq_decision_supersedes_fk',
    }).onDelete('restrict'),
    // One first decision per issue.
    uniqueIndex('dq_decision_root_uq')
      .on(t.issueId)
      .where(sql`${t.supersedesDecisionId} IS NULL`),
    // One successor per decision: this is the concurrency guard.
    uniqueIndex('dq_decision_successor_uq')
      .on(t.supersedesDecisionId)
      .where(sql`${t.supersedesDecisionId} IS NOT NULL`),
    index('dq_decision_issue_idx').on(t.issueId, t.decidedAt),
  ]
);

export const districtCanonicalMappings = pgTable('district_canonical_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  districtRaw: text('district_raw').notNull().unique(),
  districtCanonical: text('district_canonical').notNull(),
  province: text('province').notNull().default('กาฬสินธุ์'),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const careBodyMappings = pgTable('care_body_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  careCodeRaw: text('care_code_raw').notNull().unique(),
  bodyId: uuid('body_id')
    .notNull()
    .references(() => bodies.id, { onDelete: 'cascade' }),
  notes: text('notes'),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const candidateLocationMatches = pgTable(
  'candidate_location_matches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id').references(() => houseMissionGroups.id, { onDelete: 'cascade' }),
    stagingGroupId: uuid('staging_group_id').references(() => stagingGroups.id, {
      onDelete: 'cascade',
    }),
    candidateSource: text('candidate_source').notNull().default('kalasin-field-points'),
    candidateNo: integer('candidate_no').notNull(),
    candidateName: text('candidate_name').notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    matchStatus: text('match_status').notNull().default('pending'),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'candidate_loc_target_chk',
      sql`${t.groupId} IS NOT NULL OR ${t.stagingGroupId} IS NOT NULL`
    ),
    check(
      'candidate_loc_status_chk',
      sql`${t.matchStatus} IN ('pending', 'confirmed', 'rejected')`
    ),
    index('candidate_loc_status_idx').on(t.matchStatus),
  ]
);

/** One-time challenges for LINE identity flows. The raw nonce is never stored. */
export const authChallenges = pgTable(
  'auth_challenges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    purpose: text('purpose').notNull(),
    nonceHash: text('nonce_hash').notNull().unique(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    ipAddress: text('ip_address'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'auth_challenges_purpose_chk',
      sql`${t.purpose} IN ('line_link', 'line_login', 'line_register', 'passkey_register', 'passkey_login')`
    ),
    index('auth_challenges_expires_idx').on(t.expiresAt),
  ]
);

/** LINE-first registration requests. A request grants nothing until a super_admin approves it. */
export const lineRegistrationRequests = pgTable(
  'line_registration_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    lineSubject: text('line_subject').notNull(),
    lineDisplayName: text('line_display_name'),
    requestedName: text('requested_name').notNull(),
    note: text('note'),
    status: text('status').notNull().default('pending'),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewReason: text('review_reason'),
    createdUserId: uuid('created_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'line_registration_status_chk',
      sql`${t.status} IN ('pending', 'approved', 'rejected')`
    ),
    uniqueIndex('line_registration_pending_subject_uidx')
      .on(t.lineSubject)
      .where(sql`${t.status} = 'pending'`),
    index('line_registration_status_idx').on(t.status, t.createdAt),
  ]
);

/** Hashes of LINE ID tokens that were already used. LIFF tokens have no nonce, so each token is single-use. */
export const usedIdTokens = pgTable(
  'used_id_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('used_id_tokens_expires_idx').on(t.expiresAt)]
);
