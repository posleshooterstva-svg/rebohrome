import "server-only";

import { createHash } from "crypto";
import signer from "@wert-io/widget-sc-signer";
import {
  SITE_BASE_URL,
  WERT_API_KEY,
  WERT_DATA_API_BASE_URL,
  WERT_DEFAULT_ADDRESS,
  WERT_DEFAULT_COMMODITY,
  WERT_DEFAULT_COMMODITY_AMOUNT,
  WERT_DEFAULT_NETWORK,
  WERT_DEFAULT_TOKEN_ID,
  WERT_DEFAULT_TOKEN_QUANTITY,
  WERT_ENV,
  WERT_NFT_DELIVERY_MODE,
  WERT_ORIGIN,
  WERT_PARTNER_ID,
  WERT_PLATFORM_CUSTODY_ADDRESS,
  WERT_PRIVATE_KEY,
  WERT_SMART_CONTRACT_ADDRESS,
} from "@/lib/server-config";
import { buildWertScInputData, toBytes32OrderId } from "@/lib/server/payments/wert-encode";

const { signSmartContractData } = signer;

export type WertProviderSessionType = "balance_topup" | "nft_purchase";
export type WertNftDeliveryMode = "user_wallet" | "platform_custody" | "internal_archive";

export type WertWidgetOptions = {
  partner_id: string;
  origin: string;
  click_id: string;
  redirect_url: string;
  support_url: string;
  address: string;
  commodity: string;
  network: string;
  commodity_amount: number;
  sc_address: string;
  sc_input_data: string;
  signature: string;
  extra: {
    type: WertProviderSessionType;
    environment: "sandbox" | "production";
    local_transaction_id: string;
    deposit_id: string;
    user_id: string;
    fiat_amount: number;
    fiat_currency: string;
    token_id: number;
    token_quantity: number;
    contract_order_id: string;
    nft_delivery_mode: WertNftDeliveryMode;
  };
};

export type WertOrderLookupResult = {
  ok: boolean;
  order: Record<string, unknown> | null;
  orders: Record<string, unknown>[];
  raw: unknown;
};

type CreateWertWidgetOptionsInput = {
  clickId: string;
  localTransactionId: string;
  depositId: string;
  userId: string;
  fiatAmount: number;
  fiatCurrency: string;
  type?: WertProviderSessionType;
  recipientWallet?: string | null;
  tokenId?: number;
  tokenQuantity?: number;
};

