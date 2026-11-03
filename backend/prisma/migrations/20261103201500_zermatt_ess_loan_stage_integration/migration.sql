-- New ESS applications opt in explicitly. Existing financial records remain false.
ALTER TABLE "payroll_loans" ADD COLUMN IF NOT EXISTS "essApprovalRequired" boolean NOT NULL DEFAULT false;
ALTER TABLE "payroll_loans" DROP CONSTRAINT IF EXISTS "payroll_loans_status_check";
ALTER TABLE "payroll_loans" ADD CONSTRAINT "payroll_loans_status_check" CHECK (
 "status" IN ('DRAFT','PENDING_BRANCH_MANAGER_APPROVAL','PENDING_HR_VERIFICATION','RETURNED_FOR_CORRECTION','PENDING_GM_APPROVAL','GM_APPROVED','AWAITING_DISBURSEMENT','PENDING_APPROVAL','APPROVED','ACTIVE','PAUSED','COMPLETED','REJECTED','CANCELLED')
);
