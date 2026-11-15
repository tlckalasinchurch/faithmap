CREATE TABLE "data_quality_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"decision_type" text NOT NULL,
	"supersedes_decision_id" uuid,
	"reason" text NOT NULL,
	"decided_by_user_id" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dq_decision_type_chk" CHECK ("data_quality_decisions"."decision_type" IN ('approved_fix', 'rejected', 'resolved', 'deferred', 'reversed')),
	CONSTRAINT "dq_decision_reason_chk" CHECK (length(btrim("data_quality_decisions"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "data_quality_decisions" ADD CONSTRAINT "data_quality_decisions_issue_id_data_quality_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."data_quality_issues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_decisions" ADD CONSTRAINT "data_quality_decisions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_decisions" ADD CONSTRAINT "dq_decision_supersedes_fk" FOREIGN KEY ("supersedes_decision_id") REFERENCES "public"."data_quality_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dq_decision_root_uq" ON "data_quality_decisions" USING btree ("issue_id") WHERE "data_quality_decisions"."supersedes_decision_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "dq_decision_successor_uq" ON "data_quality_decisions" USING btree ("supersedes_decision_id") WHERE "data_quality_decisions"."supersedes_decision_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "dq_decision_issue_idx" ON "data_quality_decisions" USING btree ("issue_id","decided_at");