ALTER TYPE "LeaveRequestStatus" ADD VALUE 'ACTIVE';
ALTER TYPE "LeaveRequestStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "EmployeeLifecycleEventType" ADD VALUE 'LEAVE_COMMENCED';
ALTER TYPE "EmployeeLifecycleEventType" ADD VALUE 'RETURNED_FROM_LEAVE';

ALTER TABLE "leave_requests"
ADD COLUMN "commencedAt" TIMESTAMP(3),
ADD COLUMN "commencementDate" TIMESTAMP(3),
ADD COLUMN "commencedByUserId" TEXT,
ADD COLUMN "returnedAt" TIMESTAMP(3),
ADD COLUMN "actualReturnDate" TIMESTAMP(3),
ADD COLUMN "returnedByUserId" TEXT,
ADD COLUMN "preLeaveStatus" "EmployeeStatus";

ALTER TABLE "leave_requests"
ADD CONSTRAINT "leave_requests_commencedByUserId_fkey"
FOREIGN KEY ("commencedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leave_requests"
ADD CONSTRAINT "leave_requests_returnedByUserId_fkey"
FOREIGN KEY ("returnedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "leave_requests_commencedByUserId_idx" ON "leave_requests"("commencedByUserId");
CREATE INDEX "leave_requests_returnedByUserId_idx" ON "leave_requests"("returnedByUserId");
CREATE INDEX "leave_requests_commencementDate_idx" ON "leave_requests"("commencementDate");
CREATE INDEX "leave_requests_actualReturnDate_idx" ON "leave_requests"("actualReturnDate");
