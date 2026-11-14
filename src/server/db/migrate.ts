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
  full_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  phone_e164 TEXT,
  line_user_id TEXT,
  email TEXT,
  membership_status TEXT NOT NULL DEFAULT 'active',
  privacy_consent_status TEXT NOT NULL DEFAULT 'consented',
  consent_recorded_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT members_status_chk CHECK (membership_status IN ('active', 'inactive', 'transferred', 'archived')),
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

CREATE TABLE IF NOT EXISTS house_mission_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code TEXT NOT NULL UNIQUE,
  body_id UUID NOT NULL REFERENCES bodies(id) ON DELETE RESTRICT,
  name_th TEXT NOT NULL,
  name_en TEXT,
  district TEXT NOT NULL,
  subdistrict TEXT,
  province TEXT NOT NULL DEFAULT 'กาฬสินธุ์',
  address_summary TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  meeting_day_of_week INTEGER NOT NULL DEFAULT 5,
  meeting_time_local TEXT NOT NULL DEFAULT '19:00',
  status TEXT NOT NULL DEFAULT 'active',
  target_attendance INTEGER NOT NULL DEFAULT 12,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT groups_status_chk CHECK (status IN ('active', 'inactive', 'merged', 'archived')),
  CONSTRAINT groups_meeting_day_chk CHECK (meeting_day_of_week BETWEEN 1 AND 7)
);
CREATE INDEX IF NOT EXISTS groups_body_idx ON house_mission_groups(body_id);
CREATE INDEX IF NOT EXISTS groups_status_idx ON house_mission_groups(status);

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
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL,
  body_id UUID REFERENCES bodies(id) ON DELETE CASCADE,
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
  CONSTRAINT assignments_scope_chk CHECK (
    (scope_type = 'body' AND body_id IS NOT NULL AND group_id IS NULL)
    OR (scope_type = 'group' AND group_id IS NOT NULL AND body_id IS NULL)
  ),
  CONSTRAINT assignments_role_chk CHECK (role_type IN ('body_leader', 'care_leader', 'coordinator', 'group_leader')),
  CONSTRAINT assignments_scope_role_match_chk CHECK (
    (scope_type = 'body' AND role_type = 'body_leader')
    OR (scope_type = 'group' AND role_type IN ('care_leader', 'coordinator', 'group_leader'))
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS assignments_active_primary_body_uidx
  ON assignments(body_id, role_type) WHERE effective_to IS NULL AND is_primary = true AND scope_type = 'body';
CREATE UNIQUE INDEX IF NOT EXISTS assignments_active_primary_group_uidx
  ON assignments(group_id, role_type) WHERE effective_to IS NULL AND is_primary = true AND scope_type = 'group';
CREATE UNIQUE INDEX IF NOT EXISTS assignments_active_user_group_role_uidx
  ON assignments(user_id, group_id, role_type) WHERE effective_to IS NULL AND scope_type = 'group';
CREATE UNIQUE INDEX IF NOT EXISTS assignments_active_user_body_role_uidx
  ON assignments(user_id, body_id, role_type) WHERE effective_to IS NULL AND scope_type = 'body';
CREATE INDEX IF NOT EXISTS assignments_user_active_idx ON assignments(user_id, effective_to);
CREATE INDEX IF NOT EXISTS assignments_group_active_idx ON assignments(group_id, effective_to);
CREATE INDEX IF NOT EXISTS assignments_body_active_idx ON assignments(body_id, effective_to);

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
  body_id UUID NOT NULL REFERENCES bodies(id) ON DELETE RESTRICT,
  group_name_snapshot TEXT NOT NULL,
  body_name_snapshot TEXT NOT NULL,
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
  body_id UUID NOT NULL REFERENCES bodies(id) ON DELETE RESTRICT,
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
`;

export async function ensureSchema(runtime: DbRuntime): Promise<void> {
  await runtime.execRaw(SCHEMA_DDL);
}
