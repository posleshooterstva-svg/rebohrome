import { NextResponse } from "next/server";
import { reconcileXRocketWithdrawals } from "@/lib/db/repository";
import { CRON_SECRET } from "@/lib/server-config";

function isAuthorized(request: Request) {
  if (!CRON_SECRET) {
    return true;
  }

  const headerSecret = request.headers.get("x-cron-secret");
  const querySecret = new URL(request.url).searchParams.get("secret");
  return headerSecret === CRON_SECRET || querySecret === CRON_SECRET;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const result = await reconcileXRocketWithdrawals();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "xRocket reconciliation failed.",
      },
      { status: 500 },
    );
  }
}
