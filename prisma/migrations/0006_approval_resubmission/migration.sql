-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "resubmissionOfId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Approval_resubmissionOfId_key" ON "Approval"("resubmissionOfId");

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_resubmissionOfId_fkey" FOREIGN KEY ("resubmissionOfId") REFERENCES "Approval"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
