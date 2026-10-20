import { describe, expect, it } from "vitest";
import { auth } from "./auth";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./limits";

// The sign-up form's messages quote these limits, so Better Auth must enforce the same ones.
describe("password limits", () => {
  function signUpWith(password: string): Promise<Response> {
    return auth.api.signUpEmail({
      body: { email: `limits-${password.length}@example.test`, password, name: "Limits" },
      asResponse: true,
    });
  }

  it("refuses a password one character shorter than the minimum", async () => {
    const response = await signUpWith("p".repeat(PASSWORD_MIN_LENGTH - 1));

    expect(await response.json()).toMatchObject({ code: "PASSWORD_TOO_SHORT" });
  });

  it("accepts a password of exactly the minimum length", async () => {
    const response = await signUpWith("p".repeat(PASSWORD_MIN_LENGTH));

    expect(response.status).toBe(200);
  });

  it("refuses a password one character longer than the maximum", async () => {
    const response = await signUpWith("p".repeat(PASSWORD_MAX_LENGTH + 1));

    expect(await response.json()).toMatchObject({ code: "PASSWORD_TOO_LONG" });
  });
});
