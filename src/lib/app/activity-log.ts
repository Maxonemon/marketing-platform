import { z } from "zod";
import { ActivityEvent, type Prisma } from "@/generated/prisma/client";
import { CHANNELS } from "@/lib/content-options";
import { db } from "@/lib/db";
import { requireRole, type Actor } from "@/lib/permissions";
import { BRAND_FIELDS } from "./brand-fields";
import { fail, ok, type Result } from "./result";

const WORKSPACE_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
const INTEGRATION_TYPES = ["SLACK"] as const;
export const NOTIFICATION_KINDS = ["APPROVAL_PENDING", "REVIEW_READY", "TASK_FAILED", "EXECUTION_FAILED"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

// The Activity Log page shows this many of the newest entries that match its filters.
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
  // Membership changes. The member is named in the details, as members see each other's
  // names and emails on the Members page anyway.
  z.object({ event: z.literal("MEMBER_INVITED"), details: z.object({ email: z.string(), role: z.enum(WORKSPACE_ROLES) }) }),
  // The invited person signed in and became a member; they are the actor.
  z.object({ event: z.literal("MEMBER_JOINED"), details: z.object({ email: z.string(), role: z.enum(WORKSPACE_ROLES) }) }),
  z.object({
    event: z.literal("MEMBER_ROLE_CHANGED"),
    details: z.object({ name: z.string(), email: z.string(), from: z.enum(WORKSPACE_ROLES), to: z.enum(WORKSPACE_ROLES) }),
  }),
  // `invitationsCancelled`: the pending invitations they sent, or for their email, deleted with them.
  z.object({
    event: z.literal("MEMBER_REMOVED"),
    details: z.object({ name: z.string(), email: z.string(), role: z.enum(WORKSPACE_ROLES), invitationsCancelled: z.number() }),
  }),
  // The error is the execution service's own safe message, never the Channel's. `final`
  // when no retry follows: the last attempt failed, or it may have gone out.
  z.object({
    event: z.literal("EXECUTION_FAILED"),
    details: z.object({ attempt: z.number(), error: z.string(), final: z.boolean() }),
  }),
  // Integrations are named by type only: their credentials never reach the log.
  z.object({ event: z.literal("INTEGRATION_CONNECTED"), details: z.object({ type: z.enum(INTEGRATION_TYPES) }) }),
  z.object({ event: z.literal("INTEGRATION_UPDATED"), details: z.object({ type: z.enum(INTEGRATION_TYPES) }) }),
  z.object({ event: z.literal("INTEGRATION_REMOVED"), details: z.object({ type: z.enum(INTEGRATION_TYPES) }) }),
  // A test message: `error` is the app's own safe message, null when it went out.
  z.object({
    event: z.literal("INTEGRATION_TESTED"),
    details: z.object({ type: z.enum(INTEGRATION_TYPES), error: z.string().nullable() }),
  }),
  // A team notification that didn't go out: `notification` names what it was about and
  // `error` is the app's own safe message. The operation it reported on still stands.
  z.object({
    event: z.literal("NOTIFICATION_FAILED"),
    details: z.object({ type: z.enum(INTEGRATION_TYPES), notification: z.enum(NOTIFICATION_KINDS), error: z.string() }),
  }),
  // A member cancelled a QUEUED Task: it never calls the AI.
  z.object({ event: z.literal("TASK_CANCELLED"), details: z.object({}) }),
  // A member closed a Review without submitting any Variant: nothing was proposed.
  z.object({ event: z.literal("REVIEW_DISCARDED"), details: z.object({}) }),
]);

export type Activity = z.infer<typeof activitySchema>;
export type BrandFieldChange = z.infer<typeof brandFieldChangeSchema>;

export type NewActivityEntry = Activity & {
  workspaceId: string;
  // "system" when no person acted, e.g. a background Task failed.
  actor: Actor | "system";
  // Left out for an entry about the Workspace itself, e.g. a membership change.
  brandId?: string;
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

export const ACTIVITY_EVENTS = Object.values(ActivityEvent) as [ActivityEvent, ...ActivityEvent[]];

const DAY_MS = 24 * 60 * 60 * 1000;
const INVALID_FILTERS = "Check the filters.";

// From the page's query string: each filter is optional and only narrows the list. Dates
// are whole days (YYYY-MM-DD, UTC); `to` includes its day.
const activityFiltersSchema = z.object({
  event: z.enum(ACTIVITY_EVENTS, "Choose an event type.").optional(),
  brandId: z.string().min(1).optional(),
  from: z.iso.date("Use a date like 2026-10-26.").optional(),
  to: z.iso.date("Use a date like 2026-10-26.").optional(),
});

export type ActivityFiltersInput = z.input<typeof activityFiltersSchema>;

const activityInclude = {
  actor: { select: { name: true } },
  brand: { select: { id: true, name: true } },
} satisfies Prisma.ActivityLogEntryInclude;

type ActivityRow = Prisma.ActivityLogEntryGetPayload<{ include: typeof activityInclude }>;

export function toActivityEntry(row: ActivityRow): ActivityEntry {
  return {
    ...activitySchema.parse({ event: row.event, details: row.details }),
    id: row.id,
    actorName: row.actor?.name ?? null,
    brand: row.brand,
    taskId: row.taskId,
    approvalId: row.approvalId,
    createdAt: row.createdAt,
  };
}

// Newest first, at most `take`, within the Workspace. Callers have passed requireRole.
export async function findActivity(where: Prisma.ActivityLogEntryWhereInput & { workspaceId: string }, take: number) {
  const rows = await db.activityLogEntry.findMany({ where, orderBy: { id: "desc" }, take, include: activityInclude });
  return rows.map(toActivityEntry);
}

// Newest first. Only members of the Workspace can read its log; filters only narrow
// within it, so a Brand id from another Workspace simply matches nothing.
export async function listActivity(
  actor: Actor,
  workspaceId: string,
  filters: ActivityFiltersInput = {},
): Promise<Result<ActivityEntry[]>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const parsed = activityFiltersSchema.safeParse(filters);
  if (!parsed.success) return fail("INVALID_INPUT", INVALID_FILTERS, z.flattenError(parsed.error).fieldErrors);
  const { event, brandId, from, to } = parsed.data;
  const createdAt = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lt: new Date(new Date(to).getTime() + DAY_MS) }),
  };
  return ok(await findActivity({ workspaceId, event, brandId, createdAt }, ACTIVITY_LOG_PAGE_SIZE));
}
