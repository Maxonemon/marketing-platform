import { z } from "zod";
import type { Task } from "@/generated/prisma/client";
import { writeVariants, type Variant } from "@/lib/ai/content-agent";
import { AiProviderError, type AiProvider } from "@/lib/ai/provider";
import { CHANNELS, CONTENT_TYPES } from "@/lib/content-options";
import { db } from "@/lib/db";
import { CONTENT_BRIEF_MAX_LENGTH } from "@/lib/limits";
import type { Actor } from "@/lib/permissions";
import { appendActivity } from "./activity-log";
import { getBrand } from "./brands";
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

// The background function for a content Task: Inngest calls it in the app, tests call
// it directly. QUEUED → RUNNING → IN_REVIEW with the Variants saved as Content Assets,
// or FAILED with a message safe to show members, logged to the Activity Log. A Task
// that is no longer QUEUED (cancelled, or claimed by a duplicate event) is left alone.
// If the database is unreachable even for recording the failure, the Task stays
// RUNNING; recovering such Tasks belongs to the retry work (tickets 06 and 10).
export async function runContentTask(taskId: string, ai: AiProvider): Promise<void> {
  const claimed = await db.task.updateMany({
    where: { id: taskId, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  if (claimed.count === 0) return;
  try {
    const task = await db.task.findUniqueOrThrow({ where: { id: taskId }, include: { brand: true } });
    const variants = await writeVariants(ai, task.brand, contentRequestSchema.parse(task.input));
    await saveVariants(taskId, variants);
  } catch (error: unknown) {
    const isAiFailure = error instanceof AiProviderError;
    await failTask(taskId, isAiFailure ? error.message : TASK_FAILED_UNEXPECTEDLY);
    // An AI failure is fully handled. Anything else is a bug or an outage: rethrown so
    // the background runner records it with its stack.
    if (!isAiFailure) throw error;
  }
}

async function saveVariants(taskId: string, variants: Variant[]): Promise<void> {
  await db.$transaction([
    db.contentAsset.createMany({
      data: variants.map(({ subject, body }, index) => ({ taskId, variant: index + 1, subject, body })),
    }),
    db.task.update({ where: { id: taskId }, data: { status: "IN_REVIEW", finishedAt: new Date() } }),
  ]);
}

async function failTask(taskId: string, error: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const task = await tx.task.update({ where: { id: taskId }, data: { status: "FAILED", error, finishedAt: new Date() } });
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
