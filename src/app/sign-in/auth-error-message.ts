export type AuthMode = "sign-in" | "sign-up";

// The parts of a Better Auth client error the form needs.
export interface AuthFailure {
  status: number;
  code?: string;
}

const SERVER_ERROR_STATUS = 500;
const SERVER_ERROR = "Something went wrong on our side. Try again in a moment.";

// Only a password problem gets a password message. Every other refused sign-up gets one
// message, and every refused sign-in another, so the form never reveals which emails exist.
const PASSWORD_MESSAGES: Record<string, string> = {
  PASSWORD_TOO_SHORT: "Use a password of at least 8 characters.",
  PASSWORD_TOO_LONG: "Use a password of at most 128 characters.",
};

const REFUSED: Record<AuthMode, string> = {
  "sign-in": "That email and password don't match an account.",
  "sign-up": "Couldn't create the account. If you already have one, sign in instead.",
};

export function authErrorMessage(mode: AuthMode, failure: AuthFailure): string {
  if (failure.status >= SERVER_ERROR_STATUS) return SERVER_ERROR;
  const passwordMessage = mode === "sign-up" && failure.code ? PASSWORD_MESSAGES[failure.code] : undefined;
  return passwordMessage ?? REFUSED[mode];
}
