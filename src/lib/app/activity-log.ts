import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRole, type Actor } from "@/lib/permissions";
import { ok, type Result } from "./result";

// The Activity Log page shows this many of the newest entries. Filters come in ticket 14.
export const ACTIVITY_LOG_PAGE_SIZE = 100;

const fieldChangeSchema = z.object({
  field: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
});

// What `details` holds for each event type. Every member can read every entry, so
// details carry only non-secret facts: never credentials, tokens or webhook URLs.
const activitySchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("BRAND_CREATED"), details: z.object({ name: z.string() }) }),
  z.object({ event: z.literal("BRAND_UPDATED"), details: z.object({ changes: z.array(fieldChangeSchema) }) }),
]);

export type Activity = z.infer<typeof activitySchema>;
export type FieldChange = z.infer<typeof fieldChangeSchema>;

export type NewActivityEntry = Activity & {
  workspaceId: string;
  actor: Actor;
  brandId: string;
};

export type ActivityEntry = Activity & {
  id: number;
  actorName: string;
  brand: { id: string; name: string } | null;
  createdAt: Date;
};

// The only write to the Activity Log, which is append-only: no code updates or deletes
// an entry. It takes the caller's transaction, so an entry commits with the change it records.
// It checks nothing itself: only application-layer operations that already passed
// requireRole call it.
export async function appendActivity(tx: Prisma.TransactionClient, entry: NewActivityEntry): Promise<void> {
  const { workspaceId, actor, brandId, event, details } = entry;
  await tx.activityLogEntry.create({ data: { workspaceId, actorId: actor.userId, brandId, event, details } });
}

// Newest first. Only members of the Workspace can read its log.
export async function listActivity(actor: Actor, workspaceId: string): Promise<Result<ActivityEntry[]>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const rows = await db.activityLogEntry.findMany({
    where: { workspaceId },
    orderBy: { id: "desc" },
    take: ACTIVITY_LOG_PAGE_SIZE,
    include: { actor: { select: { name: true } }, brand: { select: { id: true, name: true } } },
  });
  return ok(
    rows.map((row) => ({
      ...activitySchema.parse({ event: row.event, details: row.details }),
      id: row.id,
      actorName: row.actor.name,
      brand: row.brand,
      createdAt: row.createdAt,
    })),
  );
}
