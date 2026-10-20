import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: no session cookie → sign-in page (or 401 for API routes).
// The real check is getActorFromHeaders/requireActor plus the permissions module,
// so a forged cookie gets no further than this.
export function proxy(request: NextRequest): Response {
  if (getSessionCookie(request)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return Response.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/sign-in", request.url));
}

export const config = {
  // Everything except the sign-in page, Better Auth's own endpoints and static assets.
  matcher: ["/((?!sign-in|api/auth|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
