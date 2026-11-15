ALTER TABLE "team_field_points" ADD COLUMN "body_id" uuid;--> statement-breakpoint
ALTER TABLE "team_field_points" ADD COLUMN "coordinator_user_id" uuid;--> statement-breakpoint
ALTER TABLE "team_field_points" ADD COLUMN "assigned_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "team_field_points" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team_field_points" ADD CONSTRAINT "team_field_points_body_id_bodies_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."bodies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_field_points" ADD CONSTRAINT "team_field_points_coordinator_user_id_users_id_fk" FOREIGN KEY ("coordinator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_field_points" ADD CONSTRAINT "team_field_points_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_field_points_body_idx" ON "team_field_points" USING btree ("body_id");--> statement-breakpoint
CREATE INDEX "team_field_points_coordinator_idx" ON "team_field_points" USING btree ("coordinator_user_id");