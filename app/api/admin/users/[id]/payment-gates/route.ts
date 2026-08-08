import { NextResponse } from "next/server";
import { updateUserPaymentGateAccess } from "@/lib/db/repository";
import type { PaymentProviderKey } from "@/lib/rebohrome-data";
import { getRequestMeta, getSessionState } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionState();

    if (!session.isAdminAuthenticated || !session.userId) {
      return NextResponse.json(
        { ok: false, error: "Admin authentication required." },
        { status: 401 },
      );
    }

    const { id } = await params;
    const payload = (await request.json()) as {
      providerKey?: unknown;
      enabled?: unknown;
      reason?: unknown;
    };
    const providerKey = String(payload.providerKey ?? "");

    if (!["transvoucher", "cleffo", "wert", "coinflow"].includes(providerKey)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported payment gate." },
        { status: 400 },
      );
    }

    const meta = await getRequestMeta(`/api/admin/users/${id}/payment-gates`);
    const userEntry = await updateUserPaymentGateAccess({
      adminUserId: session.userId,
      targetUserId: id,
      providerKey: providerKey as PaymentProviderKey,
      enabled: Boolean(payload.enabled),
      reason: typeof payload.reason === "string" ? payload.reason : "",
      ...meta,
    });

    return NextResponse.json({
      ok: true,
      message: "Payment gate access updated.",
      userEntry,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update payment gate access.",
      },
      { status: 400 },
    );
  }
}
