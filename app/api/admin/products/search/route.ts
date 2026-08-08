import { NextResponse } from "next/server";
import { searchAdminProducts } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSessionState();
  if (!session.isAdminAuthenticated) {
    return NextResponse.json({ ok: false, error: "Admin authentication required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const products = await searchAdminProducts({
    query: url.searchParams.get("query"),
    limit: Number(url.searchParams.get("limit") || 20),
  });
  return NextResponse.json({ ok: true, products });
}
