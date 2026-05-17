import { NextResponse } from "next/server";
import { z } from "zod";
import { createCheckoutPaymentSession } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

const paymentMethods = ["Credit Card", "Apple Pay", "Google Pay", "Crypto"] as const;
const paymentProviders = ["OnlinePay", "Stripe Pay"] as const;
const supportedCurrencies = ["USD", "EUR"] as const;

const sessionSchema = z.object({
  paymentMethod: z.enum(paymentMethods),
  provider: z.enum(paymentProviders),
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
    const payload = sessionSchema.parse(await request.json());
    const session = await getSessionState();

    if (!session.userId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const result = await createCheckoutPaymentSession({
      userId: session.userId,
      ...payload,
    });

    return NextResponse.json(result);
  } catch (error) {
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
