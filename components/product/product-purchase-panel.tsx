"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  type DeliveryType,
  type ProductRecord,
} from "@/lib/rebohrome-data";
import { useCartStore } from "@/lib/stores/cart-store";
import { cn } from "@/lib/utils";

type ProductPurchasePanelProps = {
  product: ProductRecord;
};

export function ProductPurchasePanel({
  product,
}: ProductPurchasePanelProps) {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("digital");
  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);

  useEffect(() => {
    if (!isAdded) {
      return;
    }

    const timeout = window.setTimeout(() => setIsAdded(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [isAdded]);

  function commitToCart() {
    if (product.stock <= 0) {
      return;
    }

    for (let index = 0; index < quantity; index += 1) {
      addItem(product.id, deliveryType);
    }
  }

  function handleAddToCart() {
    commitToCart();
    setIsAdded(true);
  }

  function handleBuyNow() {
    commitToCart();
    router.push("/checkout");
  }

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button
          className={cn(
            "rounded-[24px] border px-4 py-4 text-left transition",
            deliveryType === "digital"
              ? "border-accent bg-[var(--accent-soft)]"
              : "border-line bg-panel-strong",
          )}
          onClick={() => setDeliveryType("digital")}
          type="button"
        >
          <div className="text-sm font-semibold text-foreground">
            Digital Delivery
          </div>
          <div className="mt-2 text-sm leading-6 text-muted">
            {product.deliveryDigital}
          </div>
        </button>
        <button
          className={cn(
            "rounded-[24px] border px-4 py-4 text-left transition",
            deliveryType === "physical"
              ? "border-accent bg-[var(--accent-soft)]"
              : "border-line bg-panel-strong",
          )}
          onClick={() => setDeliveryType("physical")}
          type="button"
        >
          <div className="text-sm font-semibold text-foreground">
            Physical Shipping
          </div>
          <div className="mt-2 text-sm leading-6 text-muted">
            {product.deliveryPhysical}
          </div>
        </button>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <div className="inline-flex items-center rounded-2xl border border-line bg-panel-strong">
          <button
            className="px-4 py-3 text-muted"
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            type="button"
          >
            -
          </button>
          <span className="px-4 py-3 text-sm font-medium text-foreground">
            {quantity}
          </span>
          <button
            className="px-4 py-3 text-muted disabled:opacity-40"
            disabled={quantity >= product.stock}
            onClick={() =>
              setQuantity((value) => Math.min(product.stock, value + 1))
            }
            type="button"
          >
            +
          </button>
        </div>
        <span className="text-sm text-muted">
          Edition {product.edition} · {deliveryType === "digital" ? "Digital" : "Physical"}
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button className="sm:flex-1" disabled={product.stock <= 0} onClick={handleAddToCart}>
          {product.stock <= 0 ? "Out of stock" : isAdded ? "Added to cart" : "Add to cart"}
        </Button>
        <Button
          className="sm:flex-1"
          disabled={product.stock <= 0}
          onClick={handleBuyNow}
          type="button"
          variant="secondary"
        >
          Buy now
        </Button>
      </div>
    </>
  );
}
