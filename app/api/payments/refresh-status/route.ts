import { NextResponse } from "next/server";
import {
  getTransactionById,
  getTransactionResultTarget,
  refreshTransVoucherTransactionStatus,
} from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { tx?: unknown };
    const tx = typeof payload.tx === "string" ? payload.tx.trim() : "";

    if (!tx) {
      return NextResponse.json(
        { ok: false, error: "Missing transaction id." },
        { status: 400 },
      );
    }

    const session = await getSessionState();

    if (!session.userId) {
      return NextResponse.json(
        {
          ok: false,
          authRequired: true,
          loginPath: `/login?redirectTo=/payment/return?tx=${encodeURIComponent(tx)}`,
        },
        { status: 401 },
      );
    }

    const transaction =
      (await refreshTransVoucherTransactionStatus(tx, session.userId)) ??
      (await getTransactionById(tx, session.userId));

    return NextResponse.json({
      ok: true,
      target: getTransactionResultTarget(transaction),
      status: transaction?.status ?? null,
      kind: transaction?.kind ?? null,
      referenceId: transaction?.referenceId ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to refresh payment status.",
      },
      { status: 400 },
    );
  }
}
