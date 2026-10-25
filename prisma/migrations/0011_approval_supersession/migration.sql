-- AlterEnum
ALTER TYPE "ActivityEvent" ADD VALUE 'APPROVAL_SUPERSEDED';

-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "supersededById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Approval_supersededById_key" ON "Approval"("supersededById");

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "Approval"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
