import { NextResponse } from "next/server";
import { getActiveUserPopups } from "@/lib/db/repository";
import { withPerf } from "@/lib/server/perf";
import { getSessionState } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return withPerf("route=/api/notifications/active-popups", async () => {
    const session = await getSessionState();

    if (!session.userId) {
      return NextResponse.json(
        { popups: [] },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
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
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  });
}
