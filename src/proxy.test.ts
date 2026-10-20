import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

const SESSION_COOKIE = "better-auth.session_token=some-session";

describe("proxy matcher", () => {
  it.each(["/", "/w/acme", "/workspaces/new", "/api/workspaces/abc", "/sign-in-later", "/api/authors", "/api/workspaces/abc.png"])(
    "runs on app page or route %s",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    },
  );

  it.each(["/sign-in", "/api/auth/sign-in/email", "/_next/static/chunks/app.js", "/_next/image", "/favicon.ico", "/next.svg"])(
    "skips public path %s",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    },
  );
});

describe("proxy", () => {
  it("sends a signed-out visitor of an app page to sign-in", () => {
    const response = proxy(new NextRequest("http://localhost:3000/w/acme"));

    expect(getRedirectUrl(response)).toBe("http://localhost:3000/sign-in");
  });

  it("answers a signed-out API request with 401", async () => {
    const response = proxy(new NextRequest("http://localhost:3000/api/workspaces/abc"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("lets a request with a session cookie through to the page's own session check", () => {
    const response = proxy(new NextRequest("http://localhost:3000/w/acme", { headers: { cookie: SESSION_COOKIE } }));

    expect(response.status).toBe(200);
    expect(getRedirectUrl(response)).toBeNull();
  });
});
