import { z } from "zod";
import type { Prisma, WorkspaceRole } from "@/generated/prisma/client";
import { db, isUniqueViolation } from "@/lib/db";
import { EMAIL_MAX_LENGTH } from "@/lib/limits";
import { requireRole, type Actor } from "@/lib/permissions";
import { appendActivity } from "./activity-log";
import { fail, ok, type Result } from "./result";

export interface MemberSummary {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: Date;
}

export interface InvitationSummary {
  id: string;
  email: string;
  role: WorkspaceRole;
  invitedBy: string;
  invitedAt: Date;
}

export interface MemberList {
  members: MemberSummary[];
  invitations: InvitationSummary[];
}

export const LAST_OWNER = "A Workspace always keeps at least one Owner: make someone else an Owner first.";
const MEMBER_NOT_FOUND = "Member not found.";
const ALREADY_MEMBER = "That person is already a member of this Workspace.";
const ALREADY_INVITED = "That email has already been invited.";
const NOT_AN_OWNER = "Only an Owner can change roles or remove members.";

// An invitation is for an Admin or a Member; Owners are made by changing a role.
const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(EMAIL_MAX_LENGTH, `Use at most ${EMAIL_MAX_LENGTH} characters.`)
    .pipe(z.email("Enter an email address, e.g. nora@example.com.")),
  role: z.enum(["ADMIN", "MEMBER"], "Choose Admin or Member."),
});

const changeRoleSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MEMBER"], "Choose Owner, Admin or Member."),
});

// As submitted: any string, checked by the schemas above.
export interface InviteInput {
  email: string;
  role: string;
}

export interface ChangeRoleInput {
  role: string;
}

// Any member can see who else is in the Workspace and who is invited.
export async function listMembers(actor: Actor, workspaceId: string): Promise<Result<MemberList>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const [members, invitations] = await Promise.all([
    db.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { user: { select: { name: true, email: true } } },
    }),
    db.workspaceInvitation.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { invitedBy: { select: { name: true } } },
    }),
  ]);
  return ok({
    members: members.map(({ userId, user, role, createdAt }) => ({ userId, ...user, role, joinedAt: createdAt })),
    invitations: invitations.map(({ id, email, role, invitedBy, createdAt }) => ({
      id,
      email,
      role,
      invitedBy: invitedBy.name,
      invitedAt: createdAt,
    })),
  });
}

// Owners and Admins invite an Admin or a Member by email. No email is sent: the person
// becomes a member the first time they sign in with that email (acceptInvitations).
export async function inviteMember(actor: Actor, workspaceId: string, input: InviteInput): Promise<Result<InvitationSummary>> {
  const access = await requireRole(actor, workspaceId, "ADMIN");
  if (!access.ok) return access;
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return fail("INVALID_INPUT", "Check the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  const { email, role } = parsed.data;
  const existing = await db.workspaceMember.findFirst({
    where: { workspaceId, user: { email: { equals: email, mode: "insensitive" } } },
    select: { id: true },
  });
  if (existing) return fail("CONFLICT", ALREADY_MEMBER, { email: [ALREADY_MEMBER] });
  try {
    const invitation = await db.$transaction(async (tx) => {
      const created = await tx.workspaceInvitation.create({
        data: { workspaceId, email, role, invitedById: actor.userId },
        include: { invitedBy: { select: { name: true } } },
      });
      await appendActivity(tx, { workspaceId, actor, event: "MEMBER_INVITED", details: { email, role } });
      return created;
    });
    return ok({ id: invitation.id, email, role, invitedBy: invitation.invitedBy.name, invitedAt: invitation.createdAt });
  } catch (error: unknown) {
    if (isUniqueViolation(error)) return fail("CONFLICT", ALREADY_INVITED, { email: [ALREADY_INVITED] });
    throw error;
  }
}

// Run at every sign-in (src/lib/auth.ts), so it checks no role: it only ever acts on the
// signed-in user's own email. Each invitation for that email becomes a membership with
// its role and is deleted, logged with the user as the actor. Deleting first makes it a
// claim: of two sign-ins at the same moment, one consumes it. Returns how many it consumed.
// Emails are not verified yet (ADR-0002), so whoever first signs up with an invited
// email gets the invitation.
export async function acceptInvitations(userId: string): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return 0;
  const email = user.email.toLowerCase();
  const invitations = await db.workspaceInvitation.findMany({ where: { email } });
  let accepted = 0;
  for (const { id, workspaceId, role } of invitations) {
    const consumed = await db.$transaction(async (tx) => {
      const deleted = await tx.workspaceInvitation.deleteMany({ where: { id } });
      if (deleted.count === 0) return false;
      await tx.workspaceMember.createMany({ data: [{ workspaceId, userId, role }], skipDuplicates: true });
      await appendActivity(tx, { workspaceId, actor: { userId }, event: "MEMBER_JOINED", details: { email, role } });
      return true;
    });
    if (consumed) accepted += 1;
  }
  return accepted;
}

