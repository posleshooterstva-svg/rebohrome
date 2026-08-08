import { NextResponse } from "next/server";
import {
  DocumentAcceptanceRequiredError,
  createVeriffKycSessionForUser,
  getUserKycProfile,
  upsertUserKycProfile,
} from "@/lib/db/repository";
import { isKycVerified } from "@/lib/rebohrome-data";
import { withPerf } from "@/lib/server/perf";
import { getRequestMeta, getSessionState } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  return withPerf("route=/api/kyc/veriff/session", async () => {
  try {
    const session = await getSessionState();

    if (!session.isUserAuthenticated || !session.userId) {
      return NextResponse.json(
        { ok: false, error: "Authentication required." },
        { status: 401 },
      );
    }

    const profile = await getUserKycProfile(session.userId);
    return NextResponse.json({
      ok: true,
      profile,
      accountEmail: session.user.email,
      kycStatus: session.user.kycStatus,
      kycVerified: isKycVerified(session.user),
    });
  } catch (error) {
    if (error instanceof DocumentAcceptanceRequiredError) {
      return NextResponse.json(
        {
          ok: false,
          code: "DOCUMENT_ACCEPTANCE_REQUIRED",
          message: "Required documents must be accepted before continuing.",
          error: "Please accept the required ReboHrome documents before starting verification.",
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load verification details.",
      },
      { status: 400 },
    );
  }
  });
}

export async function POST(request: Request) {
  return withPerf("route=/api/kyc/veriff/session", async () => {
  try {
    const session = await getSessionState();

    if (!session.isUserAuthenticated || !session.userId) {
      return NextResponse.json(
        { ok: false, error: "Authentication required." },
        { status: 401 },
      );
    }

    const meta = await getRequestMeta("/api/kyc/veriff/session");
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    await upsertUserKycProfile({
      userId: session.userId,
      firstName: payload.firstName,
      lastName: payload.lastName,
      dateOfBirth: payload.dateOfBirth,
      countryOfResidence: payload.countryOfResidence,
      documentCountry: payload.documentCountry,
      email: payload.email ?? session.user.email,
      phone: payload.phone,
      addressLine1: payload.addressLine1,
      addressLine2: payload.addressLine2,
      city: payload.city,
      postalCode: payload.postalCode,
      state: payload.state,
      auditMeta: meta,
    });

    const result = await createVeriffKycSessionForUser({
      userId: session.userId,
      ...meta,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof DocumentAcceptanceRequiredError) {
      return NextResponse.json(
        {
          ok: false,
          code: "DOCUMENT_ACCEPTANCE_REQUIRED",
          message: "Required documents must be accepted before continuing.",
          error: "Please accept the required ReboHrome documents before starting verification.",
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to start verification.",
      },
      { status: 400 },
    );
  }
  });
}
