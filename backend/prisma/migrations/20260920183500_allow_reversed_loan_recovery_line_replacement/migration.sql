-- Preserve historical reversed loan-recovery records when a reopened payroll is recalculated.
-- The old payroll line can be replaced while the recovery row remains available for audited re-posting.
-- POSTED recoveries are still protected in application logic and must be reversed before recalculation.

ALTER TABLE "payroll_loan_recoveries"
  DROP CONSTRAINT IF EXISTS "payroll_loan_recoveries_runLineId_fkey";

ALTER TABLE "payroll_loan_recoveries"
  ALTER COLUMN "runLineId" DROP NOT NULL;

ALTER TABLE "payroll_loan_recoveries"
  ADD CONSTRAINT "payroll_loan_recoveries_runLineId_fkey"
  FOREIGN KEY ("runLineId")
  REFERENCES "payroll_run_lines"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
