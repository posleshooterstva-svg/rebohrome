import { NextResponse } from "next/server";
import { z } from "zod";
import { createCheckoutOrder } from "@/lib/db/repository";
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
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create order",
      },
      { status: 400 },
    );
  }
}
