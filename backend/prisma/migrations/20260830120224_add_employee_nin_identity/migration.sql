/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,nationalIdentificationNumber]` on the table `employees` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "nationalIdentificationNumber" TEXT;

-- AlterTable
ALTER TABLE "leave_entitlement_matrix_rules" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organization_employment_levels" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "employees_organizationId_nationalIdentificationNumber_key" ON "employees"("organizationId", "nationalIdentificationNumber");

-- RenameForeignKey
ALTER TABLE "employee_line_manager_assignments" RENAME CONSTRAINT "employee_line_manager_assignments_employee_fkey" TO "employee_line_manager_assignments_organizationId_employeeI_fkey";

-- RenameForeignKey
ALTER TABLE "employee_line_manager_assignments" RENAME CONSTRAINT "employee_line_manager_assignments_manager_fkey" TO "employee_line_manager_assignments_organizationId_managerEm_fkey";

-- RenameForeignKey
ALTER TABLE "leave_entitlement_matrix_rules" RENAME CONSTRAINT "leave_entitlement_matrix_rules_organizationId_leavePolicyId_fke" TO "leave_entitlement_matrix_rules_organizationId_leavePolicyI_fkey";

-- RenameIndex
ALTER INDEX "employee_line_manager_assignments_managerEmployeeId_effectiveTo" RENAME TO "employee_line_manager_assignments_managerEmployeeId_effecti_idx";

-- RenameIndex
ALTER INDEX "employee_line_manager_assignments_organizationId_managerEmploye" RENAME TO "employee_line_manager_assignments_organizationId_managerEmp_idx";

-- RenameIndex
ALTER INDEX "leave_entitlement_adjustments_organizationId_employeeId_leaveYe" RENAME TO "leave_entitlement_adjustments_organizationId_employeeId_lea_idx";

-- RenameIndex
ALTER INDEX "leave_entitlement_allocations_organizationId_employeeId_leaveYe" RENAME TO "leave_entitlement_allocations_organizationId_employeeId_lea_idx";

-- RenameIndex
ALTER INDEX "leave_entitlement_matrix_rules_organizationId_levelNumber_isAct" RENAME TO "leave_entitlement_matrix_rules_organizationId_levelNumber_i_idx";

-- RenameIndex
ALTER INDEX "leave_entitlement_matrix_rules_organizationId_levelNumber_leave" RENAME TO "leave_entitlement_matrix_rules_organizationId_levelNumber_l_key";
