/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('HEAD_OFFICE', 'BRANCH', 'OFFICE', 'SITE');

-- CreateEnum
CREATE TYPE "UserLocationScope" AS ENUM ('ALL_LOCATIONS', 'ASSIGNED_LOCATIONS');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locationScope" "UserLocationScope" NOT NULL DEFAULT 'ALL_LOCATIONS';

-- CreateTable
CREATE TABLE "organization_locations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" "LocationType" NOT NULL DEFAULT 'BRANCH',
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_locations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_locations_organizationId_idx" ON "organization_locations"("organizationId");

-- CreateIndex
CREATE INDEX "organization_locations_type_idx" ON "organization_locations"("type");

-- CreateIndex
CREATE INDEX "organization_locations_isActive_idx" ON "organization_locations"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "organization_locations_organizationId_name_key" ON "organization_locations"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "organization_locations_organizationId_code_key" ON "organization_locations"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "organization_locations_organizationId_id_key" ON "organization_locations"("organizationId", "id");

-- CreateIndex
CREATE INDEX "user_locations_organizationId_idx" ON "user_locations"("organizationId");

-- CreateIndex
CREATE INDEX "user_locations_userId_idx" ON "user_locations"("userId");

-- CreateIndex
CREATE INDEX "user_locations_locationId_idx" ON "user_locations"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "user_locations_userId_locationId_key" ON "user_locations"("userId", "locationId");

-- CreateIndex
CREATE INDEX "employees_locationId_idx" ON "employees"("locationId");

-- CreateIndex
CREATE INDEX "users_locationScope_idx" ON "users"("locationScope");

-- CreateIndex
CREATE UNIQUE INDEX "users_organizationId_id_key" ON "users"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "organization_locations" ADD CONSTRAINT "organization_locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "users"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "organization_locations"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organizationId_locationId_fkey" FOREIGN KEY ("organizationId", "locationId") REFERENCES "organization_locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
