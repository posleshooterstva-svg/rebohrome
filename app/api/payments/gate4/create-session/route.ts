import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DocumentAcceptanceRequiredError,
  KycVerificationRequiredError,
  createDepositPaymentSession,
} from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

const schema = z.object({
  amount: z.number().positive(),
  currency: z.literal("USD").default("USD"),
});

export async function POST(request: Request) {
  try {
    const session = await getSessionState();
    if (!session.userId) {
      return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
    }

    const payload = schema.parse(await request.json());
    const result = await createDepositPaymentSession({
      userId: session.userId,
      amount: payload.amount,
      currency: "USD",
      paymentMethod: "Credit Card",
      provider: "Coinflow",
      gateNumber: 4,
    });

    return NextResponse.json({
      ok: true,
      sessionId: result.sessionId,
      checkoutUrl: result.redirectPath,
    });
  } catch (error) {
    if (error instanceof DocumentAcceptanceRequiredError) {
      return NextResponse.json(
        {
          ok: false,
          code: "DOCUMENT_ACCEPTANCE_REQUIRED",
          message: "Required documents must be accepted before continuing.",
          error: "Please accept the required ReboHrome documents before continuing.",
        },
        { status: 403 },
      );
    }

    if (error instanceof KycVerificationRequiredError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Please complete verification before making a card payment.",
          requiresVerification: true,
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
            : "Gate #4 checkout could not be prepared.",
      },
      { status: 400 },
    );
  }
}
