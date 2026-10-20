import { describe, expect, it } from "vitest";
import { createWorkspace } from "@/lib/app/workspaces";
import { auth } from "@/lib/auth";
import { GET } from "./route";

const PASSWORD = "correct-horse-battery";

// Turns Better Auth's Set-Cookie headers into a Cookie header for the next request.
function cookieFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");
}

// Signs up through Better Auth and returns the session cookie plus the new user's id.
async function signUp(email: string): Promise<{ cookie: string; userId: string }> {
  const response = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: email }, asResponse: true });
  const cookie = cookieFrom(response);
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  if (!session) throw new Error("sign-up did not create a session");
  return { cookie, userId: session.user.id };
}

function requestWorkspace(workspaceId: string, cookie?: string): Promise<Response> {
  const request = new Request(`http://localhost:3000/api/workspaces/${workspaceId}`, {
    headers: cookie ? { cookie } : {},
  });
  return GET(request, { params: Promise.resolve({ workspaceId }) });
}

describe("GET /api/workspaces/[workspaceId]", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const response = await requestWorkspace("any-workspace-id");

    expect(response.status).toBe(401);
  });

  it("answers 404 to a signed-in user who is not a member", async () => {
    const owner = await signUp("owner@example.test");
    const outsider = await signUp("outsider@example.test");
    const created = await createWorkspace({ userId: owner.userId }, { name: "Acme", slug: "acme" });
    if (!created.ok) throw new Error("setup failed");

    const response = await requestWorkspace(created.value.id, outsider.cookie);

    expect(response.status).toBe(404);
  });

  it("rejects the old session cookie with 401 after sign-out", async () => {
    const owner = await signUp("owner@example.test");
    const created = await createWorkspace({ userId: owner.userId }, { name: "Acme", slug: "acme" });
    if (!created.ok) throw new Error("setup failed");

    await auth.api.signOut({ headers: new Headers({ cookie: owner.cookie }) });
    const response = await requestWorkspace(created.value.id, owner.cookie);

    expect(response.status).toBe(401);
  });

  it("gives a returning user a working session when they sign in again", async () => {
    const owner = await signUp("owner@example.test");
    const created = await createWorkspace({ userId: owner.userId }, { name: "Acme", slug: "acme" });
    if (!created.ok) throw new Error("setup failed");
    await auth.api.signOut({ headers: new Headers({ cookie: owner.cookie }) });

    const signIn = await auth.api.signInEmail({ body: { email: "owner@example.test", password: PASSWORD }, asResponse: true });
    const response = await requestWorkspace(created.value.id, cookieFrom(signIn));

    expect(response.status).toBe(200);
  });

  it("returns the Workspace to its Owner", async () => {
    const owner = await signUp("owner@example.test");
    const created = await createWorkspace({ userId: owner.userId }, { name: "Acme", slug: "acme" });
    if (!created.ok) throw new Error("setup failed");

    const response = await requestWorkspace(created.value.id, owner.cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ slug: "acme", role: "OWNER" });
  });
});
