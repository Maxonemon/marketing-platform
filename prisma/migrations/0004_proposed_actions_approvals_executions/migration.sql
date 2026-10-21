-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityEvent" ADD VALUE 'PROPOSED_ACTION_SUBMITTED';
ALTER TYPE "ActivityEvent" ADD VALUE 'APPROVAL_APPROVED';
ALTER TYPE "ActivityEvent" ADD VALUE 'EXECUTION_SUCCEEDED';

-- AlterTable
ALTER TABLE "ActivityLogEntry" ADD COLUMN     "approvalId" TEXT;

-- CreateTable
CREATE TABLE "ProposedAction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "contentAssetId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposedAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "proposedActionId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'STARTED',
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposedAction_workspaceId_idx" ON "ProposedAction"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_proposedActionId_key" ON "Approval"("proposedActionId");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_approvalId_attempt_key" ON "Execution"("approvalId", "attempt");

-- AddForeignKey
ALTER TABLE "ProposedAction" ADD CONSTRAINT "ProposedAction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedAction" ADD CONSTRAINT "ProposedAction_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedAction" ADD CONSTRAINT "ProposedAction_contentAssetId_fkey" FOREIGN KEY ("contentAssetId") REFERENCES "ContentAsset"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedAction" ADD CONSTRAINT "ProposedAction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_proposedActionId_fkey" FOREIGN KEY ("proposedActionId") REFERENCES "ProposedAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLogEntry" ADD CONSTRAINT "ActivityLogEntry_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

