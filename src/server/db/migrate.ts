import type { DbRuntime } from './client';

export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name TEXT NOT NULL,
  pilot_province TEXT NOT NULL DEFAULT 'กาฬสินธุ์',
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  period_start_day TEXT NOT NULL DEFAULT 'monday',
  deadline_weekday TEXT NOT NULL DEFAULT 'sunday',
  deadline_time_local TEXT NOT NULL DEFAULT '20:00',
  brief_weekday TEXT NOT NULL DEFAULT 'sunday',
  brief_time_local TEXT NOT NULL DEFAULT '20:30',
  retention_months INTEGER NOT NULL DEFAULT 36,
  updated_by_user_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_code TEXT NOT NULL UNIQUE,
  full_name TEXT,
  nickname TEXT,
  display_name TEXT NOT NULL,
  age_raw TEXT,
  occupation_raw TEXT,
  location_text_raw TEXT,
  phone_e164 TEXT,
  line_user_id TEXT,
  email TEXT,
  source_sequence_no TEXT,
  study_workplace_raw TEXT,
  family_status_raw TEXT,
  membership_status TEXT NOT NULL DEFAULT 'active',
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  privacy_consent_status TEXT NOT NULL DEFAULT 'consented',
  consent_recorded_at TIMESTAMPTZ,
  source_batch_id UUID,
  source_row_ref TEXT,
  source_provenance JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT members_identity_chk CHECK (full_name IS NOT NULL OR nickname IS NOT NULL),
  CONSTRAINT members_status_chk CHECK (membership_status IN ('active', 'inactive', 'transferred', 'archived')),
  CONSTRAINT members_verification_chk CHECK (verification_status IN ('unverified', 'pending_review', 'verified')),
  CONSTRAINT members_consent_chk CHECK (privacy_consent_status IN ('consented', 'pending', 'withdrawn'))
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT,
  phone_e164 TEXT,
  system_role TEXT NOT NULL DEFAULT 'standard_user',
  status TEXT NOT NULL DEFAULT 'pending_activation',
  password_hash TEXT,
  line_user_id TEXT,
  preferred_ui_mode TEXT NOT NULL DEFAULT 'auto',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_system_role_chk CHECK (system_role IN ('super_admin', 'admin', 'mission_leader', 'standard_user')),
  CONSTRAINT users_status_chk CHECK (status IN ('pending_activation', 'active', 'suspended', 'revoked'))
);
CREATE INDEX IF NOT EXISTS users_status_idx ON users(status);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT NOT NULL,
  auth_method TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);

CREATE TABLE IF NOT EXISTS external_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS external_identities_active_provider_sub_uidx
  ON external_identities(provider, provider_subject) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS external_identities_user_idx ON external_identities(user_id);

CREATE TABLE IF NOT EXISTS user_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key_b64 TEXT NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0,
  device_label TEXT NOT NULL DEFAULT 'อุปกรณ์หลัก',
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS user_passkeys_user_idx ON user_passkeys(user_id);

CREATE TABLE IF NOT EXISTS bodies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_th TEXT NOT NULL,
  name_en TEXT,
  region TEXT NOT NULL DEFAULT 'ภาคตะวันออกเฉียงเหนือ',
  province TEXT NOT NULL DEFAULT 'กาฬสินธุ์',
  status TEXT NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bodies_status_chk CHECK (status IN ('active', 'inactive', 'archived'))
);

CREATE TABLE IF NOT EXISTS cares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_code TEXT NOT NULL UNIQUE,
  care_name TEXT,
  team_name TEXT,
  body_id UUID REFERENCES bodies(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'provisional',
  source_batch_id UUID,
  source_ref TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cares_status_chk CHECK (status IN ('provisional', 'active', 'pending_assignment', 'inactive', 'archived'))
);
CREATE INDEX IF NOT EXISTS cares_body_idx ON cares(body_id);
CREATE INDEX IF NOT EXISTS cares_status_idx ON cares(status);

CREATE TABLE IF NOT EXISTS team_field_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_code TEXT NOT NULL DEFAULT 'G',
  point_no INTEGER NOT NULL,
  point_name TEXT NOT NULL,
  coordinator_name TEXT,
  phone_raw TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  maps_url TEXT,
  source_sheet TEXT NOT NULL DEFAULT 'kalasin-field-points',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT team_field_points_coords_chk CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);
