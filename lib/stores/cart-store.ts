"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { type CartLine, type DeliveryType } from "@/lib/rebohrome-data";

type CartState = {
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  lines: CartLine[];
  replaceLines: (lines: CartLine[]) => void;
  addItem: (productId: string, deliveryType: DeliveryType) => void;
  removeItem: (productId: string, deliveryType: DeliveryType) => void;
  setQuantity: (
    productId: string,
    deliveryType: DeliveryType,
    quantity: number,
  ) => void;
  clearCart: () => void;
  totalItems: () => number;
};

function updateLines(
  lines: CartLine[],
  productId: string,
  deliveryType: DeliveryType,
  updater: (line: CartLine | undefined) => CartLine | null,
) {
  const existing = lines.find(
    (line) =>
      line.productId === productId && line.deliveryType === deliveryType,
  );
  const next = updater(existing);
  const without = lines.filter(
    (line) =>
      !(
        line.productId === productId && line.deliveryType === deliveryType
      ),
  );

  return next && next.quantity > 0 ? [...without, next] : without;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      setHydrated: (value) => set({ hydrated: value }),
      lines: [],
      replaceLines: (lines) => set({ lines }),
      addItem: (productId, deliveryType) =>
        set((state) => ({
          lines: updateLines(
            state.lines,
            productId,
            deliveryType,
            (line) => ({
              productId,
              deliveryType,
              quantity: (line?.quantity ?? 0) + 1,
            }),
          ),
        })),
      removeItem: (productId, deliveryType) =>
        set((state) => ({
          lines: state.lines.filter(
            (line) =>
              !(
                line.productId === productId &&
                line.deliveryType === deliveryType
              ),
          ),
        })),
      setQuantity: (productId, deliveryType, quantity) =>
        set((state) => ({
          lines: updateLines(
            state.lines,
            productId,
            deliveryType,
            () => ({
              productId,
              deliveryType,
              quantity,
            }),
          ),
        })),
      clearCart: () => set({ lines: [] }),
      totalItems: () =>
        get().lines.reduce((sum, line) => sum + line.quantity, 0),
    }),
    {
      name: "rebohrome-cart",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
