import { NextResponse } from "next/server";
import { getActiveUserPopups } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

export async function GET() {
  const session = await getSessionState();

  if (!session.userId) {
    return NextResponse.json({ popups: [] });
  }

  const popups = await getActiveUserPopups(session.userId);

  return NextResponse.json({
    popups: popups.map((popup) => ({
      id: popup.id,
      title: popup.title,
      body: popup.body,
      type: popup.type,
      cta_label: popup.ctaLabel,
      cta_url: popup.ctaUrl,
      created_at: popup.createdAt,
      allow_user_dismiss: false,
    })),
  });
}
