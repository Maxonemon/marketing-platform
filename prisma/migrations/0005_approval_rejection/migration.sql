-- AlterEnum
ALTER TYPE "ActivityEvent" ADD VALUE 'APPROVAL_REJECTED';

-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "comment" TEXT;
