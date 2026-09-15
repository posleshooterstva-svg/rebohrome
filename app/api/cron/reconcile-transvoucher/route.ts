import { authorizeCron } from "@/lib/security";
import { NextResponse } from "next/server";
import { reconcilePendingTransVoucherPayments } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!authorizeCron(request)) return NextResponse.json({error:"Unauthorized."},{status:401});
  try {
    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? 3), 1),
      200,
    );
    const summary = await reconcilePendingTransVoucherPayments({
      limit,
      triggerSource: "cron",
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("TransVoucher cron reconciliation failed.", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to reconcile TransVoucher payments.",
      },
      { status: 500 },
    );
  }
}
