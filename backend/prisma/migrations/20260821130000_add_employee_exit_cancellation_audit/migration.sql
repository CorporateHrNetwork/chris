-- Add exit cancellation audit fields.
ALTER TABLE "employee_exit_processes"
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledByUserId" TEXT;

CREATE INDEX "employee_exit_processes_cancelledByUserId_idx"
ON "employee_exit_processes"("cancelledByUserId");

ALTER TABLE "employee_exit_processes"
ADD CONSTRAINT "employee_exit_processes_cancelledByUserId_fkey"
FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
