import { randomUUID } from "node:crypto";
import type { Actor } from "@/lib/permissions";
import type { WorkspaceRole } from "@/generated/prisma/client";
import { createBrand, type BrandSettingsInput } from "@/lib/app/brands";
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
