ALTER TABLE "leave_requests"
  ADD COLUMN "administrativeReconstruction" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reconstructionReason" TEXT;
