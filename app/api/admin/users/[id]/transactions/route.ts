import { NextResponse } from "next/server";
import { getAdminUserTransactions } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionState();
  if (!session.isAdminAuthenticated) {
    return NextResponse.json({ ok: false, error: "Admin authentication required." }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const transactions = await getAdminUserTransactions({
    userId: id,
    query: url.searchParams.get("query"),
    type: url.searchParams.get("type"),
    status: url.searchParams.get("status"),
    source: url.searchParams.get("source"),
    provider: url.searchParams.get("provider"),
    limit: Number(url.searchParams.get("limit") || 100),
  });

  return NextResponse.json({ ok: true, transactions });
}
