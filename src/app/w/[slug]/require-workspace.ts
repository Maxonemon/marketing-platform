import { notFound } from "next/navigation";
import { getWorkspaceBySlug, type WorkspaceSummary } from "@/lib/app/workspaces";
import type { Actor } from "@/lib/permissions";
import { requireActor } from "@/lib/session";

interface WorkspacePageContext {
  actor: Actor;
  workspace: WorkspaceSummary;
}

// For Workspace pages: signed out → sign-in; not a member → 404, the same as a
// Workspace that doesn't exist.
export async function requireWorkspace(slug: string): Promise<WorkspacePageContext> {
  const actor = await requireActor();
  const result = await getWorkspaceBySlug(actor, slug);
  if (!result.ok) notFound();
  return { actor, workspace: result.value };
}
