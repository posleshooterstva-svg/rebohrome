"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { RarityBadge } from "@/components/rebohrome/rarity-badge";
import { Button } from "@/components/ui/button";
import { getCartSummary } from "@/lib/cart";
import { formatUsd, type ProductRecord } from "@/lib/rebohrome-data";
import { useCartStore } from "@/lib/stores/cart-store";

type CartPageClientProps = {
  products: ProductRecord[];
};

export function CartPageClient({ products }: CartPageClientProps) {
  const lines = useCartStore((state) => state.lines);
  const removeItem = useCartStore((state) => state.removeItem);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const summary = getCartSummary(mounted ? lines : [], products);

  if (!mounted) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="rounded-[32px] border border-line bg-panel px-6 py-8 shadow-panel sm:px-8">
          <h1 className="display-font text-4xl font-semibold tracking-[-0.04em] text-foreground">
            Cart
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted">
            Syncing your selected cards before checkout.
          </p>
          <div className="mt-6 space-y-4">
            {[0, 1].map((index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-[24px] border border-line bg-panel-strong"
              />
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-line bg-panel px-6 py-8 shadow-panel sm:px-8">
          <h2 className="text-2xl font-semibold text-foreground">Order Summary</h2>
          <div className="mt-6 h-36 animate-pulse rounded-[24px] border border-line bg-panel-strong" />
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
      <section className="rounded-[32px] border border-line bg-panel px-6 py-8 shadow-panel sm:px-8">
        <h1 className="display-font text-4xl font-semibold tracking-[-0.04em] text-foreground">
          Cart
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted">
          Review selected cards before continuing to checkout.
        </p>

        {summary.isEmpty ? (
          <div className="mt-6 rounded-[24px] border border-dashed border-line bg-panel-strong px-6 py-10 text-center">
            <div className="text-lg font-semibold text-foreground">
              Your cart is empty.
            </div>
            <p className="mt-2 text-sm leading-7 text-muted">
              Your cart is empty. Discover archive collectibles in the marketplace.
            </p>
            <div className="mt-5">
              <Button asChild>
                <Link href="/marketplace">Explore Marketplace</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {summary.items.map((item) => {
              if (!item.product) {
                return (
                  <div
                    key={item.key}
                    className="rounded-[24px] border border-line bg-panel-strong p-4"
                  >
                    <div className="text-lg font-semibold text-foreground">
                      Unavailable product
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      This card is no longer available in the marketplace.
                    </p>
                    <button
                      className="mt-4 text-sm font-medium text-[var(--accent)]"
                      onClick={() =>
                        removeItem(item.productId, item.deliveryType)
                      }
                      type="button"
                    >
                      Remove from cart
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={item.key}
                  className="flex flex-col gap-4 rounded-[24px] border border-line bg-panel-strong p-4 sm:flex-row sm:items-center"
                >
                  <div className="w-20 rounded-[20px] border border-line bg-panel p-1.5">
                    <CardArtwork
                      card={item.product}
                      className="aspect-square w-full"
                      compact
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-semibold text-foreground">
                      {item.product.title}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {item.product.collection} ·{" "}
                      {item.deliveryType === "digital"
                        ? "Digital delivery"
                        : "Physical shipping"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <RarityBadge rarity={item.product.rarity} />
                      {!item.isAvailable ? (
                        <span className="text-xs font-medium text-amber-500 dark:text-amber-300">
                          Only {item.product.stock} left in stock
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="inline-flex items-center rounded-2xl border border-line bg-panel px-2">
                    <button
                      className="px-3 py-2 text-muted"
                      onClick={() =>
                        setQuantity(
                          item.productId,
                          item.deliveryType,
                          item.quantity - 1,
                        )
                      }
                      type="button"
                    >
                      -
                    </button>
                    <span className="px-3 py-2 text-sm font-medium text-foreground">
                      {item.quantity}
                    </span>
                    <button
                      className="px-3 py-2 text-muted disabled:opacity-40"
                      disabled={item.quantity >= item.product.stock}
                      onClick={() =>
                        setQuantity(
                          item.productId,
                          item.deliveryType,
                          item.quantity + 1,
                        )
                      }
                      type="button"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-foreground">
                      {formatUsd(item.lineTotal)}
                    </div>
                    <button
                      className="mt-2 text-sm text-muted transition hover:text-foreground"
                      onClick={() =>
                        removeItem(item.productId, item.deliveryType)
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-[32px] border border-line bg-panel px-6 py-8 shadow-panel sm:px-8">
        <h2 className="text-2xl font-semibold text-foreground">Order Summary</h2>
        <div className="mt-6 space-y-3 text-sm">
          {summary.items.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between text-muted"
            >
              <span>
                {item.product?.title ?? "Unavailable"} x{item.quantity}
              </span>
              <span>{formatUsd(item.lineTotal)}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 space-y-2 border-t border-line pt-6 text-sm">
          <div className="flex items-center justify-between text-muted">
            <span>Subtotal</span>
            <span>{formatUsd(summary.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-muted">
            <span>Shipping</span>
            <span>{formatUsd(summary.shipping)}</span>
          </div>
          <div className="flex items-center justify-between text-lg font-semibold text-foreground">
            <span>Total</span>
            <span>{formatUsd(summary.total)}</span>
          </div>
        </div>
        {summary.hasInvalidItems ? (
          <p className="mt-4 text-sm leading-6 text-amber-500 dark:text-amber-300">
            Update unavailable items before checkout so stock and totals stay valid.
          </p>
        ) : null}
        <div className="mt-6 space-y-3">
          {summary.isEmpty || summary.hasInvalidItems ? (
            <Button className="w-full" disabled>
              Continue to checkout
            </Button>
          ) : (
            <Button asChild className="w-full">
              <Link href="/checkout">Continue to checkout</Link>
            </Button>
          )}
          <Button asChild className="w-full" variant="secondary">
            <Link href="/marketplace">Continue shopping</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
