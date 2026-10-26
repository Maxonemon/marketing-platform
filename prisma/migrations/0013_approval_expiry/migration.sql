-- AlterEnum
ALTER TYPE "ActivityEvent" ADD VALUE 'APPROVAL_EXPIRED';

-- AlterTable: existing Approvals get the same 7-day deadline as new ones.
ALTER TABLE "Approval" ADD COLUMN     "expiresAt" TIMESTAMP(3);
UPDATE "Approval" SET "expiresAt" = "createdAt" + INTERVAL '7 days';
ALTER TABLE "Approval" ALTER COLUMN "expiresAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Approval_status_expiresAt_idx" ON "Approval"("status", "expiresAt");
