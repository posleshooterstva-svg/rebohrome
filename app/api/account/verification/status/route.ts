import { NextResponse } from "next/server";
import { isKycVerified } from "@/lib/rebohrome-data";
import { withPerf } from "@/lib/server/perf";
import { getSessionState } from "@/lib/session";

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
  return withPerf("route=/api/account/verification/status:get", async () => {
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
      provider: session.user.kycProvider,
      providerStatus: session.user.veriffStatus,
      decision: session.user.veriffDecision,
      lastWebhookAt: session.user.kycLastWebhookAt,
      manualOverride: session.user.kycManualOverride,
    });
  });
}
