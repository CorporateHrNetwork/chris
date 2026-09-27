-- Allow a historically paused opening-loan installment to be explicitly reactivated.
ALTER TABLE "payroll_loan_legacy_period_events"
  DROP CONSTRAINT IF EXISTS "payroll_loan_legacy_period_events_status_check";

ALTER TABLE "payroll_loan_legacy_period_events"
  ADD CONSTRAINT "payroll_loan_legacy_period_events_status_check"
  CHECK ("status" IN ('PAID','PAUSED','REACTIVATED'));
