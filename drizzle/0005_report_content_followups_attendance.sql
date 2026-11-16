-- Pre-migration validation: verify no corrupt, unexpected, or NULL attendance records exist before altering schema or data (Fail Fast)
DO $$
DECLARE
  v_abnormal_count integer;
  v_samples text;
BEGIN
  SELECT count(*), string_agg(DISTINCT coalesce("attendance_status", 'NULL'), ', ')
  INTO v_abnormal_count, v_samples
  FROM "attendance_records"
  WHERE "attendance_status" IS NULL
     OR "attendance_status" NOT IN ('present', 'absent', 'leave', 'online', 'excused');

  IF v_abnormal_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION_0005_FAIL_FAST: พบข้อมูลการเข้าร่วมที่ไม่ถูกต้องจำนวน % รายการ (สถานะที่พบ: %). กรุณาตรวจสอบและแก้ไขข้อมูลก่อนรัน migration',
      v_abnormal_count, v_samples;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_status_chk";--> statement-breakpoint
-- Data step: the approved PRD (FR-06.1) names the statuses present, absent, leave, online. The old value "excused" meant leave.
UPDATE "attendance_records" SET "attendance_status" = 'leave' WHERE "attendance_status" = 'excused';--> statement-breakpoint
ALTER TABLE "follow_up_items" ADD COLUMN "source_type" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "follow_up_items" ADD COLUMN "source_dedup_key" text;--> statement-breakpoint
ALTER TABLE "follow_up_items" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "follow_up_items" ADD COLUMN "outcome_note" text;--> statement-breakpoint
ALTER TABLE "follow_up_items" ADD COLUMN "completed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "visitors" ADD COLUMN "followup_status" text DEFAULT 'first_visit' NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD COLUMN "teaching_topic" text;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD COLUMN "scripture_ref" text;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD COLUMN "activities" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD COLUMN "location_text" text;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD COLUMN "atmosphere_notes" text;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD COLUMN "followup_needs_text" text;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD COLUMN "next_week_plan" text;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD COLUMN "support_needed_text" text;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD COLUMN "first_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "follow_up_items" ADD CONSTRAINT "follow_up_items_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Data step: ensure no duplicate open follow_up_items violate the partial unique index
WITH dups AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY source_dedup_key ORDER BY created_at ASC) AS rnum
  FROM "follow_up_items"
  WHERE "source_dedup_key" IS NOT NULL AND "status" IN ('open', 'in_progress')
)
UPDATE "follow_up_items"
SET "status" = 'cancelled', "outcome_note" = 'ยกเลิกเนื่องจากเป็นรายการซ้ำก่อนทำ index'
WHERE id IN (SELECT id FROM dups WHERE rnum > 1);--> statement-breakpoint
CREATE UNIQUE INDEX "follow_up_open_dedup_uidx" ON "follow_up_items" USING btree ("source_dedup_key") WHERE "follow_up_items"."source_dedup_key" IS NOT NULL AND "follow_up_items"."status" IN ('open', 'in_progress');--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_status_chk" CHECK ("attendance_records"."attendance_status" IN ('present', 'absent', 'leave', 'online'));--> statement-breakpoint
ALTER TABLE "follow_up_items" ADD CONSTRAINT "follow_up_source_type_chk" CHECK ("follow_up_items"."source_type" IN ('manual', 'absent_2_weeks', 'absent_3plus_weeks', 'visitor_not_returned', 'report_support'));--> statement-breakpoint
ALTER TABLE "follow_up_items" ADD CONSTRAINT "follow_up_priority_chk" CHECK ("follow_up_items"."priority" IN ('low', 'normal', 'high'));--> statement-breakpoint
-- Data step: FR-09.2 needs an outcome note on every completed item. Older completed items get a plain marker text.
UPDATE "follow_up_items" SET "outcome_note" = 'ไม่ได้บันทึกผลไว้ (รายการเดิมก่อนกำหนดให้ระบุผล)' WHERE "status" = 'completed' AND ("outcome_note" IS NULL OR length(trim("outcome_note")) = 0);--> statement-breakpoint
ALTER TABLE "follow_up_items" ADD CONSTRAINT "follow_up_completed_outcome_chk" CHECK ("follow_up_items"."status" <> 'completed' OR ("follow_up_items"."outcome_note" IS NOT NULL AND length(trim("follow_up_items"."outcome_note")) > 0));--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_followup_status_chk" CHECK ("visitors"."followup_status" IN ('first_visit', 'awaiting_followup', 'contacted', 'returned', 'ongoing_care', 'completed'));
--> statement-breakpoint
-- Data step: reports that were already submitted get their first submit time from the last one (the only time stored before).
UPDATE "weekly_reports" SET "first_submitted_at" = "submitted_at" WHERE "submitted_at" IS NOT NULL AND "first_submitted_at" IS NULL;
