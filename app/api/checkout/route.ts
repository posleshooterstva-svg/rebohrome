import { NextResponse } from "next/server";
import { z } from "zod";
import { DocumentAcceptanceRequiredError, createCheckoutOrder } from "@/lib/db/repository";
import { getMaintenanceApiResponse } from "@/lib/server/maintenance-guard";
import { getSessionState } from "@/lib/session";

const checkoutSchema = z.object({
  paymentMethod: z.literal("Archive Balance"),
  provider: z.literal("Internal Wallet").optional(),
  currency: z.literal("USD").optional(),
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

    const payload = checkoutSchema.parse(await request.json());
    const session = await getSessionState();

    if (!session.userId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const result = await createCheckoutOrder({
      userId: session.userId,
      provider: "Internal Wallet",
      currency: "USD",
      paymentMethod: payload.paymentMethod,
      items: payload.items,
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
          error instanceof Error ? error.message : "Unable to create order",
      },
      { status: 400 },
    );
  }
}
