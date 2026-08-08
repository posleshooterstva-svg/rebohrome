import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DocumentAcceptanceRequiredError,
  KycVerificationRequiredError,
  createCheckoutPaymentSession,
} from "@/lib/db/repository";
import { getMaintenanceApiResponse } from "@/lib/server/maintenance-guard";
import { getSessionState } from "@/lib/session";

const paymentMethods = ["Credit Card", "Apple Pay", "Google Pay"] as const;
const supportedCurrencies = ["USD", "EUR"] as const;

const sessionSchema = z.object({
  paymentMethod: z.enum(paymentMethods),
  provider: z.literal("TransVoucher").optional(),
  currency: z.enum(supportedCurrencies),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1),
        deliveryType: z.enum(["digital", "physical"]),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  try {
    const maintenanceResponse = await getMaintenanceApiResponse();
    if (maintenanceResponse) {
      return maintenanceResponse;
    }

    const payload = sessionSchema.parse(await request.json());
    const sessionInput = {
      paymentMethod: payload.paymentMethod,
      currency: payload.currency,
      items: payload.items,
    };
    const session = await getSessionState();

    if (!session.userId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const result = await createCheckoutPaymentSession({
      userId: session.userId,
      provider: "TransVoucher",
      ...sessionInput,
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

    if (error instanceof KycVerificationRequiredError) {
      return NextResponse.json(
        {
          error: "Please complete verification before making a card payment.",
          requiresVerification: true,
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to initialize secure checkout.",
      },
      { status: 400 },
    );
  }
}
