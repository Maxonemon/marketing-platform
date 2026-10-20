import type { WorkspaceRole } from "@/generated/prisma/client";
import { fail, ok, type Result } from "@/lib/app/result";
import { db } from "@/lib/db";

// The person performing an application-layer operation, taken from the session.
export interface Actor {
  userId: string;
}

export interface Membership {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

const ROLE_RANK: Record<WorkspaceRole, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

export const WORKSPACE_NOT_FOUND = "Workspace not found.";

// Every application-layer operation that touches workspace data calls this first.
// A non-member gets NOT_FOUND, exactly as for a Workspace that does not exist, so
// guessed IDs reveal nothing. A member below `minRole` gets FORBIDDEN.
//
// Pattern for workspace records in later tickets: look them up scoped by workspaceId
// (`findFirst({ where: { id, workspaceId } })`) and report a miss as NOT_FOUND, so a
// record from another Workspace is indistinguishable from a missing one.
export async function requireRole(actor: Actor, workspaceId: string, minRole: WorkspaceRole): Promise<Result<Membership>> {
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actor.userId } },
    select: { workspaceId: true, userId: true, role: true },
  });
  if (!membership) return fail("NOT_FOUND", WORKSPACE_NOT_FOUND);
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    return fail("FORBIDDEN", "You don't have permission to do this in this Workspace.");
  }
  return ok(membership);
}
