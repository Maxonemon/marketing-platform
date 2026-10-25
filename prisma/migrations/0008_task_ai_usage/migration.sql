-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "costMicroUsd" INTEGER,
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "outputTokens" INTEGER;
