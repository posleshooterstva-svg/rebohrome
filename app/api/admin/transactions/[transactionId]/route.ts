import { NextResponse } from "next/server";
import { adminUpdateTransaction } from "@/lib/db/repository";
import { getRequestMeta, getSessionState } from "@/lib/session";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const session = await getSessionState();
    if (!session.isAdminAuthenticated || !session.userId) {
      return NextResponse.json({ ok: false, error: "Admin authentication required." }, { status: 401 });
    }
    const { transactionId } = await params;
    const payload = (await request.json()) as Record<string, unknown>;
    const meta = await getRequestMeta(`/api/admin/transactions/${transactionId}`);
    const transactions = await adminUpdateTransaction({
      adminUserId: session.userId,
      transactionId,
      status: payload.status,
      paymentProvider: payload.paymentProvider,
      source: payload.source,
      adminNote: payload.adminNote,
      supportNote: payload.supportNote,
      visibleDescription: payload.visibleDescription,
      relatedProductId: payload.relatedProductId,
      relatedOrderId: payload.relatedOrderId,
      reason: payload.reason,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return NextResponse.json({ ok: true, transactions });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update transaction." }, { status: 400 });
  }
}
