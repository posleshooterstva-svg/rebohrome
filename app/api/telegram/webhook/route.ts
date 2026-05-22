import { NextResponse } from "next/server";
import { processTelegramUpdate } from "@/lib/db/repository";
import { TELEGRAM_WEBHOOK_SECRET } from "@/lib/server-config";
import type { TelegramUpdate } from "@/lib/telegram";

function isAuthorized(request: Request) {
  if (!TELEGRAM_WEBHOOK_SECRET) {
    return true;
  }

  const telegramSecret = request.headers.get("x-telegram-bot-api-secret-token");
  const bridgeSecret = request.headers.get("x-rebohrome-telegram-secret");
  const querySecret = new URL(request.url).searchParams.get("secret");

  return (
    telegramSecret === TELEGRAM_WEBHOOK_SECRET ||
    bridgeSecret === TELEGRAM_WEBHOOK_SECRET ||
    querySecret === TELEGRAM_WEBHOOK_SECRET
  );
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      console.warn("Skipped Telegram webhook with invalid or missing secret.");
      return NextResponse.json(
        { ok: true, skipped: true, reason: "unauthorized" },
        { status: 200 },
      );
    }

    const update = (await request.json()) as TelegramUpdate;
    const result = await processTelegramUpdate(update);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Telegram webhook processing failed.";

    if (message.includes("answerCallbackQuery failed")) {
      return NextResponse.json(
        { ok: true, warning: message, syntheticCallback: true },
        { status: 200 },
      );
    }

    console.error("Telegram webhook processing failed.", error);
    return NextResponse.json(
      { ok: true, skipped: true, reason: "processing-error", error: message },
      { status: 200 },
    );
  }
}
