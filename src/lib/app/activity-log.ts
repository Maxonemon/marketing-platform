import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { CHANNELS } from "@/lib/content-options";
import { db } from "@/lib/db";
import { requireRole, type Actor } from "@/lib/permissions";
import { BRAND_FIELDS } from "./brand-fields";
import { ok, type Result } from "./result";

// The Activity Log page shows this many of the newest entries. Filters come in ticket 14.
export const ACTIVITY_LOG_PAGE_SIZE = 100;

// A text setting changes from one string (or null) to another; a list setting from one
// list of entries to another.
const brandSettingValueSchema = z.union([z.string(), z.array(z.string())]).nullable();
const brandFieldChangeSchema = z.object({
  field: z.enum(BRAND_FIELDS),
  from: brandSettingValueSchema,
  to: brandSettingValueSchema,
});

// What `details` holds for each event type. Every member can read every entry, so
// details carry only non-secret facts: never credentials, tokens or webhook URLs.
const activitySchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("BRAND_CREATED"), details: z.object({ name: z.string() }) }),
  z.object({ event: z.literal("BRAND_UPDATED"), details: z.object({ changes: z.array(brandFieldChangeSchema) }) }),
  z.object({ event: z.literal("TASK_FAILED"), details: z.object({ error: z.string() }) }),
  // The hash pins exactly which payload was proposed and approved.
  z.object({ event: z.literal("PROPOSED_ACTION_SUBMITTED"), details: z.object({ payloadHash: z.string() }) }),
  z.object({ event: z.literal("APPROVAL_APPROVED"), details: z.object({ payloadHash: z.string() }) }),
  // The comment is the Approver's reason, written for the author to read.
  z.object({ event: z.literal("APPROVAL_REJECTED"), details: z.object({ payloadHash: z.string(), comment: z.string() }) }),
  // The hash of the superseded Proposed Action, and the Approval that replaced it.
  z.object({
    event: z.literal("APPROVAL_SUPERSEDED"),
    details: z.object({ payloadHash: z.string(), supersededById: z.string() }),
  }),
  // Nobody decided it within 7 days; the system is the actor.
  z.object({ event: z.literal("APPROVAL_EXPIRED"), details: z.object({ payloadHash: z.string() }) }),
  z.object({ event: z.literal("EXECUTION_SUCCEEDED"), details: z.object({ channel: z.enum(CHANNELS), attempt: z.number() }) }),
]);

export type Activity = z.infer<typeof activitySchema>;
export type BrandFieldChange = z.infer<typeof brandFieldChangeSchema>;

export type NewActivityEntry = Activity & {
  workspaceId: string;
  // "system" when no person acted, e.g. a background Task failed.
  actor: Actor | "system";
  brandId: string;
  taskId?: string;
  approvalId?: string;
};

export type ActivityEntry = Activity & {
  id: number;
  // null when the system acted.
  actorName: string | null;
  brand: { id: string; name: string } | null;
  taskId: string | null;
  approvalId: string | null;
  createdAt: Date;
};

// The only write to the Activity Log, which is append-only: no code updates or deletes
// an entry. It takes the caller's transaction, so an entry commits with the change it records.
// It checks nothing itself: only application-layer operations that already passed
// requireRole, and background functions acting for one, call it.
export async function appendActivity(tx: Prisma.TransactionClient, entry: NewActivityEntry): Promise<void> {
  const { workspaceId, actor, brandId, taskId, approvalId, event, details } = entry;
  const actorId = actor === "system" ? null : actor.userId;
  await tx.activityLogEntry.create({ data: { workspaceId, actorId, brandId, taskId, approvalId, event, details } });
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
      actorName: row.actor?.name ?? null,
      brand: row.brand,
      taskId: row.taskId,
      approvalId: row.approvalId,
      createdAt: row.createdAt,
    })),
  );
}
