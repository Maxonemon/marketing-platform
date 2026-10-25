-- AlterTable
ALTER TABLE "ContentAsset" ADD COLUMN     "ruleViolations" JSONB NOT NULL DEFAULT '[]';
