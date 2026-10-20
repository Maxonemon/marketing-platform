import { randomUUID } from "node:crypto";
import type { Actor } from "@/lib/permissions";
import type { WorkspaceRole } from "@/generated/prisma/client";
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
