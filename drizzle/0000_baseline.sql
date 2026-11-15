CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"steward_member_id" uuid,
	"steward_display_name" text,
	"link_status" text DEFAULT 'linked_user' NOT NULL,
	"source_role_label" text,
	"scope_type" text NOT NULL,
	"body_id" uuid,
	"care_id" uuid,
	"group_id" uuid,
	"role_type" text NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"assigned_by_user_id" uuid,
	"revoked_by_user_id" uuid,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_steward_identity_chk" CHECK ("assignments"."user_id" IS NOT NULL OR "assignments"."steward_member_id" IS NOT NULL OR ("assignments"."steward_display_name" IS NOT NULL AND length(trim("assignments"."steward_display_name")) > 0)),
	CONSTRAINT "assignments_link_status_chk" CHECK ("assignments"."link_status" IN ('linked_user', 'unlinked_pending_account')),
	CONSTRAINT "assignments_scope_chk" CHECK (("assignments"."scope_type" = 'body' AND "assignments"."body_id" IS NOT NULL AND "assignments"."care_id" IS NULL AND "assignments"."group_id" IS NULL) OR ("assignments"."scope_type" = 'care' AND "assignments"."care_id" IS NOT NULL AND "assignments"."body_id" IS NULL AND "assignments"."group_id" IS NULL) OR ("assignments"."scope_type" = 'group' AND "assignments"."group_id" IS NOT NULL AND "assignments"."body_id" IS NULL AND "assignments"."care_id" IS NULL)),
	CONSTRAINT "assignments_role_chk" CHECK ("assignments"."role_type" IN ('body_leader', 'care_leader', 'coordinator', 'group_leader', 'other_authorized')),
	CONSTRAINT "assignments_scope_role_match_chk" CHECK (("assignments"."scope_type" = 'body' AND "assignments"."role_type" = 'body_leader') OR ("assignments"."scope_type" = 'care' AND "assignments"."role_type" IN ('care_leader', 'other_authorized')) OR ("assignments"."scope_type" = 'group' AND "assignments"."role_type" IN ('care_leader', 'coordinator', 'group_leader', 'other_authorized')))
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekly_report_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"attendance_status" text DEFAULT 'present' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_status_chk" CHECK ("attendance_records"."attendance_status" IN ('present', 'absent', 'excused'))
);
--> statement-breakpoint
CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"nonce_hash" text NOT NULL,
	"user_id" uuid,
	"ip_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_challenges_nonce_hash_unique" UNIQUE("nonce_hash"),
	CONSTRAINT "auth_challenges_purpose_chk" CHECK ("auth_challenges"."purpose" IN ('line_link', 'line_login', 'line_register', 'passkey_register', 'passkey_login'))
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_token_hash" text NOT NULL,
	"auth_method" text NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "bodies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_th" text NOT NULL,
	"name_en" text,
	"region" text DEFAULT 'ภาคตะวันออกเฉียงเหนือ' NOT NULL,
	"province" text DEFAULT 'กาฬสินธุ์' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bodies_code_unique" UNIQUE("code"),
	CONSTRAINT "bodies_status_chk" CHECK ("bodies"."status" IN ('active', 'inactive', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "candidate_location_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid,
	"staging_group_id" uuid,
	"candidate_source" text DEFAULT 'kalasin-field-points' NOT NULL,
	"candidate_no" integer NOT NULL,
	"candidate_name" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"match_status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_loc_target_chk" CHECK ("candidate_location_matches"."group_id" IS NOT NULL OR "candidate_location_matches"."staging_group_id" IS NOT NULL),
	CONSTRAINT "candidate_loc_status_chk" CHECK ("candidate_location_matches"."match_status" IN ('pending', 'confirmed', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "care_body_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"care_code_raw" text NOT NULL,
	"body_id" uuid NOT NULL,
	"notes" text,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "care_body_mappings_care_code_raw_unique" UNIQUE("care_code_raw")
);
--> statement-breakpoint
CREATE TABLE "cares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"care_code" text NOT NULL,
	"care_name" text,
	"team_name" text,
	"body_id" uuid,
	"status" text DEFAULT 'provisional' NOT NULL,
	"source_batch_id" uuid,
	"source_ref" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cares_care_code_unique" UNIQUE("care_code"),
	CONSTRAINT "cares_status_chk" CHECK ("cares"."status" IN ('provisional', 'active', 'pending_assignment', 'inactive', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "data_quality_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"issue_code" text NOT NULL,
	"severity" text DEFAULT 'review' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"summary_safe_text" text NOT NULL,
	"proposed_value_json" jsonb,
	"resolution_note" text,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dq_target_type_chk" CHECK ("data_quality_issues"."target_type" IN ('staging_group', 'staging_member', 'group', 'member')),
	CONSTRAINT "dq_severity_chk" CHECK ("data_quality_issues"."severity" IN ('info', 'review', 'blocking')),
	CONSTRAINT "dq_status_chk" CHECK ("data_quality_issues"."status" IN ('open', 'approved_fix', 'rejected', 'resolved', 'deferred'))
);
--> statement-breakpoint
CREATE TABLE "district_canonical_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"district_raw" text NOT NULL,
	"district_canonical" text NOT NULL,
	"province" text DEFAULT 'กาฬสินธุ์' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "district_canonical_mappings_district_raw_unique" UNIQUE("district_raw")
);
--> statement-breakpoint
CREATE TABLE "external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_up_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"visitor_id" uuid,
	"member_id" uuid,
	"source_report_id" uuid,
	"assigned_to_user_id" uuid,
	"title" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'open' NOT NULL,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_up_status_chk" CHECK ("follow_up_items"."status" IN ('open', 'in_progress', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "group_body_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"from_body_id" uuid NOT NULL,
	"to_body_id" uuid NOT NULL,
	"effective_period_id" uuid,
	"reason" text NOT NULL,
	"transferred_by_user_id" uuid NOT NULL,
	"transferred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"membership_role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "house_mission_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_code" text NOT NULL,
	"body_id" uuid,
	"care_id" uuid,
	"team_name" text,
	"name_th" text NOT NULL,
	"name_en" text,
	"group_name_from_sheet" text,
	"form_title" text,
	"care_code_raw" text,
	"registered_total_raw" text,
	"registered_total_int" integer,
	"district" text NOT NULL,
	"district_raw" text,
	"subdistrict" text,
	"village" text,
	"province" text DEFAULT 'กาฬสินธุ์' NOT NULL,
	"address_summary" text,
	"latitude" double precision,
	"longitude" double precision,
	"map_url_raw" text,
	"group_photo_url" text,
	"meeting_day_of_week" integer,
	"meeting_day_raw" text,
	"meeting_time_local" text,
	"meeting_time_raw" text,
	"status" text DEFAULT 'active' NOT NULL,
	"assignment_status" text DEFAULT 'assigned' NOT NULL,
	"location_status" text DEFAULT 'verified' NOT NULL,
	"verification_status" text DEFAULT 'RAW' NOT NULL,
	"target_attendance" integer DEFAULT 12 NOT NULL,
	"source_batch_id" uuid,
	"source_ref" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "house_mission_groups_group_code_unique" UNIQUE("group_code"),
	CONSTRAINT "groups_status_chk" CHECK ("house_mission_groups"."status" IN ('active', 'inactive', 'merged', 'archived', 'pending_activation')),
	CONSTRAINT "groups_assignment_status_chk" CHECK ("house_mission_groups"."assignment_status" IN ('assigned', 'pending_assignment')),
	CONSTRAINT "groups_location_status_chk" CHECK ("house_mission_groups"."location_status" IN ('verified', 'pending_location')),
	CONSTRAINT "groups_verification_status_chk" CHECK ("house_mission_groups"."verification_status" IN ('RAW', 'NORMALIZED', 'VERIFIED', 'PENDING_REVIEW', 'CONFLICT', 'INCOMPLETE')),
	CONSTRAINT "groups_meeting_day_chk" CHECK ("house_mission_groups"."meeting_day_of_week" IS NULL OR "house_mission_groups"."meeting_day_of_week" BETWEEN 1 AND 7),
	CONSTRAINT "groups_coords_pair_chk" CHECK (("house_mission_groups"."latitude" IS NULL AND "house_mission_groups"."longitude" IS NULL) OR ("house_mission_groups"."latitude" BETWEEN -90 AND 90 AND "house_mission_groups"."longitude" BETWEEN -180 AND 180))
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_key" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_code" text NOT NULL,
	"source_archive_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"selection_policy_version" text DEFAULT '1.0' NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"summary_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"uploaded_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"rolled_back_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batches_batch_code_unique" UNIQUE("batch_code"),
	CONSTRAINT "import_batches_file_sha256_unique" UNIQUE("file_sha256"),
	CONSTRAINT "import_batches_status_chk" CHECK ("import_batches"."status" IN ('uploaded', 'validated', 'staged', 'review_in_progress', 'partially_promoted', 'promoted', 'rolled_back', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "line_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"line_user_id" text NOT NULL,
	"category" text NOT NULL,
	"message_text" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_response" jsonb,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "line_dispatches_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "line_dispatches_status_chk" CHECK ("line_dispatches"."status" IN ('queued', 'sent', 'simulated_sent', 'failed', 'skipped_unlinked'))
);
--> statement-breakpoint
CREATE TABLE "line_registration_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_subject" text NOT NULL,
	"line_display_name" text,
	"requested_name" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"created_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "line_registration_status_chk" CHECK ("line_registration_requests"."status" IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "meeting_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_by_job" boolean DEFAULT false NOT NULL,
	"generated_by_user_id" uuid,
	"is_immutable" boolean DEFAULT true NOT NULL,
	"sections_json" jsonb NOT NULL,
	"metrics_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_briefs_period_id_unique" UNIQUE("period_id")
);
--> statement-breakpoint
CREATE TABLE "member_growth_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"group_id" uuid,
	"conversion_date_raw" text,
	"response_attitude_raw" text,
	"group_attendance_level_raw" text,
	"discipleship_goal_raw" text,
	"target_timeframe_raw" text,
	"discipler_name_raw" text,
	"discipler_assignment_id" uuid,
	"verification_status" text DEFAULT 'RAW' NOT NULL,
	"source_batch_id" uuid,
	"source_file" text,
	"source_sheet" text,
	"source_row" integer,
	"raw_cells_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_growth_verification_chk" CHECK ("member_growth_records"."verification_status" IN ('RAW', 'NORMALIZED', 'VERIFIED', 'PENDING_REVIEW', 'CONFLICT', 'INCOMPLETE'))
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_code" text NOT NULL,
	"full_name" text,
	"nickname" text,
	"display_name" text NOT NULL,
	"age_raw" text,
	"occupation_raw" text,
	"location_text_raw" text,
	"phone_e164" text,
	"line_user_id" text,
	"email" text,
	"source_sequence_no" text,
	"study_workplace_raw" text,
	"family_status_raw" text,
	"membership_status" text DEFAULT 'active' NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"privacy_consent_status" text DEFAULT 'consented' NOT NULL,
	"consent_recorded_at" timestamp with time zone,
	"source_batch_id" uuid,
	"source_row_ref" text,
	"source_provenance" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_member_code_unique" UNIQUE("member_code"),
	CONSTRAINT "members_identity_chk" CHECK ("members"."full_name" IS NOT NULL OR "members"."nickname" IS NOT NULL),
	CONSTRAINT "members_status_chk" CHECK ("members"."membership_status" IN ('active', 'inactive', 'transferred', 'archived')),
	CONSTRAINT "members_verification_chk" CHECK ("members"."verification_status" IN ('unverified', 'pending_review', 'verified')),
	CONSTRAINT "members_consent_chk" CHECK ("members"."privacy_consent_status" IN ('consented', 'pending', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text DEFAULT 'in_app' NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"related_entity_type" text,
	"related_entity_id" text,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_name" text NOT NULL,
	"pilot_province" text DEFAULT 'กาฬสินธุ์' NOT NULL,
	"timezone" text DEFAULT 'Asia/Bangkok' NOT NULL,
	"period_start_day" text DEFAULT 'monday' NOT NULL,
	"deadline_weekday" text DEFAULT 'sunday' NOT NULL,
	"deadline_time_local" text DEFAULT '20:00' NOT NULL,
	"brief_weekday" text DEFAULT 'sunday' NOT NULL,
	"brief_time_local" text DEFAULT '20:30' NOT NULL,
	"retention_months" integer DEFAULT 36 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "period_group_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"body_id" uuid,
	"group_name_snapshot" text NOT NULL,
	"body_name_snapshot" text DEFAULT 'รอจัดสรรบอดี้' NOT NULL,
	"district_snapshot" text NOT NULL,
	"group_status_snapshot" text NOT NULL,
	"target_attendance_snapshot" integer DEFAULT 12 NOT NULL,
	"expected_report" boolean DEFAULT true NOT NULL,
	"primary_group_leader_user_id" uuid,
	"supervisor_user_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekly_report_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"actor_user_id" uuid,
	"actor_role" text,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_key" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"brief_scheduled_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reporting_periods_period_key_unique" UNIQUE("period_key"),
	CONSTRAINT "reporting_periods_status_chk" CHECK ("reporting_periods"."status" IN ('open', 'cutoff_reached', 'brief_published', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "security_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"ip_address" text,
	"outcome" text DEFAULT 'success' NOT NULL,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "security_audit_outcome_chk" CHECK ("security_audit_logs"."outcome" IN ('success', 'denied', 'error'))
);
--> statement-breakpoint
CREATE TABLE "staging_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"group_ref" text NOT NULL,
	"source_file" text NOT NULL,
	"source_sheet" text NOT NULL,
	"row_sha256" text NOT NULL,
	"group_name_from_sheet_raw" text NOT NULL,
	"form_title_raw" text,
	"district_raw" text,
	"district_normalized" text,
	"subdistrict_raw" text,
	"village_raw" text,
	"meeting_day_raw" text,
	"meeting_time_start_raw" text,
	"meeting_time_end_raw" text,
	"meeting_place_raw" text,
	"leader_raw" text,
	"coordinator_raw" text,
	"care_label_raw" text,
	"care_code_raw" text,
	"registered_total_raw" text,
	"member_row_count_derived" integer DEFAULT 0 NOT NULL,
	"data_status" text DEFAULT 'raw' NOT NULL,
	"promoted_group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staging_groups_status_chk" CHECK ("staging_groups"."data_status" IN ('raw', 'normalized', 'pending_review', 'conflict', 'incomplete', 'approved', 'rejected', 'promoted'))
);
--> statement-breakpoint
CREATE TABLE "staging_member_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"staging_group_id" uuid NOT NULL,
	"member_row_ref" text NOT NULL,
	"source_file" text NOT NULL,
	"source_sheet" text NOT NULL,
	"source_row" integer NOT NULL,
	"row_sha256" text NOT NULL,
	"full_name_raw" text,
	"nickname_raw" text,
	"age_raw" text,
	"occupation_raw" text,
	"location_raw" text,
	"raw_cells_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"data_status" text DEFAULT 'raw' NOT NULL,
	"duplicate_candidate_of_member_id" uuid,
	"promoted_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staging_members_status_chk" CHECK ("staging_member_rows"."data_status" IN ('raw', 'normalized', 'pending_review', 'conflict', 'incomplete', 'approved', 'rejected', 'promoted'))
);
--> statement-breakpoint
CREATE TABLE "team_field_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_code" text DEFAULT 'G' NOT NULL,
	"point_no" integer NOT NULL,
	"point_name" text NOT NULL,
	"coordinator_name" text,
	"phone_raw" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"maps_url" text,
	"source_sheet" text DEFAULT 'kalasin-field-points' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_field_points_coords_chk" CHECK ("team_field_points"."latitude" BETWEEN -90 AND 90 AND "team_field_points"."longitude" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE "used_id_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key_b64" text NOT NULL,
	"sign_count" integer DEFAULT 0 NOT NULL,
	"device_label" text DEFAULT 'อุปกรณ์หลัก' NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "user_passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"phone_e164" text,
	"system_role" text DEFAULT 'standard_user' NOT NULL,
	"status" text DEFAULT 'pending_activation' NOT NULL,
	"password_hash" text,
	"line_user_id" text,
	"preferred_ui_mode" text DEFAULT 'auto' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_system_role_chk" CHECK ("users"."system_role" IN ('super_admin', 'admin', 'mission_leader', 'standard_user')),
	CONSTRAINT "users_status_chk" CHECK ("users"."status" IN ('pending_activation', 'active', 'suspended', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "visitor_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"weekly_report_id" uuid,
	"period_id" uuid NOT NULL,
	"visit_type" text NOT NULL,
	"visited_on" date NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visitor_visits_type_chk" CHECK ("visitor_visits"."visit_type" IN ('new_visitor', 'returning_visitor'))
);
--> statement-breakpoint
CREATE TABLE "visitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"nickname" text,
	"phone_e164" text,
	"line_user_id" text,
	"consent_for_contact" boolean DEFAULT false NOT NULL,
	"consent_recorded_at" timestamp with time zone,
	"consent_captured_by_user_id" uuid,
	"first_origin_group_id" uuid,
	"visit_count" integer DEFAULT 1 NOT NULL,
	"converted_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visitors_pdpa_consent_chk" CHECK ("visitors"."phone_e164" IS NULL OR "visitors"."consent_for_contact" = true)
);
--> statement-breakpoint
CREATE TABLE "weekly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"snapshot_id" uuid,
	"group_id" uuid NOT NULL,
	"body_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"meeting_held" boolean,
	"not_held_reason" text,
	"meeting_date" date,
	"total_attendees" integer DEFAULT 0 NOT NULL,
	"member_attendees" integer DEFAULT 0 NOT NULL,
	"new_visitors_count" integer DEFAULT 0 NOT NULL,
	"returning_visitors_count" integer DEFAULT 0 NOT NULL,
	"children_count" integer DEFAULT 0 NOT NULL,
	"offering_amount_thb" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"summary_notes" text,
	"prayer_requests" text,
	"care_needs_notes" text,
	"is_late" boolean DEFAULT false NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"blocked_reason" text,
	"blocked_at" timestamp with time zone,
	"requires_supervisor_review" boolean DEFAULT false NOT NULL,
	"submitted_by_user_id" uuid,
	"submitted_at" timestamp with time zone,
	"supervisor_reviewed_by_user_id" uuid,
	"supervisor_reviewed_at" timestamp with time zone,
	"supervisor_notes" text,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"revision_requested_by_user_id" uuid,
	"revision_requested_at" timestamp with time zone,
	"revision_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wr_status_chk" CHECK ("weekly_reports"."status" IN ('draft', 'submitted', 'under_review', 'needs_revision', 'approved')),
	CONSTRAINT "wr_non_negative_counts_chk" CHECK ("weekly_reports"."total_attendees" >= 0 AND "weekly_reports"."member_attendees" >= 0 AND "weekly_reports"."new_visitors_count" >= 0 AND "weekly_reports"."returning_visitors_count" >= 0 AND "weekly_reports"."children_count" >= 0),
	CONSTRAINT "wr_no_self_approval_chk" CHECK ("weekly_reports"."approved_by_user_id" IS NULL OR "weekly_reports"."submitted_by_user_id" IS NULL OR "weekly_reports"."approved_by_user_id" <> "weekly_reports"."submitted_by_user_id"),
	CONSTRAINT "wr_sequential_review_chk" CHECK ("weekly_reports"."status" <> 'approved' OR "weekly_reports"."requires_supervisor_review" = false OR "weekly_reports"."supervisor_reviewed_at" IS NOT NULL),
	CONSTRAINT "wr_approved_fields_chk" CHECK (("weekly_reports"."status" = 'approved' AND "weekly_reports"."approved_by_user_id" IS NOT NULL AND "weekly_reports"."approved_at" IS NOT NULL AND "weekly_reports"."is_blocked" = false) OR "weekly_reports"."status" <> 'approved'),
	CONSTRAINT "wr_revision_reason_chk" CHECK ("weekly_reports"."status" <> 'needs_revision' OR ("weekly_reports"."revision_reason" IS NOT NULL AND length(trim("weekly_reports"."revision_reason")) > 0)),
	CONSTRAINT "wr_submitted_meeting_held_chk" CHECK ("weekly_reports"."status" = 'draft' OR "weekly_reports"."meeting_held" IS NOT NULL),
	CONSTRAINT "wr_not_held_reason_chk" CHECK ("weekly_reports"."status" = 'draft' OR "weekly_reports"."meeting_held" = true OR ("weekly_reports"."not_held_reason" IS NOT NULL AND length(trim("weekly_reports"."not_held_reason")) > 0))
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_steward_member_id_members_id_fk" FOREIGN KEY ("steward_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_body_id_bodies_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."bodies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_care_id_cares_id_fk" FOREIGN KEY ("care_id") REFERENCES "public"."cares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_group_id_house_mission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."house_mission_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_weekly_report_id_weekly_reports_id_fk" FOREIGN KEY ("weekly_report_id") REFERENCES "public"."weekly_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_location_matches" ADD CONSTRAINT "candidate_location_matches_group_id_house_mission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."house_mission_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_location_matches" ADD CONSTRAINT "candidate_location_matches_staging_group_id_staging_groups_id_fk" FOREIGN KEY ("staging_group_id") REFERENCES "public"."staging_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_location_matches" ADD CONSTRAINT "candidate_location_matches_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_body_mappings" ADD CONSTRAINT "care_body_mappings_body_id_bodies_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."bodies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_body_mappings" ADD CONSTRAINT "care_body_mappings_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cares" ADD CONSTRAINT "cares_body_id_bodies_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."bodies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "district_canonical_mappings" ADD CONSTRAINT "district_canonical_mappings_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_items" ADD CONSTRAINT "follow_up_items_group_id_house_mission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."house_mission_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_items" ADD CONSTRAINT "follow_up_items_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_items" ADD CONSTRAINT "follow_up_items_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_items" ADD CONSTRAINT "follow_up_items_source_report_id_weekly_reports_id_fk" FOREIGN KEY ("source_report_id") REFERENCES "public"."weekly_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_items" ADD CONSTRAINT "follow_up_items_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_items" ADD CONSTRAINT "follow_up_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_body_transfers" ADD CONSTRAINT "group_body_transfers_group_id_house_mission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."house_mission_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_body_transfers" ADD CONSTRAINT "group_body_transfers_from_body_id_bodies_id_fk" FOREIGN KEY ("from_body_id") REFERENCES "public"."bodies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_body_transfers" ADD CONSTRAINT "group_body_transfers_to_body_id_bodies_id_fk" FOREIGN KEY ("to_body_id") REFERENCES "public"."bodies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_body_transfers" ADD CONSTRAINT "group_body_transfers_effective_period_id_reporting_periods_id_fk" FOREIGN KEY ("effective_period_id") REFERENCES "public"."reporting_periods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_body_transfers" ADD CONSTRAINT "group_body_transfers_transferred_by_user_id_users_id_fk" FOREIGN KEY ("transferred_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_house_mission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."house_mission_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "house_mission_groups" ADD CONSTRAINT "house_mission_groups_body_id_bodies_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."bodies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "house_mission_groups" ADD CONSTRAINT "house_mission_groups_care_id_cares_id_fk" FOREIGN KEY ("care_id") REFERENCES "public"."cares"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_dispatches" ADD CONSTRAINT "line_dispatches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_registration_requests" ADD CONSTRAINT "line_registration_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_registration_requests" ADD CONSTRAINT "line_registration_requests_created_user_id_users_id_fk" FOREIGN KEY ("created_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_briefs" ADD CONSTRAINT "meeting_briefs_period_id_reporting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."reporting_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_briefs" ADD CONSTRAINT "meeting_briefs_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_growth_records" ADD CONSTRAINT "member_growth_records_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_growth_records" ADD CONSTRAINT "member_growth_records_group_id_house_mission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."house_mission_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_growth_records" ADD CONSTRAINT "member_growth_records_discipler_assignment_id_assignments_id_fk" FOREIGN KEY ("discipler_assignment_id") REFERENCES "public"."assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_group_snapshots" ADD CONSTRAINT "period_group_snapshots_period_id_reporting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."reporting_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_group_snapshots" ADD CONSTRAINT "period_group_snapshots_group_id_house_mission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."house_mission_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_group_snapshots" ADD CONSTRAINT "period_group_snapshots_body_id_bodies_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."bodies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_audit_events" ADD CONSTRAINT "report_audit_events_weekly_report_id_weekly_reports_id_fk" FOREIGN KEY ("weekly_report_id") REFERENCES "public"."weekly_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_audit_events" ADD CONSTRAINT "report_audit_events_period_id_reporting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."reporting_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_audit_events" ADD CONSTRAINT "report_audit_events_group_id_house_mission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."house_mission_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_audit_events" ADD CONSTRAINT "report_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_audit_logs" ADD CONSTRAINT "security_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging_groups" ADD CONSTRAINT "staging_groups_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging_groups" ADD CONSTRAINT "staging_groups_promoted_group_id_house_mission_groups_id_fk" FOREIGN KEY ("promoted_group_id") REFERENCES "public"."house_mission_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging_member_rows" ADD CONSTRAINT "staging_member_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging_member_rows" ADD CONSTRAINT "staging_member_rows_staging_group_id_staging_groups_id_fk" FOREIGN KEY ("staging_group_id") REFERENCES "public"."staging_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging_member_rows" ADD CONSTRAINT "staging_member_rows_duplicate_candidate_of_member_id_members_id_fk" FOREIGN KEY ("duplicate_candidate_of_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging_member_rows" ADD CONSTRAINT "staging_member_rows_promoted_member_id_members_id_fk" FOREIGN KEY ("promoted_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_passkeys" ADD CONSTRAINT "user_passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_visits" ADD CONSTRAINT "visitor_visits_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_visits" ADD CONSTRAINT "visitor_visits_group_id_house_mission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."house_mission_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_visits" ADD CONSTRAINT "visitor_visits_weekly_report_id_weekly_reports_id_fk" FOREIGN KEY ("weekly_report_id") REFERENCES "public"."weekly_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_visits" ADD CONSTRAINT "visitor_visits_period_id_reporting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."reporting_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_visits" ADD CONSTRAINT "visitor_visits_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_consent_captured_by_user_id_users_id_fk" FOREIGN KEY ("consent_captured_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_first_origin_group_id_house_mission_groups_id_fk" FOREIGN KEY ("first_origin_group_id") REFERENCES "public"."house_mission_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_converted_member_id_members_id_fk" FOREIGN KEY ("converted_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_period_id_reporting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."reporting_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_snapshot_id_period_group_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."period_group_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_group_id_house_mission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."house_mission_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_body_id_bodies_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."bodies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_supervisor_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("supervisor_reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_revision_requested_by_user_id_users_id_fk" FOREIGN KEY ("revision_requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_active_primary_body_uidx" ON "assignments" USING btree ("body_id","role_type") WHERE "assignments"."effective_to" IS NULL AND "assignments"."is_primary" = true AND "assignments"."scope_type" = 'body';--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_active_primary_care_uidx" ON "assignments" USING btree ("care_id","role_type") WHERE "assignments"."effective_to" IS NULL AND "assignments"."is_primary" = true AND "assignments"."scope_type" = 'care';--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_active_primary_group_uidx" ON "assignments" USING btree ("group_id","role_type") WHERE "assignments"."effective_to" IS NULL AND "assignments"."is_primary" = true AND "assignments"."scope_type" = 'group';--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_active_user_group_role_uidx" ON "assignments" USING btree ("user_id","group_id","role_type") WHERE "assignments"."effective_to" IS NULL AND "assignments"."scope_type" = 'group' AND "assignments"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_active_user_care_role_uidx" ON "assignments" USING btree ("user_id","care_id","role_type") WHERE "assignments"."effective_to" IS NULL AND "assignments"."scope_type" = 'care' AND "assignments"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_active_user_body_role_uidx" ON "assignments" USING btree ("user_id","body_id","role_type") WHERE "assignments"."effective_to" IS NULL AND "assignments"."scope_type" = 'body' AND "assignments"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "assignments_user_active_idx" ON "assignments" USING btree ("user_id","effective_to");--> statement-breakpoint
CREATE INDEX "assignments_group_active_idx" ON "assignments" USING btree ("group_id","effective_to");--> statement-breakpoint
CREATE INDEX "assignments_care_active_idx" ON "assignments" USING btree ("care_id","effective_to");--> statement-breakpoint
CREATE INDEX "assignments_body_active_idx" ON "assignments" USING btree ("body_id","effective_to");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_report_member_uidx" ON "attendance_records" USING btree ("weekly_report_id","member_id");--> statement-breakpoint
CREATE INDEX "auth_challenges_expires_idx" ON "auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "candidate_loc_status_idx" ON "candidate_location_matches" USING btree ("match_status");--> statement-breakpoint
CREATE INDEX "cares_body_idx" ON "cares" USING btree ("body_id");--> statement-breakpoint
CREATE INDEX "cares_status_idx" ON "cares" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dq_issues_status_code_idx" ON "data_quality_issues" USING btree ("status","issue_code","batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_identities_active_provider_sub_uidx" ON "external_identities" USING btree ("provider","provider_subject") WHERE "external_identities"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "external_identities_user_idx" ON "external_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "follow_up_group_status_idx" ON "follow_up_items" USING btree ("group_id","status");--> statement-breakpoint
CREATE INDEX "group_transfers_group_idx" ON "group_body_transfers" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_memberships_active_uidx" ON "group_memberships" USING btree ("group_id","member_id") WHERE "group_memberships"."is_active" = true;--> statement-breakpoint
CREATE INDEX "group_memberships_group_idx" ON "group_memberships" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "groups_body_idx" ON "house_mission_groups" USING btree ("body_id");--> statement-breakpoint
CREATE INDEX "groups_care_idx" ON "house_mission_groups" USING btree ("care_id");--> statement-breakpoint
CREATE INDEX "groups_status_idx" ON "house_mission_groups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "groups_assignment_body_idx" ON "house_mission_groups" USING btree ("assignment_status","body_id");--> statement-breakpoint
CREATE INDEX "groups_location_status_idx" ON "house_mission_groups" USING btree ("location_status");--> statement-breakpoint
CREATE INDEX "groups_district_idx" ON "house_mission_groups" USING btree ("district");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_scope_key_uidx" ON "idempotency_keys" USING btree ("scope_key","idempotency_key");--> statement-breakpoint
CREATE INDEX "idempotency_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "import_batches_status_idx" ON "import_batches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "line_registration_pending_subject_uidx" ON "line_registration_requests" USING btree ("line_subject") WHERE "line_registration_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "line_registration_status_idx" ON "line_registration_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "member_growth_member_idx" ON "member_growth_records" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "member_growth_group_idx" ON "member_growth_records" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_uidx" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "period_group_snapshots_period_group_uidx" ON "period_group_snapshots" USING btree ("period_id","group_id");--> statement-breakpoint
CREATE INDEX "period_group_snapshots_body_idx" ON "period_group_snapshots" USING btree ("period_id","body_id");--> statement-breakpoint
CREATE INDEX "report_audit_report_idx" ON "report_audit_events" USING btree ("weekly_report_id","created_at");--> statement-breakpoint
CREATE INDEX "security_audit_created_idx" ON "security_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staging_groups_batch_sha_uidx" ON "staging_groups" USING btree ("batch_id","row_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "staging_groups_batch_ref_uidx" ON "staging_groups" USING btree ("batch_id","group_ref");--> statement-breakpoint
CREATE INDEX "staging_groups_batch_status_idx" ON "staging_groups" USING btree ("batch_id","data_status");--> statement-breakpoint
CREATE UNIQUE INDEX "staging_members_batch_sha_uidx" ON "staging_member_rows" USING btree ("batch_id","row_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "staging_members_batch_ref_uidx" ON "staging_member_rows" USING btree ("batch_id","member_row_ref");--> statement-breakpoint
CREATE INDEX "staging_members_batch_status_idx" ON "staging_member_rows" USING btree ("batch_id","data_status");--> statement-breakpoint
CREATE UNIQUE INDEX "team_field_points_team_no_uidx" ON "team_field_points" USING btree ("team_code","point_no");--> statement-breakpoint
CREATE INDEX "used_id_tokens_expires_idx" ON "used_id_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_passkeys_user_idx" ON "user_passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "visitor_visits_group_period_idx" ON "visitor_visits" USING btree ("group_id","period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_reports_period_group_uidx" ON "weekly_reports" USING btree ("period_id","group_id");--> statement-breakpoint
CREATE INDEX "weekly_reports_body_status_idx" ON "weekly_reports" USING btree ("body_id","status");--> statement-breakpoint
CREATE INDEX "weekly_reports_blocked_idx" ON "weekly_reports" USING btree ("is_blocked");