CREATE UNIQUE INDEX IF NOT EXISTS team_field_points_team_no_uidx ON team_field_points(team_code, point_no);

CREATE TABLE IF NOT EXISTS house_mission_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code TEXT NOT NULL UNIQUE,
  body_id UUID REFERENCES bodies(id) ON DELETE SET NULL,
  care_id UUID REFERENCES cares(id) ON DELETE SET NULL,
  team_name TEXT,
  name_th TEXT NOT NULL,
  name_en TEXT,
  group_name_from_sheet TEXT,
  form_title TEXT,
  care_code_raw TEXT,
  registered_total_raw TEXT,
  registered_total_int INTEGER,
  district TEXT NOT NULL,
  district_raw TEXT,
  subdistrict TEXT,
  village TEXT,
  province TEXT NOT NULL DEFAULT 'กาฬสินธุ์',
  address_summary TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  map_url_raw TEXT,
  group_photo_url TEXT,
  meeting_day_of_week INTEGER,
  meeting_day_raw TEXT,
  meeting_time_local TEXT,
  meeting_time_raw TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  assignment_status TEXT NOT NULL DEFAULT 'assigned',
  location_status TEXT NOT NULL DEFAULT 'verified',
  verification_status TEXT NOT NULL DEFAULT 'RAW',
  target_attendance INTEGER NOT NULL DEFAULT 12,
  source_batch_id UUID,
  source_ref TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT groups_status_chk CHECK (status IN ('active', 'inactive', 'merged', 'archived', 'pending_activation')),
  CONSTRAINT groups_assignment_status_chk CHECK (assignment_status IN ('assigned', 'pending_assignment')),
  CONSTRAINT groups_location_status_chk CHECK (location_status IN ('verified', 'pending_location')),
  CONSTRAINT groups_verification_status_chk CHECK (verification_status IN ('RAW', 'NORMALIZED', 'VERIFIED', 'PENDING_REVIEW', 'CONFLICT', 'INCOMPLETE')),
  CONSTRAINT groups_meeting_day_chk CHECK (meeting_day_of_week IS NULL OR meeting_day_of_week BETWEEN 1 AND 7),
  CONSTRAINT groups_coords_pair_chk CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);
CREATE INDEX IF NOT EXISTS groups_body_idx ON house_mission_groups(body_id);
CREATE INDEX IF NOT EXISTS groups_status_idx ON house_mission_groups(status);
CREATE INDEX IF NOT EXISTS groups_district_idx ON house_mission_groups(district);

CREATE TABLE IF NOT EXISTS reporting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_key TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  deadline_at TIMESTAMPTZ NOT NULL,
  brief_scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reporting_periods_status_chk CHECK (status IN ('open', 'cutoff_reached', 'brief_published', 'closed'))
);

