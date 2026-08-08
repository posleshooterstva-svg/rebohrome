import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DocumentAcceptanceRequiredError,
  finalizeDepositPaymentSession,
} from "@/lib/db/repository";
import { getMaintenanceApiResponse } from "@/lib/server/maintenance-guard";
import { getSessionState } from "@/lib/session";

const cryptoNetworks = ["USDT", "BTC", "ETH"] as const;

const paymentSchema = z.object({
  sessionId: z.string().uuid(),
  cardholderName: z.string().optional(),
  cardNumber: z.string().optional(),
  expiration: z.string().optional(),
  cvv: z.string().optional(),
  billingCountry: z.string().optional(),
  cryptoNetwork: z.enum(cryptoNetworks).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const maintenanceResponse = await getMaintenanceApiResponse();
    if (maintenanceResponse) {
      return maintenanceResponse;
    }

    const payload = paymentSchema.parse(await request.json());
    const session = await getSessionState();

    if (!session.userId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const result = await finalizeDepositPaymentSession({
      userId: session.userId,
      ...payload,
    });

    return NextResponse.json(result);
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

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete secure deposit.",
      },
      { status: 400 },
    );
  }
}
