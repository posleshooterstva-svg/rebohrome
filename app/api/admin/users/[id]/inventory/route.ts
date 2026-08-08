import { NextResponse } from "next/server";
import { getAdminUserInventory } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionState();
  if (!session.isAdminAuthenticated) {
    return NextResponse.json({ ok: false, error: "Admin authentication required." }, { status: 401 });
  }

  const { id } = await params;
  const inventory = await getAdminUserInventory(id);
  return NextResponse.json({ ok: true, inventory });
}
