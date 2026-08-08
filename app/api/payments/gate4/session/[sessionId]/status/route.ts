import { NextResponse } from "next/server";
import { getCoinflowGateSessionStatus } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await getSessionState();
  if (!session.userId) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const { sessionId } = await params;
  const status = await getCoinflowGateSessionStatus({
    userId: session.userId,
    sessionId,
  });

  if (!status) {
    return NextResponse.json({ ok: false, error: "Gate #4 session not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ...status });
}
