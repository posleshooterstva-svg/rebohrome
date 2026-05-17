import { NextResponse } from "next/server";
import { z } from "zod";
import { finalizeDepositPaymentSession } from "@/lib/db/repository";
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
