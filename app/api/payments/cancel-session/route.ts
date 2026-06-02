import { NextResponse } from "next/server";
import { z } from "zod";
import { cancelActivePaymentSession } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

const schema = z.object({
  sessionId: z.string().min(1),
  type: z.enum(["deposit", "purchase"]),
});

export async function POST(request: Request) {
  const session = await getSessionState();

  if (!session.userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const payload = schema.parse(await request.json());
    return NextResponse.json(
      await cancelActivePaymentSession({
        userId: session.userId,
        sessionId: payload.sessionId,
        type: payload.type,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to cancel payment session.",
      },
      { status: 400 },
    );
  }
}
