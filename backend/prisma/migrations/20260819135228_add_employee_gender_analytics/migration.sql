-- CreateEnum
CREATE TYPE "EmployeeGender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "gender" "EmployeeGender" NOT NULL DEFAULT 'UNSPECIFIED';
