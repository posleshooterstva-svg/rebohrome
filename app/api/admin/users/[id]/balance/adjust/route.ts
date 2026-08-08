import { NextResponse } from "next/server";
import { adminAdjustUserBalance } from "@/lib/db/repository";
import { getRequestMeta, getSessionState } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionState();
    if (!session.isAdminAuthenticated || !session.userId) {
      return NextResponse.json({ ok: false, error: "Admin authentication required." }, { status: 401 });
    }
    const { id } = await params;
    const payload = (await request.json()) as Record<string, unknown>;
    const meta = await getRequestMeta(`/api/admin/users/${id}/balance/adjust`);
    const detail = await adminAdjustUserBalance({
      adminUserId: session.userId,
      targetUserId: id,
      adjustmentType: payload.adjustmentType,
      amount: payload.amount,
      currency: payload.currency,
      reason: payload.reason,
      internalNote: payload.internalNote,
      visibleUserNote: payload.visibleUserNote,
      linkedTransactionId: payload.linkedTransactionId,
      linkedOrderId: payload.linkedOrderId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return NextResponse.json({ ok: true, detail });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to adjust balance." }, { status: 400 });
  }
}
