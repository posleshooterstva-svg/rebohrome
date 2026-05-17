import { NextResponse } from "next/server";
import { processTelegramUpdate } from "@/lib/db/repository";
import { TELEGRAM_CALLBACK_SECRET } from "@/lib/server-config";
import type { TelegramUpdate } from "@/lib/telegram";

function isAuthorized(request: Request) {
  if (!TELEGRAM_CALLBACK_SECRET) {
    return false;
  }

  const telegramSecret = request.headers.get("x-telegram-bot-api-secret-token");
  const bridgeSecret = request.headers.get("x-rebohrome-telegram-secret");

  return (
    telegramSecret === TELEGRAM_CALLBACK_SECRET ||
    bridgeSecret === TELEGRAM_CALLBACK_SECRET
  );
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized webhook request." }, { status: 401 });
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

    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }
}
