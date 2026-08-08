import { NextResponse } from "next/server";
import { syncCurrentUserVeriffStatus } from "@/lib/db/repository";
import { isKycVerified } from "@/lib/rebohrome-data";
import { withPerf } from "@/lib/server/perf";
import { getRequestMeta, getSessionState } from "@/lib/session";

export const runtime = "nodejs";

function getVerificationSource(user: NonNullable<Awaited<ReturnType<typeof getSessionState>>["user"]>) {
  if (user.kycManualOverride) {
    return user.kycStatus === "manual_approved" ? "manual_admin" : "manual_rejected";
  }

  if (user.veriffDecision) {
    return "veriff_decision";
  }

  if (user.kycVerified && !isKycVerified(user)) {
    return "inconsistent";
  }

  return "none";
}

export async function GET() {
  return withPerf("route=/api/kyc/veriff/check-status:get", async () => {
    const session = await getSessionState();

    if (!session.isUserAuthenticated || !session.user) {
      return NextResponse.json(
        { ok: false, error: "Authentication required." },
        { status: 401 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: session.user.kycStatus,
      verified: isKycVerified(session.user),
      source: getVerificationSource(session.user),
      decision: session.user.veriffDecision,
      providerStatus: session.user.veriffStatus,
      lastWebhookAt: session.user.kycLastWebhookAt,
    });
  });
}

export async function POST() {
  return withPerf("route=/api/kyc/veriff/check-status", async () => {
    try {
      const session = await getSessionState();

      if (!session.isUserAuthenticated || !session.userId) {
        return NextResponse.json(
          { ok: false, error: "Authentication required." },
          { status: 401 },
        );
      }

      const meta = await getRequestMeta("/api/kyc/veriff/check-status");
      const result = await syncCurrentUserVeriffStatus({
        userId: session.userId,
        ...meta,
      });

      return NextResponse.json({
        ...result,
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to sync Veriff status.",
        },
        { status: 400 },
      );
    }
  });
}
