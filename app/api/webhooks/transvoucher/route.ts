import { NextResponse } from "next/server";
import {
  processTransVoucherWebhookPayload,
  recordTransVoucherInvalidSignatureAttempt,
} from "@/lib/db/repository";
import { getRequestMeta } from "@/lib/session";
import { verifyTransVoucherWebhookSignature } from "@/lib/transvoucher";

function getSignatureHeader(request: Request) {
  return (
    request.headers.get("x-transvoucher-signature") ??
    request.headers.get("x-signature") ??
    request.headers.get("transvoucher-signature") ??
    request.headers.get("signature")
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = getSignatureHeader(request);

  if (!verifyTransVoucherWebhookSignature(rawBody, signatureHeader)) {
    const requestMeta = await getRequestMeta("/api/webhooks/transvoucher");
    await recordTransVoucherInvalidSignatureAttempt(requestMeta).catch(() => null);
    console.warn("Skipped TransVoucher webhook with invalid signature.");

    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "invalid-signature",
    });
  }

  try {
    const payload = rawBody
      ? (JSON.parse(rawBody) as Record<string, unknown>)
      : {};
    const result = await processTransVoucherWebhookPayload(payload);

    return NextResponse.json(result);
  } catch (error) {
    console.error("TransVoucher webhook processing failed.", error);
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "processing-error",
    });
  }
}
