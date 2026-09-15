import { readCart,writeCart,CartConflict } from "@/lib/payments/cart";
import { getDbClient } from "@/lib/db/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMaintenanceApiResponse } from "@/lib/server/maintenance-guard";
import { getSessionState } from "@/lib/session";

const cartSchema = z.object({
  version:z.number().int().nonnegative(),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().min(1).max(100),
      deliveryType: z.enum(["digital", "physical"]),
    }),
  ),
});

export async function GET() {
  const session = await getSessionState();

  if (!session.userId) {
    return NextResponse.json({ authenticated: false, items: [] });
  }

  const cart = await readCart(getDbClient(),session.userId);
  return NextResponse.json({ authenticated: true, ...cart }, {headers:{'Cache-Control':'no-store'}});
}

export async function PUT(request: Request) {
  try {
    const maintenanceResponse = await getMaintenanceApiResponse();
    if (maintenanceResponse) {
      return maintenanceResponse;
    }

    const session = await getSessionState();

    if (!session.userId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const payload = cartSchema.parse(await request.json());
    const version=await writeCart(getDbClient(),session.userId,payload.items,payload.version);
    return NextResponse.json({ ok: true, version });
  } catch (error) {
    if(error instanceof CartConflict)return NextResponse.json({error:error.message},{status:409});
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to sync cart.",
      },
      { status: 400 },
    );
  }
}
