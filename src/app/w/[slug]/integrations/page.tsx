import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSlackIntegration } from "@/lib/app/integrations";
import { requireWorkspace } from "../require-workspace";
import { Timestamp } from "../timestamp";
import { connectSlackAction, removeSlackAction, testSlackAction } from "./actions";
import { ConnectSlackForm, RemoveSlackForm, TestSlackForm } from "./integration-forms";

interface IntegrationsPageProps {
  params: Promise<{ slug: string }>;
}

export default function IntegrationsPage({ params }: IntegrationsPageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Integrations params={params} />
    </Suspense>
  );
}

async function Integrations({ params }: IntegrationsPageProps) {
  const { slug } = await params;
  const { actor, workspace } = await requireWorkspace(slug);
  const heading = (
    <div className="flex flex-col gap-1">
      <h1>Integrations</h1>
      <p className="text-sm text-muted">Slack tells the team when something needs a decision. It only notifies: deciding happens here.</p>
    </div>
  );
  if (workspace.role === "MEMBER") {
    return (
      <>
        {heading}
        <p className="text-muted">Only Owners and Admins manage Integrations.</p>
      </>
    );
  }
  const result = await getSlackIntegration(actor, workspace.id);
  if (!result.ok) notFound();
  const slack = result.value;

  return (
    <>
      {heading}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Slack</h2>
        {slack === null ? (
          <p className="text-sm text-muted">
            Not connected. In Slack, add an incoming webhook for the channel to notify, then paste its URL here. It is
            stored encrypted and never shown in full again.
          </p>
        ) : (
          <>
            <p className="text-sm">
              {slack.maskedWebhookUrl === null ? (
                <span className="text-danger">The stored webhook URL can&apos;t be read: paste it again below.</span>
              ) : (
                <>
                  Connected to <code className="break-all">{slack.maskedWebhookUrl}</code>
                </>
              )}{" "}
              <span className="text-muted">
                (changed <Timestamp date={slack.updatedAt} />)
              </span>
            </p>
            <TestSlackForm action={testSlackAction.bind(null, workspace.id)} />
          </>
        )}
        <ConnectSlackForm action={connectSlackAction.bind(null, workspace.id)} connected={slack !== null} />
        {slack !== null && <RemoveSlackForm action={removeSlackAction.bind(null, workspace.id)} />}
      </section>
    </>
  );
}
