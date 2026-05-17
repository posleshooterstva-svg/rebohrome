"use client";

import { useMemo, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { type DeliveryType } from "@/lib/rebohrome-data";
import { useCartStore } from "@/lib/stores/cart-store";
import { Button } from "@/components/ui/button";

type AddToCartButtonProps = {
  productId: string;
  deliveryType?: DeliveryType;
  fullWidth?: boolean;
  label?: string;
  disabled?: boolean;
  disabledLabel?: string;
};

export function AddToCartButton({
  productId,
  deliveryType = "digital",
  fullWidth = false,
  label = "Add to cart",
  disabled = false,
  disabledLabel = "Out of stock",
}: AddToCartButtonProps) {
  const addItem = useCartStore((state) => state.addItem);
  const [added, setAdded] = useState(false);

  const className = useMemo(
    () => (fullWidth ? "w-full" : ""),
    [fullWidth],
  );

  return (
    <Button
      className={className}
      disabled={disabled}
      onClick={() => {
        addItem(productId, deliveryType);
        setAdded(true);
        window.setTimeout(() => setAdded(false), 1400);
      }}
      type="button"
    >
      <ShoppingBag className="size-4" />
      {disabled ? disabledLabel : added ? "Added" : label}
    </Button>
  );
}
