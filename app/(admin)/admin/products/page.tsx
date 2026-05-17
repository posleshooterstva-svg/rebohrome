import Link from "next/link";
import {
  deleteProductAction,
  updateProductAction,
} from "@/app/actions/marketplace";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import { Button } from "@/components/ui/button";
import { getAdminProducts } from "@/lib/db/repository";
import {
  productRarities,
  productShapes,
  supportedCurrencies,
} from "@/lib/rebohrome-data";

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
      title="Products Management"
      description="Maintain stock, pricing, rarity, and collection placement in one dedicated products view."
    >
      {banner ? (
        <div className="mb-6 rounded-[20px] border border-emerald-300/50 bg-emerald-100/70 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          {banner}
        </div>
      ) : null}
      {error ? (
        <div className="mb-6 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      <div className="mb-6">
        <Button asChild>
          <Link href="/admin/upload">Add new product</Link>
        </Button>
      </div>
      <div className="space-y-4">
        {adminProducts.map((product) => (
          <div
            key={product.id}
            className="rounded-[24px] border border-line bg-panel-strong p-5"
          >
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-foreground">
                  {product.title}
                </div>
                <div className="mt-1 text-sm text-muted">
                  {product.collection} · {product.status}
                </div>
              </div>
              <form action={deleteProductAction}>
                <input name="id" type="hidden" value={product.id} />
                <Button type="submit" variant="secondary">
                  Archive product
                </Button>
              </form>
            </div>
            <form action={updateProductAction} className="space-y-4">
              <input name="id" type="hidden" value={product.id} />
              <div className="grid gap-3 lg:grid-cols-2">
                <input
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                  defaultValue={product.title}
                  name="title"
                  placeholder="Product title"
                />
                <select
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                  defaultValue={product.currency}
                  name="currency"
                >
                  {supportedCurrencies.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
                <input
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                  defaultValue={product.collection}
                  name="collection"
                  placeholder="Collection"
                />
                <input
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                  defaultValue={product.category}
                  name="category"
                  placeholder="Category"
                />
                <input
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                  defaultValue={product.edition}
                  name="edition"
                  placeholder="Edition"
                />
                <select
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                  defaultValue={product.rarity}
                  name="rarity"
                >
                  {productRarities.map((rarity) => (
                    <option key={rarity} value={rarity}>
                      {rarity}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                  defaultValue={product.shape}
                  name="shape"
                >
                  {productShapes.map((shape) => (
                    <option key={shape} value={shape}>
                      {shape}
                    </option>
                  ))}
                </select>
                <input
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                  defaultValue={product.price}
                  min="0"
                  name="price"
                  step="1"
                  type="number"
                />
                <input
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                  defaultValue={product.stock}
                  min="0"
                  name="stock"
                  step="1"
                  type="number"
                />
                <select
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                  defaultValue={product.defaultDeliveryType}
                  name="defaultDeliveryType"
                >
                  <option value="digital">Digital Delivery</option>
                  <option value="physical">Physical Delivery</option>
                </select>
                <select
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                  defaultValue={product.status}
                  name="status"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <input
                className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                defaultValue={product.tagline}
                name="tagline"
                placeholder="Tagline"
              />
              <label className="flex items-center justify-between rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground">
                <div>
                  <div className="font-medium text-foreground">Featured release</div>
                  <div className="mt-1 text-sm text-muted">
                    Highlight this product in archive-led discovery surfaces.
                  </div>
                </div>
                <input
                  className="size-4 accent-[var(--accent)]"
                  defaultChecked={product.featured}
                  name="featured"
                  type="checkbox"
                />
              </label>
              <textarea
                className="min-h-[120px] w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                defaultValue={product.description}
                name="description"
              />
              <div className="grid gap-3 lg:grid-cols-2">
                <textarea
                  className="min-h-[110px] w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                  defaultValue={product.deliveryDigital}
                  name="deliveryDigital"
                />
                <textarea
                  className="min-h-[110px] w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                  defaultValue={product.deliveryPhysical}
                  name="deliveryPhysical"
                />
              </div>
              <div>
                <Button type="submit">Save changes</Button>
              </div>
            </form>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
