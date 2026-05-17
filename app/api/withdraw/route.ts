import { NextResponse } from "next/server";
import { z } from "zod";
import { createWithdrawalRequest } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

const withdrawSchema = z.object({
  amount: z.number().positive(),
  walletAddress: z.string().min(4).optional(),
});

export async function POST(request: Request) {
  try {
    const payload = withdrawSchema.parse(await request.json());
    const session = await getSessionState();

    if (!session.userId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const requestId = await createWithdrawalRequest({
      userId: session.userId,
      amount: payload.amount,
      walletAddress: payload.walletAddress,
    });

    return NextResponse.json({ requestId });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create withdrawal request.",
      },
      { status: 400 },
    );
  }
}
