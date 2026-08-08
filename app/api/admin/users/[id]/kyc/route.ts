import { NextResponse } from "next/server";
import {
  getAdminUserDetail,
  syncAdminUserVeriffStatus,
  updateAdminUserKycStatus,
} from "@/lib/db/repository";
import { getRequestMeta, getSessionState } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionState();

    if (!session.isAdminAuthenticated) {
      return NextResponse.json(
        { ok: false, error: "Admin authentication required." },
        { status: 401 },
      );
    }

    const { id } = await params;
    const userEntry = await getAdminUserDetail(id);

    if (!userEntry) {
      return NextResponse.json(
        { ok: false, error: "User not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      userEntry,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Unable to load KYC status.",
      },
      { status: 400 },
    );
  }
}

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
      action?: unknown;
      reason?: unknown;
    };
    const action = String(payload.action ?? "");

    if (!["approve", "decline", "reset", "sync"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported KYC action." },
        { status: 400 },
      );
    }

    const meta = await getRequestMeta(`/api/admin/users/${id}/kyc`);
    if (action === "sync") {
      const userEntry = await syncAdminUserVeriffStatus({
        adminUserId: session.userId,
        targetUserId: id,
        ...meta,
      });

      return NextResponse.json({
        ok: true,
        message: "Veriff status synced.",
        userEntry,
      });
    }

    const userEntry = await updateAdminUserKycStatus({
      adminUserId: session.userId,
      targetUserId: id,
      action: action as "approve" | "decline" | "reset",
      reason: typeof payload.reason === "string" ? payload.reason : "",
      ...meta,
    });

    return NextResponse.json({
      ok: true,
      message: "KYC status updated.",
      userEntry,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Unable to update KYC status.",
      },
      { status: 400 },
    );
  }
}
