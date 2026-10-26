import { z } from "zod";
import type { Task } from "@/generated/prisma/client";
import { writeVariants, type WrittenVariants } from "@/lib/ai/content-agent";
import { estimateCostMicroUsd } from "@/lib/ai/pricing";
import type { BrandRules } from "@/lib/brand-rules";
import { AiProviderError, type AiProvider, type AiUsage } from "@/lib/ai/provider";
import { CHANNELS, CONTENT_TYPES } from "@/lib/content-options";
import { db } from "@/lib/db";
import { CONTENT_BRIEF_MAX_LENGTH } from "@/lib/limits";
import type { Notifier } from "@/lib/notifications/notifier";
import type { Actor } from "@/lib/permissions";
import { appendActivity } from "./activity-log";
import { checkContent } from "./content-edits";
import { getBrand } from "./brands";
import { notifyTeam, type TeamNotification } from "./notifications";
import { fail, ok, type Result } from "./result";

// What a content Task is asked to write; stored as the Task's input.
export const contentRequestSchema = z.object({
  contentType: z.enum(CONTENT_TYPES, "Choose a content type."),
  channel: z.enum(CHANNELS, "Choose a Channel."),
  brief: z
    .string()
    .trim()
    .min(1, "Describe what to write.")
    .max(CONTENT_BRIEF_MAX_LENGTH, `Use at most ${CONTENT_BRIEF_MAX_LENGTH} characters.`),
});

export type ContentRequest = z.output<typeof contentRequestSchema>;
// As submitted from the form: any text, checked by the schema.
export type ContentRequestInput = { [Field in keyof ContentRequest]: string };

// Starts a Task's background run: the app sends an Inngest event, tests record the call.
export type StartTask = (taskId: string) => Promise<void>;

export const TASK_START_FAILED = "The Task couldn't be started. Request the content again.";
export const TASK_FAILED_UNEXPECTEDLY = "Something went wrong while writing the content. Request it again.";

// Stores a QUEUED Task and starts its background run. The AI is never called here, so
// the request returns at once.
export async function requestContent(
  actor: Actor,
  workspaceId: string,
  brandId: string,
  input: ContentRequestInput,
  startTask: StartTask,
): Promise<Result<Task>> {
  const brand = await getBrand(actor, workspaceId, brandId);
  if (!brand.ok) return brand;
  const parsed = contentRequestSchema.safeParse(input);
  if (!parsed.success) {
    return fail("INVALID_INPUT", "Check the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  }
  const task = await db.task.create({
    data: { workspaceId, brandId, requestedById: actor.userId, type: "CONTENT_GENERATION", input: parsed.data },
  });
  try {
    await startTask(task.id);
  } catch (error: unknown) {
    // Nothing would ever run it, so it must not stay QUEUED. Rethrown: in production
    // Next.js shows the member a generic error and keeps the details in the server log.
    await failTask(task.id, TASK_START_FAILED);
    throw error;
  }
  return ok(task);
}

export interface RunOptions {
  // False while the background runner will still retry: a transient AI error then hands
  // the Task back instead of failing it. Defaults to true: no retry follows.
  isFinalAttempt?: boolean;
  // Tells the team once the Task is settled (Review ready, or failed), after it commits.
  notifier?: Notifier;
}

// DONE: the Task is settled (IN_REVIEW or FAILED) or was not this run's to settle.
// RETRY: a transient AI error put it back to QUEUED; the runner must run it again.
export type RunOutcome = "DONE" | "RETRY";

// The background function for a content Task: Inngest calls it in the app, tests call
// it directly. QUEUED → RUNNING → IN_REVIEW with the Variants saved as Content Assets,
// or FAILED with a message safe to show members, logged to the Activity Log. A Task
// that is no longer QUEUED (cancelled, or claimed by a duplicate event) is left alone.
// If the database is unreachable even for recording the failure, the Task stays
// RUNNING; recovering such Tasks belongs to the retry work (ticket 10).
export async function runContentTask(
  taskId: string,
  ai: AiProvider,
  { isFinalAttempt = true, notifier }: RunOptions = {},
): Promise<RunOutcome> {
  const tell = async (notification: TeamNotification) => {
    if (notifier) await notifyTeam(notifier, notification);
  };
  const claimed = await db.task.updateMany({
    where: { id: taskId, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  if (claimed.count === 0) return "DONE";
  try {
    const task = await db.task.findUniqueOrThrow({ where: { id: taskId }, include: { brand: true } });
    const written = await writeVariants(ai, task.brand, contentRequestSchema.parse(task.input));
    await saveVariants(taskId, written, task.brand);
    await tell({ kind: "REVIEW_READY", taskId });
    return "DONE";
  } catch (error: unknown) {
    if (!(error instanceof AiProviderError)) {
      // A bug or an outage: rethrown so the background runner records it with its stack.
      await failTask(taskId, TASK_FAILED_UNEXPECTEDLY);
      await tell({ kind: "TASK_FAILED", taskId });
      throw error;
    }
    if (error.transient && !isFinalAttempt) {
      await releaseTask(taskId);
      return "RETRY";
    }
    await failTask(taskId, error.message, error.usage);
    await tell({ kind: "TASK_FAILED", taskId });
    return "DONE";
  }
}

// Back to QUEUED, so the retry can claim it like a first run.
async function releaseTask(taskId: string): Promise<void> {
  await db.task.update({ where: { id: taskId }, data: { status: "QUEUED", startedAt: null } });
}

// Each Variant is saved with the Brand rules it breaks, subject line included.
async function saveVariants(taskId: string, { variants, usage }: WrittenVariants, rules: BrandRules): Promise<void> {
  await db.$transaction([
    db.contentAsset.createMany({
      data: variants.map(({ subject, body }, index) => ({
        taskId,
        variant: index + 1,
        subject,
        body,
        ruleViolations: checkContent({ subject: subject ?? null, body }, rules),
      })),
    }),
    db.task.update({
      where: { id: taskId },
      data: { status: "IN_REVIEW", finishedAt: new Date(), ...usageFields(usage) },
    }),
  ]);
}

function usageFields(usage: AiUsage) {
  const { model: aiModel, inputTokens, outputTokens } = usage;
  return { aiModel, inputTokens, outputTokens, costMicroUsd: estimateCostMicroUsd(usage) };
}

// `usage` is known when the model answered but the answer was unusable: it was billed.
async function failTask(taskId: string, error: string, usage?: AiUsage): Promise<void> {
  await db.$transaction(async (tx) => {
    const task = await tx.task.update({
      where: { id: taskId },
      data: { status: "FAILED", error, finishedAt: new Date(), ...(usage && usageFields(usage)) },
    });
    await appendActivity(tx, {
      workspaceId: task.workspaceId,
      actor: "system",
      brandId: task.brandId,
      taskId: task.id,
      event: "TASK_FAILED",
      details: { error },
    });
  });
}
