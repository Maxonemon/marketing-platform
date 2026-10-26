-- AlterEnum
ALTER TYPE "ExecutionStatus" ADD VALUE 'UNCERTAIN';

-- AlterEnum
ALTER TYPE "ActivityEvent" ADD VALUE 'EXECUTION_FAILED';

-- CreateIndex
CREATE INDEX "Execution_status_startedAt_idx" ON "Execution"("status", "startedAt");

-- CreateIndex: at most one SUCCEEDED Execution per Approval.
CREATE UNIQUE INDEX "Execution_one_success_per_approval" ON "Execution"("approvalId") WHERE (status = 'SUCCEEDED');
