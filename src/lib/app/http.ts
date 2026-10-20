import type { AppError, AppErrorCode } from "./result";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_INPUT: 400,
};

// Maps an application-layer error to a JSON error response.
export function errorResponse(error: AppError): Response {
  return Response.json({ error }, { status: STATUS_BY_CODE[error.code] });
}

export const unauthenticatedResponse = (): Response =>
  errorResponse({ code: "UNAUTHENTICATED", message: "Sign in to continue." });
