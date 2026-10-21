import Link from "next/link";
import { Suspense } from "react";
import { requireWorkspace } from "./require-workspace";

interface WorkspacePageProps {
  params: Promise<{ slug: string }>;
}

export default function WorkspacePage({ params }: WorkspacePageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <WorkspaceHome params={params} />
    </Suspense>
  );
}

async function WorkspaceHome({ params }: WorkspacePageProps) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);

  return (
    <>
      <h1 className="text-2xl font-semibold">{workspace.name}</h1>
      <p className="text-zinc-500">
        Start by adding your{" "}
        <Link href={`/w/${workspace.slug}/brands`} className="underline">
          Brands
        </Link>
        , then request content from a Brand&apos;s page and follow it in{" "}
        <Link href={`/w/${workspace.slug}/tasks`} className="underline">
          Tasks
        </Link>
        .
      </p>
    </>
  );
}