function isEvmAddress(value: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function getSafeWertBaseUrl() {
  return WERT_DATA_API_BASE_URL.replace(/\/+$/, "");
}

function assertWertSigningConfig() {
  if (!WERT_PARTNER_ID) {
    throw new Error("Gate #3 is temporarily unavailable. Missing Wert partner ID.");
  }

  if (!WERT_PRIVATE_KEY) {
    throw new Error("Gate #3 is temporarily unavailable. Missing Wert private key.");
  }

  if (WERT_ENV === "production" && !WERT_API_KEY) {
    throw new Error("Gate #3 is temporarily unavailable. Missing Wert API key.");
  }

  if (!Number.isFinite(WERT_DEFAULT_COMMODITY_AMOUNT) || WERT_DEFAULT_COMMODITY_AMOUNT <= 0) {
    throw new Error("Gate #3 is temporarily unavailable. Invalid Wert commodity amount.");
  }

  if (!isEvmAddress(WERT_SMART_CONTRACT_ADDRESS)) {
    throw new Error("Gate #3 is temporarily unavailable. Invalid Wert smart contract address.");
  }

  if (WERT_ENV === "production" && WERT_DEFAULT_NETWORK !== "bsc") {
    throw new Error("Gate #3 is temporarily unavailable. Wert network must be bsc.");
  }

  if (WERT_ENV === "production" && WERT_DEFAULT_COMMODITY !== "BNB") {
    throw new Error("Gate #3 is temporarily unavailable. Wert commodity must be BNB.");
  }
}

function assertWertApiConfig() {
  if (!WERT_API_KEY) {
    throw new Error("Wert API key is not configured. Server-side order lookup is disabled.");
  }
}

function normalizeDeliveryMode(value: string): WertNftDeliveryMode {
  if (value === "user_wallet" || value === "platform_custody" || value === "internal_archive") {
    return value;
  }

  return "internal_archive";
}

function resolveRecipientAddress(input: CreateWertWidgetOptionsInput) {
  const mode = normalizeDeliveryMode(WERT_NFT_DELIVERY_MODE);

  if (mode === "user_wallet") {
    if (!input.recipientWallet || !isEvmAddress(input.recipientWallet)) {
      throw new Error("Gate #3 requires a valid EVM wallet address for NFT delivery.");
    }

    return { mode, recipientAddress: input.recipientWallet };
  }

  const fallback =
    mode === "platform_custody" ? WERT_PLATFORM_CUSTODY_ADDRESS : WERT_DEFAULT_ADDRESS;

  if (!isEvmAddress(fallback)) {
    throw new Error("Gate #3 is temporarily unavailable. Invalid configured recipient address.");
  }

  return { mode, recipientAddress: fallback };
}

export function createWertSignedWidgetSession(
  input: CreateWertWidgetOptionsInput,
): WertWidgetOptions {
  assertWertSigningConfig();

  const redirectBase = SITE_BASE_URL.replace(/\/+$/, "");
  const { mode, recipientAddress } = resolveRecipientAddress(input);
  const tokenId = input.tokenId ?? WERT_DEFAULT_TOKEN_ID;
  const tokenQuantity = input.tokenQuantity ?? WERT_DEFAULT_TOKEN_QUANTITY;
  const contractOrderId = toBytes32OrderId({
    provider: "wert",
    localTransactionId: input.localTransactionId,
    clickId: input.clickId,
  });
  const scInputData = buildWertScInputData({
    recipientAddress,
    tokenId,
    quantity: tokenQuantity,
    orderId: contractOrderId,
  });
  const smartContractData = {
    address: recipientAddress,
    commodity: WERT_DEFAULT_COMMODITY,
    network: WERT_DEFAULT_NETWORK,
    commodity_amount: WERT_DEFAULT_COMMODITY_AMOUNT,
    sc_address: WERT_SMART_CONTRACT_ADDRESS,
    sc_input_data: scInputData,
  };
  const signedData = signSmartContractData(smartContractData, WERT_PRIVATE_KEY);

  return {
    partner_id: WERT_PARTNER_ID,
    origin: WERT_ORIGIN,
    click_id: input.clickId,
    redirect_url: `${redirectBase}/dashboard/deposit?provider=wert&transactionId=${encodeURIComponent(input.localTransactionId)}`,
    support_url: `${redirectBase}/contact`,
    ...signedData,
    extra: {
      type: input.type ?? "balance_topup",
      environment: WERT_ENV,
      local_transaction_id: input.localTransactionId,
      deposit_id: input.depositId,
      user_id: input.userId,
      fiat_amount: input.fiatAmount,
      fiat_currency: input.fiatCurrency,
      token_id: tokenId,
      token_quantity: tokenQuantity,
      contract_order_id: contractOrderId,
      nft_delivery_mode: mode,
    },
  };
}

export const createWertSignedWidgetOptions = createWertSignedWidgetSession;

export function hashWertSignature(signature: string) {
  return createHash("sha256").update(signature).digest("hex");
}

export async function lookupWertOrderStatus(input: {
  clickId?: string | null;
  wertOrderId?: string | null;
}) {
  assertWertApiConfig();

  const searchBy = [input.wertOrderId, input.clickId]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(",");

  if (!searchBy) {
    throw new Error("Wert order lookup requires click_id or order_id.");
  }

  const url = new URL("/api/external/orders", getSafeWertBaseUrl());
  url.searchParams.set("limit", "20");
  url.searchParams.set("search_by", searchBy);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Api-Key": WERT_API_KEY,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await response.text();
  let raw: unknown = null;
  try {
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = { body: text };
  }

  if (!response.ok) {
    throw new Error(`Wert order lookup failed with HTTP ${response.status}.`);
  }

  const data =
    raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)
      ? ((raw as { data: Record<string, unknown>[] }).data)
      : [];
  const order =
    data.find((item) => {
      const orderId = String(item.order_id ?? item.id ?? "");
      const click = String(item.click_id ?? "");
      return (
        (input.wertOrderId && orderId === input.wertOrderId) ||
        (input.clickId && click === input.clickId)
      );
    }) ??
    data[0] ??
    null;

  return {
    ok: true,
    order,
    orders: data,
    raw,
  } satisfies WertOrderLookupResult;
}
