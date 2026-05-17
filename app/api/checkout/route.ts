import { NextResponse } from "next/server";
import { z } from "zod";
import { createCheckoutOrder } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

const paymentMethods = [
  "Archive Balance",
  "Credit Card",
  "Apple Pay",
  "Google Pay",
  "Crypto",
] as const;

const paymentProviders = ["Internal Wallet", "OnlinePay", "Stripe Pay"] as const;
const cryptoNetworks = ["USDT", "BTC", "ETH"] as const;
const supportedCurrencies = ["USD", "EUR"] as const;

const checkoutSchema = z.object({
  shippingName: z.string().min(2).optional(),
  shippingEmail: z.string().email().optional(),
  shippingAddress: z.string().min(5).optional(),
  shippingCity: z.string().min(2).optional(),
  shippingPostalCode: z.string().min(3).optional(),
  paymentMethod: z.enum(paymentMethods),
  provider: z.enum(paymentProviders),
  currency: z.enum(supportedCurrencies),
  cardholderName: z.string().optional(),
  cardNumber: z.string().optional(),
  expiration: z.string().optional(),
  cvv: z.string().optional(),
  billingCountry: z.string().optional(),
  cryptoNetwork: z.enum(cryptoNetworks).optional().nullable(),
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
      ...payload,
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
