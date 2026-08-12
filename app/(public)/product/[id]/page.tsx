import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Dices, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { MarketCard } from "@/components/rebohrome/market-card";
import { ProductPurchasePanel } from "@/components/product/product-purchase-panel";
import { RarityBadge } from "@/components/rebohrome/rarity-badge";
import { Button } from "@/components/ui/button";
import {
  getProductById,
  getRandomizedProductDisclosure,
  getRelatedProducts,
} from "@/lib/db/repository";
import {
  formatDisplayDate,
  formatUsd,
  getPublicProductTitle,
} from "@/lib/rebohrome-data";

type ProductPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const card = await getProductById(id);
  const title = card ? getPublicProductTitle(card.title) : null;

  return {
    title: title ?? "Product Not Found",
    description: card?.description,
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const card = await getProductById(id);

  if (!card) {
    notFound();
  }

  const [relatedCards, randomization] = await Promise.all([
    getRelatedProducts(card.id, 4),
    getRandomizedProductDisclosure(card.id),
  ]);
  const title = getPublicProductTitle(card.title);
  const randomizedPurchaseDisabledReason =
    randomization?.isRandomized && !randomization.isReady
      ? "This randomized product is paused until its complete card probabilities are published."
      : null;

  return (
    <main className="min-h-dvh w-full overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[32px] border border-line bg-panel px-6 py-8 shadow-panel sm:px-8">
        <Link
          className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-foreground"
          href="/dashboard/marketplace"
        >
          <ArrowLeft className="size-4" />
          Back to marketplace
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <CardArtwork card={card} className="aspect-[4/5] w-full" />
            <div className="mt-3 flex gap-2">
              {[card, ...relatedCards.slice(0, 2)].map((thumb) => (
                <Link
                  key={thumb.id}
                  className="w-18 rounded-2xl border border-line bg-panel-strong p-1.5 transition hover:border-[var(--accent)]"
                  href={`/product/${thumb.id}`}
                >
                  <CardArtwork
                    card={thumb}
                    className="aspect-square w-full"
                    compact
                  />
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-3">
              <RarityBadge rarity={card.rarity} />
              <span className="rounded-full border border-line bg-panel-strong px-3 py-1 text-xs uppercase tracking-[0.2em] text-muted">
                {card.collection}
              </span>
              <span className="rounded-full border border-line bg-panel-strong px-3 py-1 text-xs uppercase tracking-[0.2em] text-muted">
                Updated {formatDisplayDate(card.updatedAt)}
              </span>
            </div>
            <h1 className="mt-4 display-font text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl">
              {title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <span className="text-3xl font-semibold text-foreground">
                {formatUsd(card.price)}
              </span>
              <span className="text-sm text-emerald-500 dark:text-emerald-300">
                {card.stock} in stock
              </span>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-8 text-muted">
              {card.description}
            </p>

            <div className="mt-6 rounded-[24px] border border-line bg-panel-strong px-5 py-4">
              <div className="text-xs uppercase tracking-[0.24em] text-muted">
                Category
              </div>
              <div className="mt-2 text-sm font-medium text-foreground">
                {card.category} · Edition {card.edition}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">{card.tagline}</p>
            </div>

            {randomization?.isRandomized ? (
              <section
                aria-labelledby="randomized-product-odds"
                className="mt-6 rounded-[24px] border border-line bg-[linear-gradient(145deg,var(--panel-strong),var(--panel))] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-line bg-panel text-[var(--accent)]">
                      <Dices className="size-5" />
                    </span>
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-muted">
                        Randomized contents
                      </p>
                      <h2
                        className="mt-1 text-lg font-semibold text-foreground"
                        id="randomized-product-odds"
                      >
                        Your chance of receiving each card
                      </h2>
                    </div>
                  </div>
                  {randomization.isReady ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                      <ShieldCheck className="size-3.5" />
                      Total probability 100%
                    </span>
                  ) : null}
                </div>

                {randomization.isReady ? (
                  <>
                    <p className="mt-4 text-sm leading-6 text-muted">
                      One card is selected from the pool below. Probabilities are fixed at
                      checkout and are shown before purchase.
                    </p>
                    <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-2xl border border-line bg-panel px-3 py-3">
                        <dt className="text-[10px] uppercase tracking-[0.18em] text-muted">Version</dt>
                        <dd className="mt-1 text-sm font-semibold text-foreground">
                          #{randomization.version ?? "-"}
                        </dd>
                      </div>
                      <div className="rounded-2xl border border-line bg-panel px-3 py-3">
                        <dt className="text-[10px] uppercase tracking-[0.18em] text-muted">Published</dt>
                        <dd className="mt-1 text-sm font-semibold text-foreground">
                          {randomization.publishedAt
                            ? formatDisplayDate(randomization.publishedAt)
                            : "-"}
                        </dd>
                      </div>
                      <div className="rounded-2xl border border-line bg-panel px-3 py-3">
                        <dt className="text-[10px] uppercase tracking-[0.18em] text-muted">Expected value</dt>
                        <dd className="mt-1 text-sm font-semibold text-foreground">
                          {formatUsd(randomization.expectedValue ?? 0)}
                        </dd>
                      </div>
                      <div className="rounded-2xl border border-line bg-panel px-3 py-3">
                        <dt className="text-[10px] uppercase tracking-[0.18em] text-muted">Big Win chance</dt>
                        <dd className="mt-1 text-sm font-semibold text-foreground">
                          {((randomization.bigWinProbabilityBps ?? 0) / 100).toFixed(2)}%
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                      {randomization.outcomes.map(({ product, probabilityBps, priceSnapshot }) => (
                        <div
                          className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border border-line bg-panel p-2.5"
                          key={product.id}
                        >
                          <CardArtwork
                            card={product}
                            className="aspect-square w-14 rounded-[14px]"
                            compact
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">
                              {getPublicProductTitle(product.title)}
                            </div>
                            <div className="mt-1 text-xs text-muted">
                              {product.rarity} - Reference value {formatUsd(priceSnapshot)}
                            </div>
                          </div>
                          <div className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-right">
                            <div className="text-sm font-semibold text-foreground">
                              {(probabilityBps / 100).toFixed(2)}%
                            </div>
                            <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-muted">
                              chance
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-xs leading-5 text-muted">
                      Reference values are informational and may change. No particular
                      result or resale value is guaranteed.
                    </p>
                  </>
                ) : (
                  <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    Complete card probabilities are being updated. Purchases remain paused
                    until the full 100% distribution is available here.
                  </p>
                )}
              </section>
            ) : null}

            <ProductPurchasePanel
              disabledReason={randomizedPurchaseDisabledReason}
              product={card}
            />
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-muted">
              Related Cards
            </p>
            <h2 className="mt-2 display-font text-3xl font-semibold tracking-[-0.04em] text-foreground">
              Continue browsing the archive.
            </h2>
          </div>
          <Button asChild variant="ghost">
            <Link href="/dashboard/marketplace">Back to marketplace</Link>
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {relatedCards.map((relatedCard) => (
            <MarketCard key={relatedCard.id} card={relatedCard} />
          ))}
        </div>
      </section>
    </main>
  );
}
