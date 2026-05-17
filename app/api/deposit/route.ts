import { NextResponse } from "next/server";
import { z } from "zod";
import { createDeposit } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

const depositMethods = ["Credit Card", "Apple Pay", "Google Pay", "Crypto"] as const;
const paymentProviders = ["OnlinePay", "Stripe Pay"] as const;
const cryptoNetworks = ["USDT", "BTC", "ETH"] as const;
const supportedCurrencies = ["USD", "EUR"] as const;

const depositSchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(supportedCurrencies),
  paymentMethod: z.enum(depositMethods),
  provider: z.enum(paymentProviders),
  cardholderName: z.string().optional(),
  cardNumber: z.string().optional(),
  expiration: z.string().optional(),
  cvv: z.string().optional(),
  billingCountry: z.string().optional(),
  cryptoNetwork: z.enum(cryptoNetworks).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const payload = depositSchema.parse(await request.json());
    const session = await getSessionState();

    if (!session.userId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const result = await createDeposit({
      userId: session.userId,
      ...payload,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to complete deposit.",
      },
      { status: 400 },
    );
  }
}
