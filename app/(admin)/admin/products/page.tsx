import Link from "next/link";
import { AdminProductsManager } from "@/components/admin/admin-products-manager";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import { Button } from "@/components/ui/button";
import { getAdminProducts } from "@/lib/db/repository";

type AdminProductsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({
  searchParams,
}: AdminProductsPageProps) {
  const params = await searchParams;
  const adminProducts = await getAdminProducts();
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
