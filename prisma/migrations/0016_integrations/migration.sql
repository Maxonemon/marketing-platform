-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('SLACK');

-- AlterEnum
ALTER TYPE "ActivityEvent" ADD VALUE 'INTEGRATION_CONNECTED';
ALTER TYPE "ActivityEvent" ADD VALUE 'INTEGRATION_UPDATED';
ALTER TYPE "ActivityEvent" ADD VALUE 'INTEGRATION_REMOVED';
ALTER TYPE "ActivityEvent" ADD VALUE 'INTEGRATION_TESTED';

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "credentialsEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Integration_workspaceId_type_key" ON "Integration"("workspaceId", "type");

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
