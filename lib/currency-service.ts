import "server-only";

import { EUR_USD_FALLBACK_RATE } from "@/lib/server-config";
import type { SupportedCurrency } from "@/lib/rebohrome-data";

function getFallbackRate(from: SupportedCurrency, to: SupportedCurrency) {
  if (from === to) {
    return 1;
  }

  if (from === "EUR" && to === "USD") {
    return EUR_USD_FALLBACK_RATE;
  }

  if (from === "USD" && to === "EUR") {
    return 1 / EUR_USD_FALLBACK_RATE;
  }

  return 1;
}

export async function getExchangeRate(
  from: SupportedCurrency,
  to: SupportedCurrency,
) {
  return getFallbackRate(from, to);
}

export async function convertAmount(
  amount: number,
  from: SupportedCurrency,
  to: SupportedCurrency,
) {
  const rate = await getExchangeRate(from, to);
  const convertedAmount = Number((amount * rate).toFixed(2));

  return {
    convertedAmount,
    exchangeRate: rate,
  };
}
