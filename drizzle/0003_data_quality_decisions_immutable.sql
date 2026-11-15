-- Data-quality decisions are append-only. A later decision supersedes an earlier one; it never edits it.
-- The trigger also checks that a superseded decision belongs to the same issue.

CREATE TRIGGER trg_dq_decisions_immutable
  BEFORE UPDATE OR DELETE ON data_quality_decisions
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION check_dq_decision_chain()
RETURNS TRIGGER AS $$
DECLARE
  parent_issue uuid;
BEGIN
  IF NEW.supersedes_decision_id IS NOT NULL THEN
    SELECT issue_id INTO parent_issue FROM data_quality_decisions WHERE id = NEW.supersedes_decision_id;
    IF parent_issue IS NULL OR parent_issue <> NEW.issue_id THEN
      RAISE EXCEPTION 'A decision can supersede only a decision of the same issue'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_dq_decisions_chain
  BEFORE INSERT ON data_quality_decisions
  FOR EACH ROW EXECUTE FUNCTION check_dq_decision_chain();
