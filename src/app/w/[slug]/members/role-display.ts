import type { WorkspaceRole } from "@/generated/prisma/client";

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};
