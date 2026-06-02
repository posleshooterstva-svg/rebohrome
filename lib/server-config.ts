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
  "https://pay.api.xrocket.exchange";
export const XROCKET_WEBHOOK_SECRET =
  process.env.XROCKET_WEBHOOK_SECRET?.trim() ?? "";
export const XROCKET_DEFAULT_NETWORK =
  process.env.XROCKET_DEFAULT_NETWORK?.trim() ?? "BSC";
export const XROCKET_DEFAULT_CURRENCY =
  process.env.XROCKET_DEFAULT_CURRENCY?.trim() ?? "USDT";

export const ADMIN_SEED_USERNAME =
  process.env.ADMIN_SEED_USERNAME ?? "monohrome_admin";
export const ADMIN_SEED_PASSWORD =
  process.env.ADMIN_SEED_PASSWORD ?? "123123nrrN!!";
export const ADMIN_SEED_TELEGRAM =
  process.env.ADMIN_SEED_TELEGRAM_USERNAME ?? "@monohrome_admin";
export const EUR_USD_FALLBACK_RATE = Number(
  process.env.EUR_USD_FALLBACK_RATE ?? "1.08",
);
