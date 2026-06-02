import { NextResponse } from "next/server";
import { updateXRocketWithdrawalFromPayload } from "@/lib/db/repository";
import { XROCKET_WEBHOOK_SECRET } from "@/lib/server-config";

function isAuthorized(request: Request) {
  if (!XROCKET_WEBHOOK_SECRET) {
    return true;
  }

  const headerSecret =
    request.headers.get("x-xrocket-webhook-secret") ??
    request.headers.get("x-webhook-secret");
  const querySecret = new URL(request.url).searchParams.get("secret");
  return headerSecret === XROCKET_WEBHOOK_SECRET || querySecret === XROCKET_WEBHOOK_SECRET;
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const result = await updateXRocketWithdrawalFromPayload(payload);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "xRocket webhook failed.",
      },
      { status: 500 },
    );
  }
}
