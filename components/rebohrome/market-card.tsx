import Link from "next/link";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { type ProductRecord, formatUsd } from "@/lib/rebohrome-data";
import { CardArtwork } from "./card-artwork";
import { RarityBadge } from "./rarity-badge";

type MarketCardProps = {
  card: ProductRecord;
};

export function MarketCard({ card }: MarketCardProps) {
  return (
    <article className="rounded-[14px] border border-line bg-white p-3 transition-transform duration-200 hover:-translate-y-0.5">
      <Link className="group block" href={`/product/${card.id}`}>
        <CardArtwork card={card} className="aspect-[4/5] w-full" compact />
        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted">
              {card.edition}
            </div>
            <h3 className="mt-1 text-sm font-semibold text-foreground">{card.title}</h3>
            <p className="mt-1 text-xs text-muted">{card.collection}</p>
            <div className="mt-2">
              <RarityBadge rarity={card.rarity} />
            </div>
          </div>
          <span className="flex size-8 items-center justify-center rounded-[10px] border border-line bg-[var(--background-soft)] text-muted transition group-hover:text-foreground">
            <ShoppingBagGlyph />
          </span>
        </div>
        <div className="mt-3 text-sm font-medium text-foreground">
          {formatUsd(card.price)}
        </div>
      </Link>
      <div className="mt-3">
        <AddToCartButton
          disabled={card.stock <= 0}
          fullWidth
          label="Add to cart"
          productId={card.id}
        />
      </div>
    </article>
  );
}

function ShoppingBagGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7 10V8a5 5 0 0 1 10 0v2m-9 0h8l1 9H7l1-9Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
