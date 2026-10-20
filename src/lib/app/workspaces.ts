import { z } from "zod";
import { Prisma, type Workspace, type WorkspaceRole } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { SLUG_MAX_LENGTH, SLUG_MIN_LENGTH, SLUG_PATTERN, WORKSPACE_NAME_MAX_LENGTH } from "@/lib/limits";
import { requireRole, WORKSPACE_NOT_FOUND, type Actor } from "@/lib/permissions";
import { fail, ok, type Result } from "./result";

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
}

const createWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(WORKSPACE_NAME_MAX_LENGTH, `Use at most ${WORKSPACE_NAME_MAX_LENGTH} characters.`),
  slug: z
    .string()
    .trim()
    .min(SLUG_MIN_LENGTH, `Use at least ${SLUG_MIN_LENGTH} characters.`)
    .max(SLUG_MAX_LENGTH, `Use at most ${SLUG_MAX_LENGTH} characters.`)
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens, e.g. acme-agency."),
});

export type CreateWorkspaceInput = z.input<typeof createWorkspaceSchema>;

const SLUG_TAKEN = "That slug is already taken.";

function toSummary(workspace: Workspace, role: WorkspaceRole): WorkspaceSummary {
  return { id: workspace.id, name: workspace.name, slug: workspace.slug, role };
}

// Creates the Workspace and the caller's OWNER membership in one write.
export async function createWorkspace(actor: Actor, input: CreateWorkspaceInput): Promise<Result<WorkspaceSummary>> {
  const parsed = createWorkspaceSchema.safeParse(input);
  if (!parsed.success) {
    return fail("INVALID_INPUT", "Check the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  }
  const { name, slug } = parsed.data;
  try {
    const workspace = await db.workspace.create({
      data: { name, slug, members: { create: { userId: actor.userId, role: "OWNER" } } },
    });
    return ok(toSummary(workspace, "OWNER"));
  } catch (error: unknown) {
    if (isUniqueViolation(error)) return fail("CONFLICT", SLUG_TAKEN, { slug: [SLUG_TAKEN] });
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function getWorkspace(actor: Actor, workspaceId: string): Promise<Result<WorkspaceSummary>> {
  const access = await requireRole(actor, workspaceId, "MEMBER");
  if (!access.ok) return access;
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return fail("NOT_FOUND", WORKSPACE_NOT_FOUND);
  return ok(toSummary(workspace, access.value.role));
}

// Resolves the slug through the caller's own memberships, so a Workspace they don't
// belong to is never read; then the usual permission check applies.
export async function getWorkspaceBySlug(actor: Actor, slug: string): Promise<Result<WorkspaceSummary>> {
  const membership = await db.workspaceMember.findFirst({
    where: { userId: actor.userId, workspace: { slug } },
    select: { workspaceId: true },
  });
  if (!membership) return fail("NOT_FOUND", WORKSPACE_NOT_FOUND);
  return getWorkspace(actor, membership.workspaceId);
}

// Reads only the caller's own memberships, so it needs no per-Workspace permission check.
export async function listMyWorkspaces(actor: Actor): Promise<WorkspaceSummary[]> {
  const memberships = await db.workspaceMember.findMany({
    where: { userId: actor.userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map(({ workspace, role }) => toSummary(workspace, role));
}
