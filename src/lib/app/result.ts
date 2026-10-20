// Every application-layer operation returns a Result. Routes and server actions map
// AppError codes to HTTP statuses or form state; messages are safe to show users.

export type AppErrorCode = "UNAUTHENTICATED" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INVALID_INPUT";

// Messages per input field, e.g. { slug: ["That slug is already taken."] }.
export type FieldErrors = Record<string, string[]>;

export interface AppError {
  code: AppErrorCode;
  message: string;
  fieldErrors?: FieldErrors;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(code: AppErrorCode, message: string, fieldErrors?: FieldErrors): Result<T> {
  return { ok: false, error: fieldErrors ? { code, message, fieldErrors } : { code, message } };
}
