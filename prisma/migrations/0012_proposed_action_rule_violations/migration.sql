-- AlterTable
ALTER TABLE "ProposedAction" ADD COLUMN     "ruleViolations" JSONB NOT NULL DEFAULT '[]';

-- Backfill: the Content Asset's violations were checked on its current text, so they
-- belong to every Proposed Action that proposed exactly that text. One proposed before
-- a later edit (ticket 08) keeps the default; its warnings weren't stored.
UPDATE "ProposedAction" AS pa
SET "ruleViolations" = ca."ruleViolations"
FROM "ContentAsset" AS ca
WHERE ca."id" = pa."contentAssetId"
  AND pa."payload" -> 'content' ->> 'body' = ca."body"
  AND (pa."payload" -> 'content' ->> 'subject') IS NOT DISTINCT FROM ca."subject";
