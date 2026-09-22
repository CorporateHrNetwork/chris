-- CreateTable
CREATE TABLE "employee_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "onboardingId" TEXT,
    "category" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "notes" TEXT,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_documents_organizationId_idx" ON "employee_documents"("organizationId");

-- CreateIndex
CREATE INDEX "employee_documents_employeeId_idx" ON "employee_documents"("employeeId");

-- CreateIndex
CREATE INDEX "employee_documents_onboardingId_idx" ON "employee_documents"("onboardingId");

-- CreateIndex
CREATE INDEX "employee_documents_category_idx" ON "employee_documents"("category");

-- CreateIndex
CREATE INDEX "employee_documents_uploadedByUserId_idx" ON "employee_documents"("uploadedByUserId");

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employees"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "employee_onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
