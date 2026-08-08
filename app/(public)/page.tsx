import Link from "next/link";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { FeaturedHeroProduct } from "@/components/rebohrome/featured-hero-product";
import { RarityBadge } from "@/components/rebohrome/rarity-badge";
import { Button } from "@/components/ui/button";
import {
  getHomepageFeaturedProduct,
  getMarketplaceProducts,
} from "@/lib/db/repository";
import {
  formatUsd,
  getPublicProductTitle,
  hasValidRandomizedProductOdds,
} from "@/lib/rebohrome-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [
    homepageFeaturedProduct,
    latestProducts,
  ] = await Promise.all([
    getHomepageFeaturedProduct(),
    getMarketplaceProducts({ sort: "newest" }),
  ]);

  const heroCard = homepageFeaturedProduct ?? latestProducts[0] ?? null;
  const newDropCards = latestProducts.slice(0, 4);

  const guestCollections = new Set(latestProducts.map((product) => product.collection)).size;
  const guestStock = latestProducts.reduce((sum, product) => sum + product.stock, 0);

  const workspaceStats = [
    { label: "Live Products", value: `${latestProducts.length}` },
    { label: "Collections", value: `${guestCollections}` },
    { label: "Archive Stock", value: `${guestStock}` },
    { label: "Featured Drops", value: `${newDropCards.length}` },
    { label: "Delivery", value: "Instant" },
  ];

  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-panel">
      <section className="w-full bg-[linear-gradient(180deg,rgba(14,20,34,0.84)_0%,rgba(9,13,22,0.96)_100%)] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1480px]">
          <div className="grid gap-8 xl:grid-cols-[0.98fr_1.02fr]">
            <section className="pt-4">
              <div className="text-[11px] uppercase tracking-[0.28em] text-muted">
                WELCOME TO REBOHROME
              </div>
              <h1 className="mt-4 display-font max-w-[680px] text-5xl font-semibold leading-[0.96] tracking-[-0.06em] text-foreground sm:text-6xl">
                Collectibles, secured in your archive
              </h1>
              <p className="mt-5 max-w-[520px] text-base leading-8 text-muted">
                Discover digital and physical collectible cards, complete secure purchases, and
                keep your collection organized in one private ReboHrome archive.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/dashboard/marketplace">Explore Marketplace</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/dashboard/collection">
                    View Collection
                  </Link>
                </Button>
              </div>
            </section>

            <section className="rounded-[18px] border border-line bg-[linear-gradient(180deg,rgba(17,24,39,0.78)_0%,rgba(9,13,22,0.92)_100%)] p-4 shadow-[0_24px_72px_rgba(0,0,0,0.28)] sm:p-6">
              <FeaturedHeroProduct product={heroCard} />
            </section>
          </div>

          <div className="mt-6 grid gap-3 border-y border-line py-5 md:grid-cols-5" id="collections">
            {workspaceStats.map((item) => (
              <div key={item.label}>
                <div className="text-[11px] uppercase tracking-[0.22em] text-muted">
                  {item.label}
                </div>
                <div className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-foreground">
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <section className="mt-6 rounded-[14px] border border-line bg-white p-5" id="drops">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-muted">
                  New Drop
                </div>
              </div>
              <Link
                className="text-sm font-medium text-muted transition hover:text-foreground"
                href="/dashboard/marketplace"
              >
                View all
              </Link>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-4">
              {newDropCards.map((card, index) => (
                <article
                  key={card.id}
                  className="rounded-[14px] border border-line bg-[var(--background-soft)] p-3"
                >
                  <Link className="block" href={`/product/${card.id}`}>
                    <div className="relative">
                      <div className="absolute left-3 top-3 z-10 text-[30px] font-light tracking-[-0.06em] text-muted">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <CardArtwork card={card} className="aspect-[1.05/1] w-full" compact />
                    </div>
                    <div className="mt-3">
                      <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-foreground">
                        {getPublicProductTitle(card.title)}
                      </h2>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                        Series {card.edition}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-foreground">
                        {formatUsd(card.price)}
                      </div>
                      <RarityBadge rarity={card.rarity} />
                    </div>
                  </Link>
                  <div className="mt-3">
                    <AddToCartButton
                      disabled={card.stock <= 0 || !hasValidRandomizedProductOdds(card)}
                      fullWidth
                      label={hasValidRandomizedProductOdds(card) ? "Add to cart" : "Odds pending"}
                      productId={card.id}
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
