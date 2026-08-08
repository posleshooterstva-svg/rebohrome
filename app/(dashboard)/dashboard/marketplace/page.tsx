import { Search } from "lucide-react";
import { MarketCard } from "@/components/rebohrome/market-card";
import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  getMarketplaceFacets,
  getMarketplaceProducts,
} from "@/lib/db/repository";

type DashboardMarketplacePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getSingleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function DashboardMarketplacePage({
  searchParams,
}: DashboardMarketplacePageProps) {
  const params = await searchParams;
  const filters = {
    search: getSingleValue(params.search),
    rarity: getSingleValue(params.rarity),
    collection: getSingleValue(params.collection),
    sort: getSingleValue(params.sort) || "newest",
  };

  const [products, facets] = await Promise.all([
    getMarketplaceProducts(filters),
    getMarketplaceFacets(),
  ]);

  const hasFilters = Boolean(
    filters.search || filters.rarity || filters.collection || filters.sort !== "newest",
  );

  return (
    <DashboardShell
      active="marketplace"
      description="Browse collectible releases."
      showRightRail={false}
      title="Marketplace"
    >
      <form className="grid gap-3 xl:grid-cols-[1.45fr_0.9fr_0.9fr_0.9fr_auto_auto]" method="get">
        <div className="flex min-w-0 items-center gap-2 rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-muted xl:min-w-[240px]">
          <Search className="size-4" />
          <input
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted"
            defaultValue={filters.search}
            name="search"
            placeholder="Search archive"
          />
        </div>
        <select
          className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none"
          defaultValue={filters.rarity}
          name="rarity"
        >
          <option value="">All rarities</option>
          {facets.rarities.map((rarity) => (
            <option key={rarity} value={rarity}>
              {rarity}
            </option>
          ))}
        </select>
        <select
          className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none"
          defaultValue={filters.collection}
          name="collection"
        >
          <option value="">All collections</option>
          {facets.collections.map((collection) => (
            <option key={collection} value={collection}>
              {collection}
            </option>
          ))}
        </select>
        <select
          className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none"
          defaultValue={filters.sort}
          name="sort"
        >
          <option value="newest">Newest</option>
          <option value="price-asc">Price: Low to high</option>
          <option value="price-desc">Price: High to low</option>
          <option value="stock-desc">Stock</option>
          <option value="title-asc">Title</option>
        </select>
        <Button type="submit">Apply</Button>
        {hasFilters ? (
          <Button asChild variant="secondary">
            <a href="/dashboard/marketplace">Reset</a>
          </Button>
        ) : null}
      </form>

      <div className="mt-5 border-y border-line py-4 text-sm text-muted">
        {products.length} collectible cards
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {products.length > 0 ? (
          products.map((card) => <MarketCard key={card.id} card={card} />)
        ) : (
          <div className="col-span-full rounded-[18px] border border-dashed border-line bg-[var(--background-soft)] px-6 py-12 text-center">
            <div className="text-lg font-semibold text-foreground">
              No cards matched these filters.
            </div>
            <p className="mt-2 text-sm leading-7 text-muted">
              Try another collection.
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
