import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Actor } from "@/lib/permissions";

// The only way to get an Actor: from a verified session, never from request input.
export async function getActorFromHeaders(requestHeaders: Headers): Promise<Actor | null> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  return session ? { userId: session.user.id } : null;
}

// For pages and server actions: signed-out visitors are sent to sign-in.
export async function requireActor(): Promise<Actor> {
  const actor = await getActorFromHeaders(await headers());
  if (!actor) redirect("/sign-in");
  return actor;
}
