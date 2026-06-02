import { NextResponse } from "next/server";
import {
  getAdminBroadcasts,
  sendBroadcastNow,
} from "@/lib/db/repository";
import { CRON_SECRET } from "@/lib/server-config";

function isAuthorized(request: Request) {
  const auth = request.headers.get("authorization");
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";

  if (CRON_SECRET && auth === `Bearer ${CRON_SECRET}`) {
    return true;
  }

  return isVercelCron;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const broadcasts = await getAdminBroadcasts();
  const due = broadcasts.filter(
    (item) =>
      item.status === "scheduled" &&
      item.scheduledAt &&
      new Date(item.scheduledAt).getTime() <= now.getTime(),
  );
  const results = [];

  for (const broadcast of due) {
    try {
      results.push(
        await sendBroadcastNow({
          broadcastId: broadcast.id,
          adminUserId: broadcast.createdBy ?? "system",
        }),
      );
    } catch (error) {
      results.push({
        broadcastId: broadcast.broadcastId,
        error: error instanceof Error ? error.message : "Failed to send broadcast.",
      });
    }
  }

  return NextResponse.json({
    checked: broadcasts.length,
    sent: due.length,
    results,
  });
}
