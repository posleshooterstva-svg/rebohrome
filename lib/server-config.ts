import "server-only";
import { createHash } from "crypto";

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
export const ADMIN_TELEGRAM_CHAT_ID =
  process.env.ADMIN_TELEGRAM_CHAT_ID?.trim() ??
  process.env.TELEGRAM_CHAT_ID?.trim() ??
  "";
export const TELEGRAM_CHANNEL_CHAT_ID =
  process.env.TELEGRAM_CHANNEL_CHAT_ID?.trim() ??
  process.env.BROADCAST_TELEGRAM_CHANNEL_ID?.trim() ??
  "-1003810371054";
export const ADMIN_TELEGRAM_IDS = (process.env.ADMIN_TELEGRAM_IDS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
export const TELEGRAM_BOT_USERNAME =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim() ??
  process.env.TELEGRAM_BOT_USERNAME?.trim() ??
  "rebohrome_bot";
export const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://127.0.0.1:3003";
export const TELEGRAM_WEBHOOK_SECRET =
  process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ??
  process.env.TELEGRAM_CALLBACK_SECRET?.trim() ??
  "";
export const TELEGRAM_CALLBACK_SECRET =
  process.env.TELEGRAM_CALLBACK_SECRET ??
  createHash("sha256")
    .update(`${TELEGRAM_BOT_TOKEN}:${ADMIN_TELEGRAM_CHAT_ID}:rebohrome-callback`)
    .digest("hex");
export const MAINTENANCE_BYPASS_SECRET =
  process.env.MAINTENANCE_BYPASS_SECRET?.trim() ?? "";
export const CRON_SECRET = process.env.CRON_SECRET?.trim() ?? "";
export const XROCKET_API_KEY = process.env.XROCKET_API_KEY?.trim() ?? "";
export const XROCKET_API_BASE_URL =
  process.env.XROCKET_API_BASE_URL?.trim() ??
  "https://pay.xrocket.exchange";
export const XROCKET_WEBHOOK_SECRET =
  process.env.XROCKET_WEBHOOK_SECRET?.trim() ?? "";
export const XROCKET_DEFAULT_NETWORK =
  process.env.XROCKET_DEFAULT_NETWORK?.trim() ?? "BSC";
export const XROCKET_DEFAULT_CURRENCY =
  process.env.XROCKET_DEFAULT_CURRENCY?.trim() ?? "USDT";
export const VERIFF_BASE_URL =
  process.env.VERIFF_BASE_URL?.trim() ?? "https://stationapi.veriff.com";
export const VERIFF_API_KEY = process.env.VERIFF_API_KEY?.trim() ?? "";
export const VERIFF_SHARED_SECRET =
  process.env.VERIFF_SHARED_SECRET?.trim() ?? "";
export const VERIFF_WEBHOOK_SECRET =
  process.env.VERIFF_WEBHOOK_SECRET?.trim() ?? VERIFF_SHARED_SECRET;
export const VERIFF_VENDOR_DATA_PREFIX =
  process.env.VERIFF_VENDOR_DATA_PREFIX?.trim() ?? "rebohrome_user";
export const SITE_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ??
  process.env.NEXT_PUBLIC_APP_URL?.trim() ??
  APP_BASE_URL;
export const CLEFFO_ENV = process.env.CLEFFO_ENV?.trim() ?? "development";
export const CLEFFO_BASE_URL =
  process.env.CLEFFO_BASE_URL?.trim() ?? "https://apis-dev.cleffo.com";
export const CLEFFO_API_KEY = process.env.CLEFFO_API_KEY?.trim() ?? "";
export const CLEFFO_SIGNATURE_KEY =
  process.env.CLEFFO_SIGNATURE_KEY?.trim() ?? "";
export const CLEFFO_CLIENT_KEY = process.env.CLEFFO_CLIENT_KEY?.trim() ?? "";
export const CLEFFO_PRODUCT_IMAGE_URL =
  process.env.CLEFFO_PRODUCT_IMAGE_URL?.trim() ??
  `${SITE_BASE_URL.replace(/\/+$/, "")}/uploads/photo_2026-06-03_18-02-49.jpg`;
export const COINFLOW_ENV =
  process.env.COINFLOW_ENV?.trim().toLowerCase() === "prod" ||
  process.env.COINFLOW_ENV?.trim().toLowerCase() === "production"
    ? "prod"
    : "sandbox";
export const NEXT_PUBLIC_COINFLOW_ENV =
  process.env.NEXT_PUBLIC_COINFLOW_ENV?.trim().toLowerCase() === "prod" ||
  process.env.NEXT_PUBLIC_COINFLOW_ENV?.trim().toLowerCase() === "production"
    ? "prod"
    : "sandbox";
export const COINFLOW_API_BASE_URL =
  process.env.COINFLOW_API_BASE_URL?.trim() ??
  (COINFLOW_ENV === "sandbox"
    ? "https://api-sandbox.coinflow.cash"
    : "https://api.coinflow.cash");
export const COINFLOW_MERCHANT_ID =
  process.env.COINFLOW_MERCHANT_ID?.trim() ?? "";
export const COINFLOW_API_KEY = process.env.COINFLOW_API_KEY?.trim() ?? "";
export const COINFLOW_WEBHOOK_VALIDATION_KEY =
  process.env.COINFLOW_WEBHOOK_VALIDATION_KEY?.trim() ?? "";
export const COINFLOW_CHECKOUT_MODE =
  process.env.COINFLOW_CHECKOUT_MODE?.trim() ?? "react";
export const COINFLOW_DEFAULT_PAYMENT_METHOD =
  process.env.COINFLOW_DEFAULT_PAYMENT_METHOD?.trim() ?? "card";
export const COINFLOW_SETTLEMENT_TYPE =
  process.env.COINFLOW_SETTLEMENT_TYPE?.trim() ?? "Bank";
export const COINFLOW_DEFAULT_CURRENCY =
  process.env.COINFLOW_DEFAULT_CURRENCY?.trim() ?? "USD";
export const COINFLOW_ENABLE_CARD =
  process.env.COINFLOW_ENABLE_CARD?.trim().toLowerCase() !== "false";
export const COINFLOW_ENABLE_APPLE_PAY =
  process.env.COINFLOW_ENABLE_APPLE_PAY?.trim().toLowerCase() === "true";
export const COINFLOW_ENABLE_GOOGLE_PAY =
  process.env.COINFLOW_ENABLE_GOOGLE_PAY?.trim().toLowerCase() === "true";
export const COINFLOW_ENABLE_ACH =
  process.env.COINFLOW_ENABLE_ACH?.trim().toLowerCase() === "true";
export const COINFLOW_ENABLE_SEPA =
  process.env.COINFLOW_ENABLE_SEPA?.trim().toLowerCase() === "true";
export const COINFLOW_ENABLE_UK_FASTER_PAYMENTS =
  process.env.COINFLOW_ENABLE_UK_FASTER_PAYMENTS?.trim().toLowerCase() ===
  "true";
export const COINFLOW_ENABLE_PIX =
  process.env.COINFLOW_ENABLE_PIX?.trim().toLowerCase() === "true";
export const WERT_ENV =
  process.env.WERT_ENV?.trim().toLowerCase() === "production"
    ? "production"
    : "production";
export const WERT_PARTNER_ID = process.env.WERT_PARTNER_ID?.trim() ?? "";
export const WERT_PRIVATE_KEY = process.env.WERT_PRIVATE_KEY?.trim() ?? "";
export const WERT_API_KEY = process.env.WERT_API_KEY?.trim() ?? "";
export const WERT_WEBHOOK_SECRET =
  process.env.WERT_WEBHOOK_SECRET?.trim() ?? "";
export const WERT_BASE_URL =
  process.env.WERT_BASE_URL?.trim() ??
  "https://widget.wert.io";
export const WERT_DATA_API_BASE_URL =
  process.env.WERT_DATA_API_BASE_URL?.trim() ?? "https://partner.wert.io";
export const WERT_PRODUCTION_ORIGIN =
  process.env.WERT_PRODUCTION_ORIGIN?.trim() ?? "https://widget.wert.io";
export const WERT_ORIGIN =
  process.env.WERT_ORIGIN?.trim() ?? WERT_PRODUCTION_ORIGIN;
export const WERT_DEFAULT_COMMODITY =
  process.env.WERT_DEFAULT_COMMODITY?.trim() ?? "BNB";
export const WERT_DEFAULT_NETWORK =
  process.env.WERT_DEFAULT_NETWORK?.trim() ?? "bsc";
export const WERT_DEFAULT_COMMODITY_AMOUNT = Number(
  process.env.WERT_DEFAULT_COMMODITY_AMOUNT ?? "0",
);
export const WERT_SMART_CONTRACT_ADDRESS =
  process.env.WERT_SMART_CONTRACT_ADDRESS?.trim() ?? "";
export const WERT_DEFAULT_SC_INPUT_DATA =
  process.env.WERT_DEFAULT_SC_INPUT_DATA?.trim() ?? "";
export const WERT_DEFAULT_ADDRESS =
  process.env.WERT_DEFAULT_ADDRESS?.trim() ??
  "";
export const WERT_NFT_DELIVERY_MODE =
  process.env.WERT_NFT_DELIVERY_MODE?.trim() ?? "user_wallet";
export const WERT_DEFAULT_TOKEN_ID = Number(
  process.env.WERT_DEFAULT_TOKEN_ID ?? "1",
);
export const WERT_DEFAULT_TOKEN_QUANTITY = Number(
  process.env.WERT_DEFAULT_TOKEN_QUANTITY ?? "1",
);
export const WERT_PLATFORM_CUSTODY_ADDRESS =
  process.env.WERT_PLATFORM_CUSTODY_ADDRESS?.trim() ?? WERT_DEFAULT_ADDRESS;

export const ADMIN_SEED_USERNAME =
  process.env.ADMIN_SEED_USERNAME ?? "monohrome_admin";
export const ADMIN_SEED_PASSWORD =
  process.env.ADMIN_SEED_PASSWORD ?? "123123nrrN!!";
export const ADMIN_SEED_TELEGRAM =
  process.env.ADMIN_SEED_TELEGRAM_USERNAME ?? "@monohrome_admin";
export const EUR_USD_FALLBACK_RATE = Number(
  process.env.EUR_USD_FALLBACK_RATE ?? "1.08",
);
