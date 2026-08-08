import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { COINFLOW_WEBHOOK_VALIDATION_KEY } from "@/lib/server-config";

export type CoinflowWebhookVerificationResult =
  | { ok: true; method: "signature" | "authorization" | "unconfigured" }
  | { ok: false; reason: string };

function parseSignatureHeader(header: string) {
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  return {
    timestamp: parts.t,
    signature: parts.v1,
  };
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyCoinflowWebhook(input: {
  rawBody: string;
  signatureHeader: string | null;
  authorizationHeader: string | null;
}): CoinflowWebhookVerificationResult {
  if (!COINFLOW_WEBHOOK_VALIDATION_KEY) {
    return { ok: true, method: "unconfigured" };
  }

  if (input.signatureHeader) {
    const { timestamp, signature } = parseSignatureHeader(input.signatureHeader);
    if (!timestamp || !signature) {
      return { ok: false, reason: "Malformed Coinflow-Signature header." };
    }

    const expected = createHmac("sha256", COINFLOW_WEBHOOK_VALIDATION_KEY)
      .update(`${timestamp}.${input.rawBody}`)
      .digest("hex");

    if (!safeEqual(expected, signature)) {
      return { ok: false, reason: "Invalid Coinflow webhook signature." };
    }

    return { ok: true, method: "signature" };
  }

  const authorization = input.authorizationHeader?.replace(/^Bearer\s+/i, "").trim();
  if (authorization && safeEqual(authorization, COINFLOW_WEBHOOK_VALIDATION_KEY)) {
    return { ok: true, method: "authorization" };
  }

  return { ok: false, reason: "Missing Coinflow webhook signature." };
}

export function getCoinflowEventType(payload: Record<string, unknown>) {
  return String(
    payload.eventType ??
      payload.event_type ??
      payload.type ??
      payload.event ??
      payload.name ??
      "",
  );
}

export function getCoinflowEventId(payload: Record<string, unknown>) {
  return String(payload.id ?? payload.eventId ?? payload.event_id ?? "");
}

export function getCoinflowData(payload: Record<string, unknown>) {
  const data = payload.data;
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : payload;
}

export function getCoinflowWebhookInfo(payload: Record<string, unknown>) {
  const data = getCoinflowData(payload);
  const webhookInfo = data.webhookInfo ?? data.webhook_info ?? payload.webhookInfo;
  return webhookInfo && typeof webhookInfo === "object"
    ? (webhookInfo as Record<string, unknown>)
    : {};
}
