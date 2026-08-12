import Link from "next/link";
import { AdminProductsManager } from "@/components/admin/admin-products-manager";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import { Button } from "@/components/ui/button";
import { getAdminProducts, getAdminRandomizedPackVersions } from "@/lib/db/repository";
import { formatDisplayDateTime, formatUsd } from "@/lib/rebohrome-data";

type AdminProductsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({
  searchParams,
}: AdminProductsPageProps) {
  const params = await searchParams;
  const [adminProducts, randomizedPacks] = await Promise.all([
    getAdminProducts(),
    getAdminRandomizedPackVersions(),
  ]);
  const banner =
    params.created === "1"
      ? "Product published successfully."
      : params.updated === "1"
        ? "Product updated successfully."
        : params.deleted === "1"
          ? "Product archived successfully."
          : null;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <AdminShell
      active="products"
      title="Product Management"
      description="Keep the catalog readable by default, then open full edit mode only when you need deeper control over imagery, pricing, and homepage placement."
    >
      <section className="mb-6 rounded-[22px] border border-line bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted">
              Randomized Engine V2
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">
              Published pack versions
            </h2>
          </div>
          <div className="text-xs text-muted">Automatic weights - immutable history</div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {randomizedPacks.map((pack) => (
            <article className="rounded-[18px] border border-line bg-panel p-4" key={pack.productId}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{pack.title}</div>
                  <div className="mt-1 text-xs text-muted">{pack.productId}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${pack.errors.length ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {pack.errors.length ? "Paused" : "Published"}
                </span>
              </div>
              {pack.current ? (
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-line bg-white px-3 py-2">Version #{pack.current.version}</div>
                  <div className="rounded-xl border border-line bg-white px-3 py-2">Pool {pack.current.outcomes.length}</div>
                  <div className="rounded-xl border border-line bg-white px-3 py-2">EV {formatUsd(pack.current.expectedValue)}</div>
                  <div className="rounded-xl border border-line bg-white px-3 py-2">Big Win {(pack.current.bigWinProbabilityBps / 100).toFixed(2)}%</div>
                  <div className="col-span-2 rounded-xl border border-line bg-white px-3 py-2 text-muted">
                    Published {pack.current.publishedAt ? formatDisplayDateTime(pack.current.publishedAt) : "-"}
                  </div>
                </div>
              ) : null}
              {pack.errors.length ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                  {pack.errors.join(" ")}
                </div>
              ) : null}
              {pack.current?.outcomes.length ? (
                <details className="mt-3 text-xs text-muted">
                  <summary className="cursor-pointer font-medium text-foreground">Current pool</summary>
                  <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
                    {pack.current.outcomes.map((outcome) => (
                      <div
                        className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border border-line bg-white px-2.5 py-2"
                        key={outcome.productId}
                      >
                        <span className="truncate">{outcome.title}</span>
                        <span className="whitespace-nowrap">
                          {formatUsd(outcome.priceSnapshot)} - {(outcome.probabilityBps / 100).toFixed(2)}% - stock {outcome.stock}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              {pack.history.length ? (
                <details className="mt-3 text-xs text-muted">
                  <summary className="cursor-pointer font-medium text-foreground">Version history</summary>
                  <div className="mt-2 space-y-1">
                    {pack.history.map((version) => (
                      <div className="flex justify-between gap-3" key={version.id}>
                        <span>#{version.version} - {version.outcomeCount} cards</span>
                        <span>{version.status}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <AdminProductsManager
        initialBanner={banner}
        initialError={error}
        initialProducts={adminProducts}
      />

      <div className="mt-6 rounded-[18px] border border-line bg-white p-5 shadow-panel">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted">
              Upload Flow
            </div>
            <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
              Need to publish a completely new archive object?
            </div>
            <div className="mt-2 text-sm leading-7 text-muted">
              Use the dedicated upload route for first-time product creation, then return
              here for fast editing, featuring, and image changes.
            </div>
          </div>
          <Button asChild>
            <Link href="/admin/upload">Open Upload Screen</Link>
          </Button>
        </div>
      </div>
    </AdminShell>
  );
}
