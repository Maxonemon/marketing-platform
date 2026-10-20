import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./auth-error-message";

describe("authErrorMessage", () => {
  it("does not blame the password when the server fails (the reported bug)", () => {
    const message = authErrorMessage("sign-up", { status: 500 });

    expect(message).not.toMatch(/password/i);
    expect(message).toMatch(/went wrong/i);
  });

  it("asks for a longer password only when the password is too short", () => {
    expect(authErrorMessage("sign-up", { status: 400, code: "PASSWORD_TOO_SHORT" })).toBe(
      "Use a password of at least 8 characters.",
    );
  });

  it("gives the same answer for an existing email as for any other refused sign-up", () => {
    expect(authErrorMessage("sign-up", { status: 422, code: "USER_ALREADY_EXISTS" })).toBe(
      authErrorMessage("sign-up", { status: 400, code: "SOMETHING_ELSE" }),
    );
  });

  it("uses one message for every refused sign-in, so it never reveals which emails exist", () => {
    expect(authErrorMessage("sign-in", { status: 401, code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "That email and password don't match an account.",
    );
    expect(authErrorMessage("sign-in", { status: 500 })).toMatch(/went wrong/i);
  });
});
