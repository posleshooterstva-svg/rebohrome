import { NextResponse } from "next/server";
import { acceptRequiredDocuments } from "@/lib/db/repository";
import { getRequestMeta, getSessionState } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getSessionState();
    if (!session.isUserAuthenticated || !session.userId) {
      return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const meta = await getRequestMeta("/api/account/document-acceptance");
    const status = await acceptRequiredDocuments({
      userId: session.userId,
      termsAccepted: payload.termsAccepted,
      privacyAccepted: payload.privacyAccepted,
      refundAccepted: payload.refundAccepted,
      amlAccepted: payload.amlAccepted,
      legalConfirmationAccepted: payload.legalConfirmationAccepted,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({
      ok: true,
      accepted: status.accepted,
      acceptedAllAt: status.acceptedAllAt,
      required: status.required,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "LEGAL_CONFIRMATION_REQUIRED") {
      return NextResponse.json(
        {
          ok: false,
          code: "LEGAL_CONFIRMATION_REQUIRED",
          message: "Final legal confirmation is required.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not save your acceptance.",
      },
      { status: 400 },
    );
  }
}
