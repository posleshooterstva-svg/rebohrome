import { NextResponse } from "next/server";
import { createCoinflowCheckoutTokenForSession } from "@/lib/db/repository";
import { getRequestMeta, getSessionState } from "@/lib/session";
import { CoinflowCountryAccessError } from "@/lib/payments/coinflow-country-policy";

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
    const requestMeta = await getRequestMeta(
      `/api/payments/gate4/session/${sessionId}/checkout-token`,
    );
    const result = await createCoinflowCheckoutTokenForSession({
      userId: session.userId,
      sessionId,
      requestIpAddress: requestMeta.ipAddress,
      requestCountry: requestMeta.country,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof CoinflowCountryAccessError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 403 },
      );
    }

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
