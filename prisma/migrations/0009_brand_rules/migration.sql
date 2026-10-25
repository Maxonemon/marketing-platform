-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "offers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "prohibitedPhrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requiredDisclaimers" TEXT[] DEFAULT ARRAY[]::TEXT[];
