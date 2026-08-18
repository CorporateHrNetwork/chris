-- CreateTable
CREATE TABLE "public_holidays" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "holidayDate" DATE NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_holidays_organizationId_holidayDate_idx" ON "public_holidays"("organizationId", "holidayDate");

-- CreateIndex
CREATE UNIQUE INDEX "public_holidays_organizationId_holidayDate_name_key" ON "public_holidays"("organizationId", "holidayDate", "name");
