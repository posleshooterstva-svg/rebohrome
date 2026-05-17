import { NextResponse } from "next/server";
import { z } from "zod";
import { createDepositPaymentSession } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

const depositMethods = ["Credit Card", "Apple Pay", "Google Pay", "Crypto"] as const;
const paymentProviders = ["OnlinePay", "Stripe Pay"] as const;
const supportedCurrencies = ["USD", "EUR"] as const;

const sessionSchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(supportedCurrencies),
  paymentMethod: z.enum(depositMethods),
  provider: z.enum(paymentProviders),
});

export async function POST(request: Request) {
  try {
    const payload = sessionSchema.parse(await request.json());
    const session = await getSessionState();

    if (!session.userId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const result = await createDepositPaymentSession({
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
            : "Unable to initialize secure deposit.",
      },
      { status: 400 },
    );
  }
}
