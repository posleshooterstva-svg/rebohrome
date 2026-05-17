import Link from "next/link";
import { createProductAction } from "@/app/actions/marketplace";
import { AdminArtworkUploadField } from "@/components/admin/admin-artwork-upload-field";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import { Button } from "@/components/ui/button";
import {
  productRarities,
  productShapes,
  supportedCurrencies,
} from "@/lib/rebohrome-data";

export const dynamic = "force-dynamic";

type AdminUploadPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminUploadPage({
  searchParams,
}: AdminUploadPageProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <AdminShell
      active="upload"
      title="Card Uploads"
      description="A focused publishing screen for adding new cards, metadata, stock, and imagery without mixing it into customer-facing flows."
    >
      {error ? (
        <div className="mb-6 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      <form
        action={createProductAction}
        className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]"
        encType="multipart/form-data"
      >
        <div className="rounded-[24px] border border-line bg-panel-strong p-5">
          <div className="text-lg font-semibold text-foreground">
            Artwork upload
          </div>
          <AdminArtworkUploadField />
        </div>

        <div className="rounded-[24px] border border-line bg-panel-strong p-5">
          <div className="text-lg font-semibold text-foreground">Metadata</div>
          <div className="mt-4 space-y-3">
            <input
              className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
              name="title"
              placeholder="Astral Sentinel"
              required
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                defaultValue="Legendary"
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
                defaultValue="spire"
                name="shape"
              >
                {productShapes.map((shape) => (
                  <option key={shape} value={shape}>
                    {shape}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                defaultValue="USD"
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
                min="0"
                name="price"
                placeholder="249"
                required
                step="1"
                type="number"
              />
              <input
                className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                min="0"
                name="stock"
                placeholder="18"
                required
                step="1"
                type="number"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                defaultValue="digital"
                name="defaultDeliveryType"
              >
                <option value="digital">Digital Delivery</option>
                <option value="physical">Physical Delivery</option>
              </select>
              <select
                className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                defaultValue="active"
                name="status"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                name="collection"
                placeholder="Stellar Guardians"
                required
              />
              <input
                className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                name="category"
                placeholder="Guardians"
                required
              />
            </div>
            <input
              className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
              name="edition"
              placeholder="SG-014"
              required
            />
            <input
              className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
              name="tagline"
              placeholder="Vault-grade centerpiece with soft lunar chrome."
              required
            />
            <label className="flex items-center justify-between rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground">
              <div>
                <div className="font-medium text-foreground">Featured release</div>
                <div className="mt-1 text-sm text-muted">
                  Prioritize this card in premium drops and archive highlights.
                </div>
              </div>
              <input
                className="size-4 accent-[var(--accent)]"
                defaultChecked
                name="featured"
                type="checkbox"
              />
            </label>
            <textarea
              className="min-h-[160px] w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
              name="description"
              placeholder="A mysterious guardian from cosmic realms..."
              required
            />
            <textarea
              className="min-h-[110px] w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
              name="deliveryDigital"
              placeholder="Unlocks instantly in your digital vault after checkout."
              required
            />
            <textarea
              className="min-h-[110px] w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
              name="deliveryPhysical"
              placeholder="Ships as a serialized collector card in archive packaging."
              required
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit">Publish card</Button>
            <Button asChild variant="secondary">
              <Link href="/admin/products">Manage products</Link>
            </Button>
          </div>
        </div>
      </form>
    </AdminShell>
  );
}
