import { NextResponse } from "next/server";
import { createCoinflowCheckoutTokenForSession } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const session = await getSessionState();
    if (!session.userId) {
      return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
    }

    const { sessionId } = await params;
    const result = await createCoinflowCheckoutTokenForSession({
      userId: session.userId,
      sessionId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Gate #4 checkout could not be prepared.",
      },
      { status: 400 },
    );
  }
}
