import { NextResponse } from "next/server";
import { processVeriffWebhook } from "@/lib/db/repository";
import { getRequestMeta } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();

  try {
    const meta = await getRequestMeta("/api/webhooks/veriff");
    const result = await processVeriffWebhook({
      rawBody,
      signature: request.headers.get("x-hmac-signature"),
      authClient: request.headers.get("x-auth-client"),
      ...meta,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid Veriff webhook.";
    const status =
      message.includes("signature") || message.includes("auth client") ? 401 : 400;

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status },
    );
  }
}