CREATE TABLE IF NOT EXISTS group_body_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES house_mission_groups(id) ON DELETE CASCADE,
  from_body_id UUID NOT NULL REFERENCES bodies(id) ON DELETE RESTRICT,
  to_body_id UUID NOT NULL REFERENCES bodies(id) ON DELETE RESTRICT,
  effective_period_id UUID REFERENCES reporting_periods(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  transferred_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS group_transfers_group_idx ON group_body_transfers(group_id);

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  steward_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  steward_display_name TEXT,
  link_status TEXT NOT NULL DEFAULT 'linked_user',
  source_role_label TEXT,
  scope_type TEXT NOT NULL,
  body_id UUID REFERENCES bodies(id) ON DELETE CASCADE,
  care_id UUID REFERENCES cares(id) ON DELETE CASCADE,
  group_id UUID REFERENCES house_mission_groups(id) ON DELETE CASCADE,
  role_type TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assignments_steward_identity_chk CHECK (
    user_id IS NOT NULL OR steward_member_id IS NOT NULL OR (steward_display_name IS NOT NULL AND length(trim(steward_display_name)) > 0)
  ),
  CONSTRAINT assignments_link_status_chk CHECK (link_status IN ('linked_user', 'unlinked_pending_account')),
  CONSTRAINT assignments_scope_chk CHECK (
    (scope_type = 'body' AND body_id IS NOT NULL AND care_id IS NULL AND group_id IS NULL)
    OR (scope_type = 'care' AND care_id IS NOT NULL AND body_id IS NULL AND group_id IS NULL)
    OR (scope_type = 'group' AND group_id IS NOT NULL AND body_id IS NULL AND care_id IS NULL)
  ),
  CONSTRAINT assignments_role_chk CHECK (role_type IN ('body_leader', 'care_leader', 'coordinator', 'group_leader', 'other_authorized')),
  CONSTRAINT assignments_scope_role_match_chk CHECK (
    (scope_type = 'body' AND role_type = 'body_leader')
    OR (scope_type = 'care' AND role_type IN ('care_leader', 'other_authorized'))
    OR (scope_type = 'group' AND role_type IN ('care_leader', 'coordinator', 'group_leader', 'other_authorized'))
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS assignments_active_primary_body_uidx
  ON assignments(body_id, role_type) WHERE effective_to IS NULL AND is_primary = true AND scope_type = 'body';
CREATE UNIQUE INDEX IF NOT EXISTS assignments_active_primary_group_uidx
  ON assignments(group_id, role_type) WHERE effective_to IS NULL AND is_primary = true AND scope_type = 'group';
CREATE UNIQUE INDEX IF NOT EXISTS assignments_active_user_group_role_uidx
  ON assignments(user_id, group_id, role_type) WHERE effective_to IS NULL AND scope_type = 'group' AND user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS assignments_active_user_body_role_uidx
  ON assignments(user_id, body_id, role_type) WHERE effective_to IS NULL AND scope_type = 'body' AND user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS assignments_user_active_idx ON assignments(user_id, effective_to);
CREATE INDEX IF NOT EXISTS assignments_group_active_idx ON assignments(group_id, effective_to);
CREATE INDEX IF NOT EXISTS assignments_body_active_idx ON assignments(body_id, effective_to);

CREATE TABLE IF NOT EXISTS member_growth_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  group_id UUID REFERENCES house_mission_groups(id) ON DELETE SET NULL,
  conversion_date_raw TEXT,
  response_attitude_raw TEXT,
  group_attendance_level_raw TEXT,
  discipleship_goal_raw TEXT,
  target_timeframe_raw TEXT,
  discipler_name_raw TEXT,
  discipler_assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
  verification_status TEXT NOT NULL DEFAULT 'RAW',
  source_batch_id UUID,
  source_file TEXT,
  source_sheet TEXT,
  source_row INTEGER,
  raw_cells_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT member_growth_verification_chk CHECK (
    verification_status IN ('RAW', 'NORMALIZED', 'VERIFIED', 'PENDING_REVIEW', 'CONFLICT', 'INCOMPLETE')
  )
);
CREATE INDEX IF NOT EXISTS member_growth_member_idx ON member_growth_records(member_id);
CREATE INDEX IF NOT EXISTS member_growth_group_idx ON member_growth_records(group_id);

CREATE TABLE IF NOT EXISTS group_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES house_mission_groups(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  membership_role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS group_memberships_active_uidx
  ON group_memberships(group_id, member_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS group_memberships_group_idx ON group_memberships(group_id);

CREATE TABLE IF NOT EXISTS visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  nickname TEXT,
  phone_e164 TEXT,
  line_user_id TEXT,
  consent_for_contact BOOLEAN NOT NULL DEFAULT false,
  consent_recorded_at TIMESTAMPTZ,
  consent_captured_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  first_origin_group_id UUID REFERENCES house_mission_groups(id) ON DELETE SET NULL,
  visit_count INTEGER NOT NULL DEFAULT 1,
  converted_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT visitors_pdpa_consent_chk CHECK (phone_e164 IS NULL OR consent_for_contact = true)
);

CREATE TABLE IF NOT EXISTS period_group_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES reporting_periods(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES house_mission_groups(id) ON DELETE RESTRICT,
  body_id UUID REFERENCES bodies(id) ON DELETE SET NULL,
  group_name_snapshot TEXT NOT NULL,
  body_name_snapshot TEXT NOT NULL DEFAULT 'รอจัดสรรบอดี้',
  district_snapshot TEXT NOT NULL,
  group_status_snapshot TEXT NOT NULL,
  target_attendance_snapshot INTEGER NOT NULL DEFAULT 12,
  expected_report BOOLEAN NOT NULL DEFAULT true,
  primary_group_leader_user_id UUID,
  supervisor_user_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS period_group_snapshots_period_group_uidx
  ON period_group_snapshots(period_id, group_id);
CREATE INDEX IF NOT EXISTS period_group_snapshots_body_idx
  ON period_group_snapshots(period_id, body_id);

CREATE TABLE IF NOT EXISTS weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES reporting_periods(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES period_group_snapshots(id) ON DELETE SET NULL,
  group_id UUID NOT NULL REFERENCES house_mission_groups(id) ON DELETE RESTRICT,
  body_id UUID REFERENCES bodies(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  meeting_held BOOLEAN,
  not_held_reason TEXT,
  meeting_date DATE,
  total_attendees INTEGER NOT NULL DEFAULT 0,
  member_attendees INTEGER NOT NULL DEFAULT 0,
  new_visitors_count INTEGER NOT NULL DEFAULT 0,
  returning_visitors_count INTEGER NOT NULL DEFAULT 0,
  children_count INTEGER NOT NULL DEFAULT 0,
  offering_amount_thb NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  summary_notes TEXT,
  prayer_requests TEXT,
  care_needs_notes TEXT,
  is_late BOOLEAN NOT NULL DEFAULT false,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  blocked_reason TEXT,
  blocked_at TIMESTAMPTZ,
  requires_supervisor_review BOOLEAN NOT NULL DEFAULT false,
  submitted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  supervisor_reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  supervisor_reviewed_at TIMESTAMPTZ,
  supervisor_notes TEXT,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  revision_requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  revision_requested_at TIMESTAMPTZ,
  revision_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wr_status_chk CHECK (status IN ('draft', 'submitted', 'under_review', 'needs_revision', 'approved')),
  CONSTRAINT wr_non_negative_counts_chk CHECK (
    total_attendees >= 0 AND member_attendees >= 0 AND new_visitors_count >= 0 AND returning_visitors_count >= 0 AND children_count >= 0
  ),
  CONSTRAINT wr_no_self_approval_chk CHECK (
    approved_by_user_id IS NULL OR submitted_by_user_id IS NULL OR approved_by_user_id <> submitted_by_user_id
  ),
  CONSTRAINT wr_sequential_review_chk CHECK (
    status <> 'approved' OR requires_supervisor_review = false OR supervisor_reviewed_at IS NOT NULL
  ),
  CONSTRAINT wr_approved_fields_chk CHECK (
    (status = 'approved' AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL AND is_blocked = false)
    OR status <> 'approved'
  ),
  CONSTRAINT wr_revision_reason_chk CHECK (
    status <> 'needs_revision' OR (revision_reason IS NOT NULL AND length(trim(revision_reason)) > 0)
  ),
  CONSTRAINT wr_submitted_meeting_held_chk CHECK (
    status = 'draft' OR meeting_held IS NOT NULL
  ),
  CONSTRAINT wr_not_held_reason_chk CHECK (
    status = 'draft' OR meeting_held = true OR (not_held_reason IS NOT NULL AND length(trim(not_held_reason)) > 0)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS weekly_reports_period_group_uidx ON weekly_reports(period_id, group_id);
CREATE INDEX IF NOT EXISTS weekly_reports_body_status_idx ON weekly_reports(body_id, status);
CREATE INDEX IF NOT EXISTS weekly_reports_blocked_idx ON weekly_reports(is_blocked);

CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_report_id UUID NOT NULL REFERENCES weekly_reports(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  attendance_status TEXT NOT NULL DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attendance_status_chk CHECK (attendance_status IN ('present', 'absent', 'excused'))
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_report_member_uidx
  ON attendance_records(weekly_report_id, member_id);

CREATE TABLE IF NOT EXISTS visitor_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES house_mission_groups(id) ON DELETE CASCADE,
  weekly_report_id UUID REFERENCES weekly_reports(id) ON DELETE SET NULL,
  period_id UUID NOT NULL REFERENCES reporting_periods(id) ON DELETE CASCADE,
  visit_type TEXT NOT NULL,
  visited_on DATE NOT NULL,
  recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT visitor_visits_type_chk CHECK (visit_type IN ('new_visitor', 'returning_visitor'))
);
CREATE INDEX IF NOT EXISTS visitor_visits_group_period_idx ON visitor_visits(group_id, period_id);

CREATE TABLE IF NOT EXISTS follow_up_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES house_mission_groups(id) ON DELETE CASCADE,
  visitor_id UUID REFERENCES visitors(id) ON DELETE SET NULL,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  source_report_id UUID REFERENCES weekly_reports(id) ON DELETE SET NULL,
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT follow_up_status_chk CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS follow_up_group_status_idx ON follow_up_items(group_id, status);

CREATE TABLE IF NOT EXISTS report_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_report_id UUID NOT NULL REFERENCES weekly_reports(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES reporting_periods(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES house_mission_groups(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS report_audit_report_idx ON report_audit_events(weekly_report_id, created_at);

CREATE TABLE IF NOT EXISTS meeting_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL UNIQUE REFERENCES reporting_periods(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by_job BOOLEAN NOT NULL DEFAULT false,
  generated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_immutable BOOLEAN NOT NULL DEFAULT true,
  sections_json JSONB NOT NULL,
  metrics_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'in_app',
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id TEXT,
  dedupe_key TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_uidx ON notifications(user_id, dedupe_key);
CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS line_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line_user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  message_text TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued',
  provider_response JSONB,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT line_dispatches_status_chk CHECK (status IN ('queued', 'sent', 'simulated_sent', 'failed', 'skipped_unlinked'))
);

CREATE TABLE IF NOT EXISTS security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  ip_address TEXT,
  outcome TEXT NOT NULL DEFAULT 'success',
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT security_audit_outcome_chk CHECK (outcome IN ('success', 'denied', 'error'))
);
CREATE INDEX IF NOT EXISTS security_audit_created_idx ON security_audit_logs(created_at);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idempotency_scope_key_uidx ON idempotency_keys(scope_key, idempotency_key);
CREATE INDEX IF NOT EXISTS idempotency_expires_idx ON idempotency_keys(expires_at);

CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit table % is append-only and immutable', TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_report_audit_immutable ON report_audit_events;
CREATE TRIGGER trg_report_audit_immutable
  BEFORE UPDATE OR DELETE ON report_audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

DROP TRIGGER IF EXISTS trg_security_audit_immutable ON security_audit_logs;
CREATE TRIGGER trg_security_audit_immutable
  BEFORE UPDATE OR DELETE ON security_audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE OR REPLACE FUNCTION prevent_immutable_brief_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.is_immutable = true) THEN
    RAISE EXCEPTION 'Immutable meeting brief cannot be modified or deleted'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_meeting_brief_immutable ON meeting_briefs;
CREATE TRIGGER trg_meeting_brief_immutable
  BEFORE UPDATE OR DELETE ON meeting_briefs
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_brief_mutation();

-- Phase 2: Staging, Data Quality & Mapping Tables
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code TEXT NOT NULL UNIQUE,
  source_archive_name TEXT NOT NULL,
  file_sha256 TEXT NOT NULL UNIQUE,
  selection_policy_version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'uploaded',
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT import_batches_status_chk CHECK (
    status IN ('uploaded', 'validated', 'staged', 'review_in_progress', 'partially_promoted', 'promoted', 'rolled_back', 'failed')
  )
);
CREATE INDEX IF NOT EXISTS import_batches_status_idx ON import_batches(status);

CREATE TABLE IF NOT EXISTS staging_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  group_ref TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_sheet TEXT NOT NULL,
  row_sha256 TEXT NOT NULL,
  group_name_from_sheet_raw TEXT NOT NULL,
  form_title_raw TEXT,
  district_raw TEXT,
  district_normalized TEXT,
  subdistrict_raw TEXT,
  village_raw TEXT,
  meeting_day_raw TEXT,
  meeting_time_start_raw TEXT,
  meeting_time_end_raw TEXT,
  meeting_place_raw TEXT,
  leader_raw TEXT,
  coordinator_raw TEXT,
  care_label_raw TEXT,
  care_code_raw TEXT,
  registered_total_raw TEXT,
  member_row_count_derived INTEGER NOT NULL DEFAULT 0,
  data_status TEXT NOT NULL DEFAULT 'raw',
  promoted_group_id UUID REFERENCES house_mission_groups(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staging_groups_status_chk CHECK (
    data_status IN ('raw', 'normalized', 'pending_review', 'conflict', 'incomplete', 'approved', 'rejected', 'promoted')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS staging_groups_batch_sha_uidx ON staging_groups(batch_id, row_sha256);
CREATE UNIQUE INDEX IF NOT EXISTS staging_groups_batch_ref_uidx ON staging_groups(batch_id, group_ref);
CREATE INDEX IF NOT EXISTS staging_groups_batch_status_idx ON staging_groups(batch_id, data_status);

CREATE TABLE IF NOT EXISTS staging_member_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  staging_group_id UUID NOT NULL REFERENCES staging_groups(id) ON DELETE CASCADE,
  member_row_ref TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  row_sha256 TEXT NOT NULL,
  full_name_raw TEXT,
  nickname_raw TEXT,
  age_raw TEXT,
  occupation_raw TEXT,
  location_raw TEXT,
  raw_cells_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_status TEXT NOT NULL DEFAULT 'raw',
  duplicate_candidate_of_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  promoted_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staging_members_status_chk CHECK (
    data_status IN ('raw', 'normalized', 'pending_review', 'conflict', 'incomplete', 'approved', 'rejected', 'promoted')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS staging_members_batch_sha_uidx ON staging_member_rows(batch_id, row_sha256);
CREATE UNIQUE INDEX IF NOT EXISTS staging_members_batch_ref_uidx ON staging_member_rows(batch_id, member_row_ref);
CREATE INDEX IF NOT EXISTS staging_members_batch_status_idx ON staging_member_rows(batch_id, data_status);

CREATE TABLE IF NOT EXISTS data_quality_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES import_batches(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  issue_code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'review',
  status TEXT NOT NULL DEFAULT 'open',
  summary_safe_text TEXT NOT NULL,
  proposed_value_json JSONB,
  resolution_note TEXT,
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dq_target_type_chk CHECK (target_type IN ('staging_group', 'staging_member', 'group', 'member')),
  CONSTRAINT dq_severity_chk CHECK (severity IN ('info', 'review', 'blocking')),
  CONSTRAINT dq_status_chk CHECK (status IN ('open', 'approved_fix', 'rejected', 'resolved', 'deferred'))
);
CREATE INDEX IF NOT EXISTS dq_issues_status_code_idx ON data_quality_issues(status, issue_code, batch_id);

CREATE TABLE IF NOT EXISTS district_canonical_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  district_raw TEXT NOT NULL UNIQUE,
  district_canonical TEXT NOT NULL,
  province TEXT NOT NULL DEFAULT 'กาฬสินธุ์',
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS care_body_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_code_raw TEXT NOT NULL UNIQUE,
  body_id UUID NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
  notes TEXT,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidate_location_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES house_mission_groups(id) ON DELETE CASCADE,
  staging_group_id UUID REFERENCES staging_groups(id) ON DELETE CASCADE,
  candidate_source TEXT NOT NULL DEFAULT 'kalasin-field-points',
  candidate_no INTEGER NOT NULL,
  candidate_name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  match_status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_loc_target_chk CHECK (group_id IS NOT NULL OR staging_group_id IS NOT NULL),
  CONSTRAINT candidate_loc_status_chk CHECK (match_status IN ('pending', 'confirmed', 'rejected'))
);
CREATE INDEX IF NOT EXISTS candidate_loc_status_idx ON candidate_location_matches(match_status);

-- Idempotent Phase 2 upgrades for pre-existing databases
ALTER TABLE members ALTER COLUMN full_name DROP NOT NULL;
ALTER TABLE members ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS age_raw TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS occupation_raw TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS location_text_raw TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE members ADD COLUMN IF NOT EXISTS source_batch_id UUID;
ALTER TABLE members ADD COLUMN IF NOT EXISTS source_row_ref TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS source_provenance JSONB;
ALTER TABLE members ADD COLUMN IF NOT EXISTS source_sequence_no TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS study_workplace_raw TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS family_status_raw TEXT;

ALTER TABLE house_mission_groups ALTER COLUMN body_id DROP NOT NULL;
ALTER TABLE house_mission_groups ALTER COLUMN address_summary DROP NOT NULL;
ALTER TABLE house_mission_groups ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE house_mission_groups ALTER COLUMN longitude DROP NOT NULL;
ALTER TABLE house_mission_groups ALTER COLUMN meeting_day_of_week DROP NOT NULL;
ALTER TABLE house_mission_groups ALTER COLUMN meeting_day_of_week DROP DEFAULT;
ALTER TABLE house_mission_groups ALTER COLUMN meeting_time_local DROP NOT NULL;
ALTER TABLE house_mission_groups ALTER COLUMN meeting_time_local DROP DEFAULT;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS group_name_from_sheet TEXT;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS form_title TEXT;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS care_code_raw TEXT;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS village TEXT;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS meeting_time_raw TEXT;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS assignment_status TEXT NOT NULL DEFAULT 'assigned';
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS location_status TEXT NOT NULL DEFAULT 'verified';
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS source_batch_id UUID;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS source_ref TEXT;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS care_id UUID REFERENCES cares(id) ON DELETE SET NULL;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS team_name TEXT;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS registered_total_raw TEXT;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS registered_total_int INTEGER;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS district_raw TEXT;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS map_url_raw TEXT;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS group_photo_url TEXT;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS meeting_day_raw TEXT;
ALTER TABLE house_mission_groups ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'RAW';
CREATE INDEX IF NOT EXISTS groups_care_idx ON house_mission_groups(care_id);
CREATE INDEX IF NOT EXISTS groups_assignment_body_idx ON house_mission_groups(assignment_status, body_id);
CREATE INDEX IF NOT EXISTS groups_location_status_idx ON house_mission_groups(location_status);

ALTER TABLE assignments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS steward_member_id UUID REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS steward_display_name TEXT;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS link_status TEXT NOT NULL DEFAULT 'linked_user';
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS source_role_label TEXT;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS care_id UUID REFERENCES cares(id) ON DELETE CASCADE;
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_scope_chk;
ALTER TABLE assignments ADD CONSTRAINT assignments_scope_chk CHECK (
  (scope_type = 'body' AND body_id IS NOT NULL AND care_id IS NULL AND group_id IS NULL)
  OR (scope_type = 'care' AND care_id IS NOT NULL AND body_id IS NULL AND group_id IS NULL)
  OR (scope_type = 'group' AND group_id IS NOT NULL AND body_id IS NULL AND care_id IS NULL)
);
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_scope_role_match_chk;
ALTER TABLE assignments ADD CONSTRAINT assignments_scope_role_match_chk CHECK (
  (scope_type = 'body' AND role_type = 'body_leader')
  OR (scope_type = 'care' AND role_type IN ('care_leader', 'other_authorized'))
  OR (scope_type = 'group' AND role_type IN ('care_leader', 'coordinator', 'group_leader', 'other_authorized'))
);
CREATE UNIQUE INDEX IF NOT EXISTS assignments_active_primary_care_uidx
  ON assignments(care_id, role_type) WHERE effective_to IS NULL AND is_primary = true AND scope_type = 'care';
CREATE UNIQUE INDEX IF NOT EXISTS assignments_active_user_care_role_uidx
  ON assignments(user_id, care_id, role_type) WHERE effective_to IS NULL AND scope_type = 'care' AND user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS assignments_care_active_idx ON assignments(care_id, effective_to);

ALTER TABLE period_group_snapshots ALTER COLUMN body_id DROP NOT NULL;
ALTER TABLE period_group_snapshots ALTER COLUMN body_name_snapshot SET DEFAULT 'รอจัดสรรบอดี้';
ALTER TABLE weekly_reports ALTER COLUMN body_id DROP NOT NULL;
`;

export async function ensureSchema(runtime: DbRuntime): Promise<void> {
  await runtime.execRaw(SCHEMA_DDL);
}
