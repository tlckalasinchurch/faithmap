-- Database triggers cannot be expressed in schema.ts, so they live in this custom migration.
-- They keep audit logs append-only and meeting briefs immutable (DEC-01), even if application code is wrong.

CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit table % is append-only and immutable', TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_report_audit_immutable
  BEFORE UPDATE OR DELETE ON report_audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
--> statement-breakpoint

CREATE TRIGGER trg_security_audit_immutable
  BEFORE UPDATE OR DELETE ON security_audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
--> statement-breakpoint

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
--> statement-breakpoint

CREATE TRIGGER trg_meeting_brief_immutable
  BEFORE UPDATE OR DELETE ON meeting_briefs
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_brief_mutation();
