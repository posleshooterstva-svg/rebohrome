import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { MarketCard } from "@/components/rebohrome/market-card";
import { ProductPurchasePanel } from "@/components/product/product-purchase-panel";
import { RarityBadge } from "@/components/rebohrome/rarity-badge";
import { Button } from "@/components/ui/button";
import { getProductById, getRelatedProducts } from "@/lib/db/repository";
import {
  formatDisplayDate,
  formatUsd,
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

  return {
    title: card ? card.title : "Product Not Found",
    description: card?.description,
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const card = await getProductById(id);

  if (!card) {
    notFound();
  }

  const relatedCards = await getRelatedProducts(card.id, 4);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[32px] border border-line bg-panel px-6 py-8 shadow-panel sm:px-8">
        <Link
          className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-foreground"
          href="/marketplace"
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
              {card.title}
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

            <ProductPurchasePanel product={card} />
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
            <Link href="/marketplace">Back to marketplace</Link>
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
