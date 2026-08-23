-- Append-only tenant-scoped entitlement adjustment ledger.
CREATE TABLE "leave_entitlement_adjustments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveBalanceId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "leavePolicyId" TEXT,
    "leaveYear" INTEGER NOT NULL,
    "amount" DECIMAL(8,2) NOT NULL,
    "balanceBefore" DECIMAL(8,2) NOT NULL,
    "balanceAfter" DECIMAL(8,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_entitlement_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leave_entitlement_adjustments_organizationId_employeeId_leaveYear_idx"
ON "leave_entitlement_adjustments"("organizationId", "employeeId", "leaveYear");
CREATE INDEX "leave_entitlement_adjustments_organizationId_leavePolicyId_idx"
ON "leave_entitlement_adjustments"("organizationId", "leavePolicyId");
CREATE INDEX "leave_entitlement_adjustments_leaveBalanceId_createdAt_idx"
ON "leave_entitlement_adjustments"("leaveBalanceId", "createdAt");
CREATE INDEX "leave_entitlement_adjustments_createdByUserId_idx"
ON "leave_entitlement_adjustments"("createdByUserId");

ALTER TABLE "leave_entitlement_adjustments"
ADD CONSTRAINT "leave_entitlement_adjustments_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_entitlement_adjustments"
ADD CONSTRAINT "leave_entitlement_adjustments_organizationId_employeeId_fkey"
FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employees"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_entitlement_adjustments"
ADD CONSTRAINT "leave_entitlement_adjustments_leaveBalanceId_fkey"
FOREIGN KEY ("leaveBalanceId") REFERENCES "leave_balances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_entitlement_adjustments"
ADD CONSTRAINT "leave_entitlement_adjustments_organizationId_leaveTypeId_fkey"
FOREIGN KEY ("organizationId", "leaveTypeId") REFERENCES "leave_types"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_entitlement_adjustments"
ADD CONSTRAINT "leave_entitlement_adjustments_leavePolicyId_fkey"
FOREIGN KEY ("leavePolicyId") REFERENCES "leave_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_entitlement_adjustments"
ADD CONSTRAINT "leave_entitlement_adjustments_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Update the immutable CHRIS recommendation only. Existing tenant policies are untouched.
UPDATE "leave_policy_templates"
SET "configuration" = jsonb_set("configuration", '{entitlementRules,value}', '5'::jsonb, true),
    "previewText" = 'CHRIS recommends 5 working days of unpaid leave as a configurable starting point. This is not a universal statutory entitlement and may be overridden by the organization.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'UNPAID';
