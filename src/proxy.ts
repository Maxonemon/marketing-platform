import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: no session cookie → sign-in page (or 401 for API routes).
// The real check is getActorFromHeaders/requireActor plus the permissions module,
// so a forged cookie gets no further than this.
export function proxy(request: NextRequest): NextResponse {
  if (getSessionCookie(request)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/sign-in", request.url));
}

export const config = {
  // Everything except: the sign-in page, Better Auth's endpoints and Next's assets
  // (whole path segments only, so /sign-in-later or /api/authors still run the
  // proxy), and top-level public images such as /next.svg.
  matcher: ["/((?!(?:sign-in|api/auth|_next/static|_next/image)(?:/|$))(?![^/]*\\.(?:svg|png|jpg|jpeg|ico)$).*)"],
};
