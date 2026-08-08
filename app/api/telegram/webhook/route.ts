import { NextResponse } from "next/server";
import {
  processTelegramUpdate,
  processTransVoucherWebhookPayload,
} from "@/lib/db/repository";
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

function isTransVoucherPayload(payload: Record<string, unknown>) {
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;
  const metadata =
    data.metadata && typeof data.metadata === "object"
      ? (data.metadata as Record<string, unknown>)
      : payload.metadata && typeof payload.metadata === "object"
        ? (payload.metadata as Record<string, unknown>)
        : {};

  return Boolean(
    payload.provider === "TransVoucher" ||
      payload.payment_provider === "TransVoucher" ||
      data.provider === "TransVoucher" ||
      data.payment_provider === "TransVoucher" ||
      data.transaction_id ||
      data.transactionId ||
      data.payment_id ||
      data.paymentId ||
      metadata.internal_transaction_id ||
      metadata.depositId ||
      metadata.orderId,
  );
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};

    if (isTransVoucherPayload(payload)) {
      const result = await processTransVoucherWebhookPayload(payload);
      return NextResponse.json({
        ...result,
        routedFrom: "/api/telegram/webhook",
      });
    }

    if (!isAuthorized(request)) {
      console.warn("Skipped Telegram webhook with invalid or missing secret.");
      return NextResponse.json(
        { ok: true, skipped: true, reason: "unauthorized" },
        { status: 200 },
      );
    }

    const update = payload as TelegramUpdate;
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
