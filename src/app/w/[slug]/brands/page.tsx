import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listBrands } from "@/lib/app/brands";
import { requireWorkspace } from "../require-workspace";
import { createBrandAction } from "./actions";
import { BrandForm } from "./brand-form";

interface BrandsPageProps {
  params: Promise<{ slug: string }>;
}

export default function BrandsPage({ params }: BrandsPageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Brands params={params} />
    </Suspense>
  );
}

async function Brands({ params }: BrandsPageProps) {
  const { slug } = await params;
  const { actor, workspace } = await requireWorkspace(slug);
  const brands = await listBrands(actor, workspace.id);
  if (!brands.ok) notFound();

  return (
    <>
      <h1 className="text-2xl font-semibold">Brands</h1>
      {brands.value.length === 0 ? (
        <p className="text-zinc-500">No Brands yet. An agency adds one Brand per client.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-500/30 rounded border border-zinc-500/30">
          {brands.value.map((brand) => (
            <li key={brand.id}>
              <Link href={`/w/${workspace.slug}/brands/${brand.id}`} className="flex justify-between gap-4 px-3 py-2 hover:bg-zinc-500/10">
                <span className="font-medium">{brand.name}</span>
                {brand.industry && <span className="text-sm text-zinc-500">{brand.industry}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Add a Brand</h2>
        <BrandForm action={createBrandAction.bind(null, workspace.id, workspace.slug)} submitLabel="Create Brand" />
      </section>
    </>
  );
}
