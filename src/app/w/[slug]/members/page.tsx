import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listMembers, type MemberList } from "@/lib/app/members";
import type { WorkspaceSummary } from "@/lib/app/workspaces";
import { requireWorkspace } from "../require-workspace";
import { Timestamp } from "../timestamp";
import { changeRoleAction, inviteAction, removeMemberAction } from "./actions";
import { InviteForm, RemoveForm, RoleForm } from "./member-forms";
import { ROLE_LABELS } from "./role-display";

interface MembersPageProps {
  params: Promise<{ slug: string }>;
}

export default function MembersPage({ params }: MembersPageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Members params={params} />
    </Suspense>
  );
}

async function Members({ params }: MembersPageProps) {
  const { slug } = await params;
  const { actor, workspace } = await requireWorkspace(slug);
  const result = await listMembers(actor, workspace.id);
  if (!result.ok) notFound();
  const canInvite = workspace.role === "OWNER" || workspace.role === "ADMIN";

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1>Members</h1>
        <p className="text-sm text-muted">
          Owners and Admins approve and invite; Members draft and edit. Only Owners change roles or remove members.
        </p>
      </div>
      <MemberRows list={result.value} workspace={workspace} />
      {result.value.invitations.length > 0 && <Invitations list={result.value} />}
      {canInvite && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Invite someone</h2>
          <p className="text-sm text-muted">
            No email is sent: they become a member the first time they sign in with this email.
          </p>
          <InviteForm action={inviteAction.bind(null, workspace.id)} />
        </section>
      )}
    </>
  );
}

interface MemberListProps {
  list: MemberList;
  workspace: WorkspaceSummary;
}

// Owners also get role and remove controls for each member; the server enforces the same.
function MemberRows({ list, workspace }: MemberListProps) {
  const isOwner = workspace.role === "OWNER";
  return (
    <ul className="surface flex flex-col divide-y divide-line overflow-hidden">
      {list.members.map((member) => (
        <li key={member.userId} className="flex flex-col gap-2 px-3 py-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="wrap-break-word">
              <span className="font-medium">{member.name}</span> <span className="text-muted">{member.email}</span>
            </span>
            <span>{ROLE_LABELS[member.role]}</span>
          </div>
          {isOwner && (
            <div className="flex flex-wrap gap-3">
              <RoleForm action={changeRoleAction.bind(null, workspace.id, member.userId)} role={member.role} />
              <RemoveForm action={removeMemberAction.bind(null, workspace.id, member.userId)} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Invitations({ list }: Pick<MemberListProps, "list">) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">Invited, not signed in yet</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {list.invitations.map((invitation) => (
          <li key={invitation.id} className="wrap-break-word">
            {invitation.email} as {ROLE_LABELS[invitation.role]}{" "}
            <span className="text-muted">
              invited by {invitation.invitedBy} <Timestamp date={invitation.invitedAt} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
