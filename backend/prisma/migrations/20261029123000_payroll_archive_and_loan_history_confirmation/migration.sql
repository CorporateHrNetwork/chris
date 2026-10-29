-- Operational archives preserve payroll snapshots and actual recovery evidence.
ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "archivedAt" timestamptz;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS "archivedAt" timestamptz;
ALTER TABLE payroll_loans ADD COLUMN IF NOT EXISTS "historyConfirmedAt" timestamptz;
ALTER TABLE payroll_loans ADD COLUMN IF NOT EXISTS "historyConfirmationReference" text;
CREATE OR REPLACE FUNCTION chris_guard_archived_payroll() RETURNS trigger
LANGUAGE plpgsql SET search_path TO pg_catalog, public, pg_temp AS $$
BEGIN
 IF OLD."archivedAt" IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
  RAISE EXCEPTION 'ARCHIVED_PAYROLL_IMMUTABLE: archived payroll cannot be reopened or approved';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION chris_guard_archived_payroll() FROM PUBLIC;
CREATE TRIGGER aaa_guard_archived_payroll_run BEFORE UPDATE OF status ON payroll_runs FOR EACH ROW EXECUTE FUNCTION chris_guard_archived_payroll();
CREATE TRIGGER aaa_guard_archived_payroll_period BEFORE UPDATE OF status ON payroll_periods FOR EACH ROW EXECUTE FUNCTION chris_guard_archived_payroll();
CREATE OR REPLACE FUNCTION chris_guard_archived_payroll_line() RETURNS trigger
LANGUAGE plpgsql SET search_path TO pg_catalog, public, pg_temp AS $$
DECLARE v_run text; v_org text;
BEGIN
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM payroll_runs WHERE id=OLD."runId" AND "organizationId"=OLD."organizationId" AND "archivedAt" IS NOT NULL) THEN
  RAISE EXCEPTION 'ARCHIVED_PAYROLL_IMMUTABLE: archived payroll lines cannot be moved';
 END IF;
 IF TG_OP='DELETE' THEN v_run:=OLD."runId";v_org:=OLD."organizationId"; ELSE v_run:=NEW."runId";v_org:=NEW."organizationId";END IF;
 IF EXISTS(SELECT 1 FROM payroll_runs WHERE id=v_run AND "organizationId"=v_org AND "archivedAt" IS NOT NULL) THEN
  RAISE EXCEPTION 'ARCHIVED_PAYROLL_IMMUTABLE: archived payroll lines are retained as evidence';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
REVOKE ALL ON FUNCTION chris_guard_archived_payroll_line() FROM PUBLIC;
CREATE TRIGGER aaa_archive_payroll_line BEFORE INSERT OR UPDATE OR DELETE ON payroll_run_lines FOR EACH ROW EXECUTE FUNCTION chris_guard_archived_payroll_line();
