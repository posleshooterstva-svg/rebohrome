import { NextResponse } from "next/server";
import { processWertWebhookPayload } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    const result = await processWertWebhookPayload(payload);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Wert webhook processing failed.", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to process Wert webhook.",
      },
      { status: 400 },
    );
  }
}
