import { z } from "zod";
import { Prisma, type WorkspaceRole } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRole, WORKSPACE_NOT_FOUND, type Actor } from "@/lib/permissions";
import { fail, ok, type Result } from "./result";

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80, "Use at most 80 characters."),
  slug: z
    .string()
    .trim()
    .min(3, "Use at least 3 characters.")
    .max(48, "Use at most 48 characters.")
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens, e.g. acme-agency."),
});

export type CreateWorkspaceInput = z.input<typeof createWorkspaceSchema>;

const SLUG_TAKEN = "That slug is already taken.";

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
    return ok({ id: workspace.id, name: workspace.name, slug: workspace.slug, role: "OWNER" });
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
  return ok({ id: workspace.id, name: workspace.name, slug: workspace.slug, role: access.value.role });
}

export async function getWorkspaceBySlug(actor: Actor, slug: string): Promise<Result<WorkspaceSummary>> {
  const workspace = await db.workspace.findUnique({ where: { slug }, select: { id: true } });
  if (!workspace) return fail("NOT_FOUND", WORKSPACE_NOT_FOUND);
  return getWorkspace(actor, workspace.id);
}

export async function listMyWorkspaces(actor: Actor): Promise<WorkspaceSummary[]> {
  const memberships = await db.workspaceMember.findMany({
    where: { userId: actor.userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map(({ workspace, role }) => ({ id: workspace.id, name: workspace.name, slug: workspace.slug, role }));
}
