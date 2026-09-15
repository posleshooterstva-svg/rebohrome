import { NextResponse } from "next/server";
import { reconcilePendingWertPayments } from "@/lib/db/repository";
import { authorizeCron } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!authorizeCron(request)) return NextResponse.json({error:"Unauthorized."},{status:401});
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
