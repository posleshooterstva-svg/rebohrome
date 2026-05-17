import "server-only";
import { createHash } from "crypto";

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
export const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://127.0.0.1:3003";
export const TELEGRAM_CALLBACK_SECRET =
  process.env.TELEGRAM_CALLBACK_SECRET ??
  createHash("sha256")
    .update(`${TELEGRAM_BOT_TOKEN}:${TELEGRAM_CHAT_ID}:rebohrome-callback`)
    .digest("hex");

export const ADMIN_SEED_USERNAME =
  process.env.ADMIN_SEED_USERNAME ?? "monohrome_admin";
export const ADMIN_SEED_PASSWORD =
  process.env.ADMIN_SEED_PASSWORD ?? "123123nrrN!!";
export const ADMIN_SEED_TELEGRAM =
  process.env.ADMIN_SEED_TELEGRAM_USERNAME ?? "@monohrome_admin";
export const EUR_USD_FALLBACK_RATE = Number(
  process.env.EUR_USD_FALLBACK_RATE ?? "1.08",
);
