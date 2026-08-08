import { NextResponse } from "next/server";
import { processCoinflowWebhookPayload } from "@/lib/db/repository";
import { getCoinflowConfig } from "@/lib/server/payments/coinflow-client";
import { verifyCoinflowWebhook } from "@/lib/server/payments/coinflow-webhooks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = getCoinflowConfig();
  const rawBody = await request.text();
  const verification = verifyCoinflowWebhook({
    rawBody,
    signatureHeader: request.headers.get("coinflow-signature"),
    authorizationHeader: request.headers.get("authorization"),
  });

  if (!verification.ok) {
    console.warn(`[COINFLOW_GATE4][${config.env}][card] webhook_signature_invalid`, {
      reason: verification.reason,
    });
    return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 401 });
  }

  console.info(`[COINFLOW_GATE4][${config.env}][card] webhook_signature_valid`, {
    method: verification.method,
  });

  let payload: Record<string, unknown>;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  console.info(`[COINFLOW_GATE4][${config.env}][card] webhook_received`);
  const result = await processCoinflowWebhookPayload(payload);
  return NextResponse.json(result);
}
