ALTER TABLE "employee_documents"
ADD COLUMN "exitProcessId" TEXT;

ALTER TABLE "employee_documents"
ADD CONSTRAINT "employee_documents_exitProcessId_fkey"
FOREIGN KEY ("exitProcessId")
REFERENCES "employee_exit_processes"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

CREATE INDEX "employee_documents_exitProcessId_idx"
ON "employee_documents"("exitProcessId");
