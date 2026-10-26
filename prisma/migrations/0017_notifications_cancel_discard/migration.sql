-- AlterEnum
ALTER TYPE "ActivityEvent" ADD VALUE 'NOTIFICATION_FAILED';
ALTER TYPE "ActivityEvent" ADD VALUE 'TASK_CANCELLED';
ALTER TYPE "ActivityEvent" ADD VALUE 'REVIEW_DISCARDED';

-- CreateIndex
CREATE INDEX "Task_workspaceId_status_idx" ON "Task"("workspaceId", "status");
