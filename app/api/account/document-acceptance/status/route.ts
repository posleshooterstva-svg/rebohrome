import { NextResponse } from "next/server";
import { getUserDocumentAcceptanceStatus } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSessionState();
    if (!session.isUserAuthenticated || !session.userId) {
      return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
    }

    const status = await getUserDocumentAcceptanceStatus(session.userId);
    return NextResponse.json({
      ok: true,
      accepted: status.accepted,
      acceptedAllAt: status.acceptedAllAt,
      required: status.required,
      ipAddress: status.ipAddress,
      userAgent: status.userAgent,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not load required documents.",
      },
      { status: 400 },
    );
  }
}
