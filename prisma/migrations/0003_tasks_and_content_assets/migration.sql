-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('CONTENT_GENERATION');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'IN_REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ActivityEvent" ADD VALUE 'TASK_FAILED';

-- AlterTable
ALTER TABLE "ActivityLogEntry" ADD COLUMN     "taskId" TEXT,
ALTER COLUMN "actorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAsset" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "variant" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_workspaceId_createdAt_idx" ON "Task"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentAsset_taskId_variant_key" ON "ContentAsset"("taskId", "variant");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLogEntry" ADD CONSTRAINT "ActivityLogEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
