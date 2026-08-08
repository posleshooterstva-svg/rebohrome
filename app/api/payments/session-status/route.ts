import { NextResponse } from "next/server";
import { checkActivePaymentSessionStatus } from "@/lib/db/repository";
import { withPerf } from "@/lib/server/perf";
import { getSessionState } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withPerf("route=/api/payments/session-status", async () => {
  const session = await getSessionState();

  if (!session.userId) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim() || undefined;
  const typeParam = url.searchParams.get("type");
  const type =
    typeParam === "deposit" || typeParam === "purchase" ? typeParam : undefined;

  if (!sessionId && !type) {
    return NextResponse.json(
      { ok: false, error: "Missing sessionId or type." },
      { status: 400 },
    );
  }

  const result = await checkActivePaymentSessionStatus({
    userId: session.userId,
    sessionId,
    type,
  });

  return NextResponse.json(result);
  });
}
