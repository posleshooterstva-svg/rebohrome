import { NextResponse } from "next/server";
import { reconcilePendingTransVoucherPayments } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" ? token ?? "" : "";
}

function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret") ?? "";
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";

  if (!secret) {
    return isVercelCron;
  }

  return isVercelCron || getBearerToken(request) === secret || querySecret === secret;
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? 50), 1),
      200,
    );
    const summary = await reconcilePendingTransVoucherPayments({
      limit,
      triggerSource: "cron",
    });

    return NextResponse.json({
      ok: true,
      provider: "TransVoucher",
      ...summary,
    });
  } catch (error) {
    console.error("Payment cron reconciliation failed.", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to reconcile payments.",
      },
      { status: 500 },
    );
  }
}
