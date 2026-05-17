"use client";

import { useEffect, useRef, useState } from "react";
import { type CartLine } from "@/lib/rebohrome-data";
import { useCartStore } from "@/lib/stores/cart-store";

type CartResponse = {
  authenticated: boolean;
  items: CartLine[];
};

function mergeLines(serverLines: CartLine[], localLines: CartLine[]) {
  const quantities = new Map<string, CartLine>();

  for (const line of [...serverLines, ...localLines]) {
    const key = `${line.productId}:${line.deliveryType}`;
    const existing = quantities.get(key);
    quantities.set(key, {
      productId: line.productId,
      deliveryType: line.deliveryType,
      quantity: (existing?.quantity ?? 0) + line.quantity,
    });
  }

  return [...quantities.values()];
}

export function CartSync() {
  const hydrated = useCartStore((state) => state.hydrated);
  const lines = useCartStore((state) => state.lines);
  const replaceLines = useCartStore((state) => state.replaceLines);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const skipNextSync = useRef(false);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      try {
        const response = await fetch("/api/cart", { cache: "no-store" });
        const payload = (await response.json()) as CartResponse;

        if (cancelled) {
          return;
        }

        if (!payload.authenticated) {
          setReady(true);
          setSyncEnabled(false);
          return;
        }

        const merged = mergeLines(payload.items, useCartStore.getState().lines);
        skipNextSync.current = true;
        replaceLines(merged);
        setSyncEnabled(true);
        setReady(true);

        if (JSON.stringify(merged) !== JSON.stringify(payload.items)) {
          await fetch("/api/cart", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ items: merged }),
          });
        }
      } catch {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [hydrated, replaceLines]);

  useEffect(() => {
    if (!ready || !syncEnabled) {
      return;
    }

    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }

    const timeout = window.setTimeout(() => {
      fetch("/api/cart", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items: lines.filter((line) => line.quantity > 0) }),
      }).catch(() => undefined);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [lines, ready, syncEnabled]);

  return null;
}
