import { randomUUID } from "node:crypto";
import type { Actor } from "@/lib/permissions";
import type { WorkspaceRole } from "@/generated/prisma/client";
import { createFakeAiProvider } from "@/lib/ai/fake-provider";
import { createBrand, type BrandSettingsInput } from "@/lib/app/brands";
import { requestContent, runContentTask } from "@/lib/app/content-requests";
import { getReview, submitReview } from "@/lib/app/reviews";
import { createWorkspace } from "@/lib/app/workspaces";
import { db } from "@/lib/db";

// Users are created by Better Auth in the app; tests insert them directly.
export async function createTestUser(name = "Test User"): Promise<Actor> {
  const id = randomUUID();
  await db.user.create({ data: { id, name, email: `${id}@example.test` } });
  return { userId: id };
}

// Adding members is ticket 11; until then tests insert memberships directly.
export async function addTestMember(workspaceId: string, actor: Actor, role: WorkspaceRole): Promise<void> {
  await db.workspaceMember.create({ data: { workspaceId, userId: actor.userId, role } });
}

// A Workspace owned by `owner`, created the way the app creates it. Returns its id.
export async function createTestWorkspace(owner: Actor, slug: string): Promise<string> {
  const created = await createWorkspace(owner, { name: slug, slug });
  if (!created.ok) throw new Error(`Test setup: could not create Workspace "${slug}".`);
  return created.value.id;
}

// A Brand in the Workspace, created the way the app creates it. Returns its id.
export async function createTestBrand(actor: Actor, workspaceId: string, settings: BrandSettingsInput): Promise<string> {
  const created = await createBrand(actor, workspaceId, settings);
  if (!created.ok) throw new Error(`Test setup: could not create Brand "${settings.name}".`);
  return created.value.id;
}

export interface TestReview {
  taskId: string;
  // The Content Asset id of its first Variant.
  variantId: string;
}

// The fake AI's reply for a social post: three Variants, the first with `body`.
export function fakeVariants(body: string) {
  return { variants: [{ body }, { body: `${body} (Variant 2)` }, { body: `${body} (Variant 3)` }] };
}

// A social post for the mock Channel, requested by `actor` and written by the fake AI
// as three Variants, the first with `body`: an IN_REVIEW Task, created the way the app creates it.
export async function createTestReview(actor: Actor, workspaceId: string, brandId: string, body: string): Promise<TestReview> {
  const request = { contentType: "SOCIAL_POST", channel: "MOCK", brief: "Announce our autumn blend." };
  const requested = await requestContent(actor, workspaceId, brandId, request, async () => {});
  if (!requested.ok) throw new Error("Test setup: could not request content.");
  const taskId = requested.value.id;
  await runContentTask(taskId, createFakeAiProvider(() => fakeVariants(body)));
  const review = await getReview(actor, workspaceId, taskId);
  const variantId = review.ok ? review.value.variants[0]?.id : undefined;
  if (!variantId) throw new Error("Test setup: the content Task wrote no Variant.");
  return { taskId, variantId };
}

// A Review whose first Variant (`body`) `actor` submitted: returns its Pending Approval's id.
export async function createTestApproval(actor: Actor, workspaceId: string, brandId: string, body: string): Promise<string> {
  const { taskId, variantId } = await createTestReview(actor, workspaceId, brandId, body);
  const submitted = await submitReview(actor, workspaceId, taskId, { contentAssetId: variantId });
  if (!submitted.ok) throw new Error("Test setup: could not submit the Review.");
  return submitted.value.id;
}