// Only Owners change roles, including making another Owner; the last Owner can't be
// demoted. A member of another Workspace looks exactly like a missing one.
export async function changeRole(
  actor: Actor,
  workspaceId: string,
  memberUserId: string,
  input: ChangeRoleInput,
): Promise<Result<void>> {
  const access = await requireRole(actor, workspaceId, "OWNER");
  if (!access.ok) return access;
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return fail("INVALID_INPUT", "Check the role.", z.flattenError(parsed.error).fieldErrors);
  const { role } = parsed.data;
  return db.$transaction(async (tx): Promise<Result<void>> => {
    const checked = await checkOwnerChange(tx, actor, workspaceId, memberUserId, role);
    if (!checked.ok) return checked;
    const { name, email, role: from } = checked.value;
    if (from === role) return ok(undefined);
    await tx.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: memberUserId } }, data: { role } });
    await appendActivity(tx, { workspaceId, actor, event: "MEMBER_ROLE_CHANGED", details: { name, email, from, to: role } });
    return ok(undefined);
  });
}

// Only Owners remove members, themselves included while another Owner remains. Access
// ends at once: every operation checks membership (requireRole), so the removed member's
// next one, on an undecided Approval too, is NOT_FOUND.
export async function removeMember(actor: Actor, workspaceId: string, memberUserId: string): Promise<Result<void>> {
  const access = await requireRole(actor, workspaceId, "OWNER");
  if (!access.ok) return access;
  return db.$transaction(async (tx): Promise<Result<void>> => {
    const checked = await checkOwnerChange(tx, actor, workspaceId, memberUserId, null);
    if (!checked.ok) return checked;
    const { name, email, role } = checked.value;
    await tx.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId: memberUserId } } });
    await appendActivity(tx, { workspaceId, actor, event: "MEMBER_REMOVED", details: { name, email, role } });
    return ok(undefined);
  });
}

interface MemberToChange {
  name: string;
  email: string;
  role: WorkspaceRole;
}

// Locks the Workspace's row, so role changes and removals in it run one at a time, then
// re-reads, after the lock, that the actor is still an Owner and that an Owner remains
// once the member is given `newRole` (null: removed). Two Owners demoting each other at
// the same moment therefore can't leave the Workspace without one.
async function checkOwnerChange(
  tx: Prisma.TransactionClient,
  actor: Actor,
  workspaceId: string,
  memberUserId: string,
  newRole: WorkspaceRole | null,
): Promise<Result<MemberToChange>> {
  await tx.$queryRaw`SELECT 1 FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`;
  const memberships = await tx.workspaceMember.findMany({
    where: { workspaceId, OR: [{ userId: actor.userId }, { userId: memberUserId }, { role: "OWNER" }] },
    include: { user: { select: { name: true, email: true } } },
  });
  const actorRole = memberships.find(({ userId }) => userId === actor.userId)?.role;
  if (actorRole !== "OWNER") return fail("FORBIDDEN", NOT_AN_OWNER);
  const member = memberships.find(({ userId }) => userId === memberUserId);
  if (!member) return fail("NOT_FOUND", MEMBER_NOT_FOUND);
  const ownersLeft = memberships.filter(({ userId, role }) => role === "OWNER" && userId !== memberUserId).length;
  if (member.role === "OWNER" && newRole !== "OWNER" && ownersLeft === 0) return fail("CONFLICT", LAST_OWNER);
  return ok({ ...member.user, role: member.role });
}
