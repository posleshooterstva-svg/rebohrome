"use client";

import { useEffect } from "react";
import { type ProductRecord, type SupportedCurrency } from "@/lib/rebohrome-data";
import { useAccountExperienceStore } from "@/lib/stores/account-experience-store";

type SuccessStateSyncProps = {
  userId: string;
  orderId: string;
  amount: number;
  currency: SupportedCurrency;
  summary: string;
  createdAt: string;
  items: Array<{
    product: ProductRecord;
    quantity: number;
  }>;
};

export function SuccessStateSync({
  userId,
  orderId,
  amount,
  currency,
  summary,
  createdAt,
  items,
}: SuccessStateSyncProps) {
  const applyPurchase = useAccountExperienceStore((state) => state.applyPurchase);

  useEffect(() => {
    applyPurchase(userId, {
      orderId,
      amount,
      currency,
      summary,
      createdAt,
      items,
    });
  }, [amount, applyPurchase, createdAt, currency, items, orderId, summary, userId]);

  return null;
}
