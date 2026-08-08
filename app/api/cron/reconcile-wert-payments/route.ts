import { NextResponse } from "next/server";
import { reconcilePendingWertPayments } from "@/lib/db/repository";
import { CRON_SECRET } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const providedSecret =
    request.headers.get("x-cron-secret") ??
    new URL(request.url).searchParams.get("secret") ??
    "";

  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const summary = await reconcilePendingWertPayments({
      limit: 25,
      maxAgeMinutes: 60,
    });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to reconcile Wert payments.",
      },
      { status: 500 },
    );
  }
}
