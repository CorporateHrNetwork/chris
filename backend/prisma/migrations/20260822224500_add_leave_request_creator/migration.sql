ALTER TABLE "leave_requests" ADD COLUMN "createdByUserId" TEXT;
CREATE INDEX "leave_requests_createdByUserId_idx" ON "leave_requests"("createdByUserId");
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
