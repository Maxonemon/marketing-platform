import { errorResponse, unauthenticatedResponse } from "@/lib/app/http";
import { getWorkspace } from "@/lib/app/workspaces";
import { getActorFromHeaders } from "@/lib/session";

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  const actor = await getActorFromHeaders(request.headers);
  if (!actor) return unauthenticatedResponse();

  const { workspaceId } = await params;
  const result = await getWorkspace(actor, workspaceId);
  return result.ok ? Response.json(result.value) : errorResponse(result.error);
}
