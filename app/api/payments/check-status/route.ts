import { NextResponse } from "next/server";
import { z } from "zod";
import { checkActivePaymentSessionStatus } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

const schema = z.object({
  type: z.enum(["deposit", "purchase"]).optional(),
});

export async function POST(request: Request) {
  const session = await getSessionState();

  if (!session.userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = schema.parse(await request.json().catch(() => ({})));
  const result = await checkActivePaymentSessionStatus({
    userId: session.userId,
    type: payload.type,
  });

  return NextResponse.json(result);
}
