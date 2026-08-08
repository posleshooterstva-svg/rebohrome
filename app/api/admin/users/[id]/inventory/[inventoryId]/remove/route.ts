import { NextResponse } from "next/server";
import { adminChangeUserInventoryQuantity } from "@/lib/db/repository";
import { getRequestMeta, getSessionState } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; inventoryId: string }> },
) {
  try {
    const session = await getSessionState();
    if (!session.isAdminAuthenticated || !session.userId) {
      return NextResponse.json({ ok: false, error: "Admin authentication required." }, { status: 401 });
    }
    const { id, inventoryId } = await params;
    const payload = (await request.json()) as Record<string, unknown>;
    const meta = await getRequestMeta(`/api/admin/users/${id}/inventory/${inventoryId}/remove`);
    const result = await adminChangeUserInventoryQuantity({
      adminUserId: session.userId,
      targetUserId: id,
      inventoryId,
      action: "remove",
      reason: payload.reason,
      adminNote: payload.adminNote,
      visibleUserNote: payload.visibleUserNote,
      returnStock: payload.returnStock,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to remove product." }, { status: 400 });
  }
}
