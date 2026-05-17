import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getUserCartItems,
  replaceUserCartItems,
} from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

const cartSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().min(1),
      deliveryType: z.enum(["digital", "physical"]),
    }),
  ),
});

export async function GET() {
  const session = await getSessionState();

  if (!session.userId) {
    return NextResponse.json({ authenticated: false, items: [] });
  }

  const items = await getUserCartItems(session.userId);
  return NextResponse.json({ authenticated: true, items });
}

export async function PUT(request: Request) {
  try {
    const session = await getSessionState();

    if (!session.userId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const payload = cartSchema.parse(await request.json());
    await replaceUserCartItems(session.userId, payload.items);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to sync cart.",
      },
      { status: 400 },
    );
  }
}
