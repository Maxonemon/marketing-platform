// Placeholder module so the test pipeline runs from day one.
// The first ticket replaces this with the real approval service.
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export function canExecute(status: ApprovalStatus): boolean {
  return status === "APPROVED";
}
