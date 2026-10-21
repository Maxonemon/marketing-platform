import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getBrand } from "@/lib/app/brands";
import { requireWorkspace } from "../../require-workspace";
import { requestContentAction } from "../../tasks/actions";
import { RequestContentForm } from "../../tasks/request-content-form";
import { updateBrandAction } from "../actions";
import { BrandForm } from "../brand-form";

interface BrandSettingsPageProps {
  params: Promise<{ slug: string; brandId: string }>;
}

export default function BrandSettingsPage({ params }: BrandSettingsPageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <BrandSettings params={params} />
    </Suspense>
  );
}

async function BrandSettings({ params }: BrandSettingsPageProps) {
  const { slug, brandId } = await params;
  const { actor, workspace } = await requireWorkspace(slug);
  const result = await getBrand(actor, workspace.id, brandId);
  if (!result.ok) notFound();
  const { id, name, websiteUrl, industry, audience, voice } = result.value;
  // Saving accepts only http(s) addresses; checked again here so a row written another
  // way (a seed script, manual SQL) can never become a javascript: link.
  const websiteLink = websiteUrl && /^https?:\/\//i.test(websiteUrl) ? websiteUrl : null;

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href={`/w/${workspace.slug}/brands`} className="text-sm text-zinc-500 underline">
          All Brands
        </Link>
        <h1 className="text-2xl font-semibold">{name}</h1>
        {websiteLink && (
          <a href={websiteLink} target="_blank" rel="noopener noreferrer" className="text-sm underline">
            {websiteLink}
          </a>
        )}
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Request content</h2>
        <p className="text-sm text-zinc-500">The content agent writes it in the background, in this Brand&apos;s voice. Follow it in Tasks.</p>
        <RequestContentForm action={requestContentAction.bind(null, workspace.id, workspace.slug, id)} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Settings</h2>
        <BrandForm
          action={updateBrandAction.bind(null, workspace.id, id)}
          initialValues={{ name, websiteUrl, industry, audience, voice }}
          submitLabel="Save settings"
        />
      </section>
    </>
  );
}
