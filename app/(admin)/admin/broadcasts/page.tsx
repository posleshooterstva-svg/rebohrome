import { Trash2 } from "lucide-react";
import {
  deleteBroadcastAction,
  retryBroadcastTelegramChannelAction,
  sendBroadcastAction,
} from "@/app/actions/marketplace";
import { BroadcastComposer } from "@/components/admin/broadcast-composer";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import { Button } from "@/components/ui/button";
import {
  getAdminBroadcastDebugStats,
  getAdminBroadcasts,
} from "@/lib/db/repository";
import { formatUtcDateTime } from "@/lib/rebohrome-data";

type AdminBroadcastsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminBroadcastsPage({
  searchParams,
}: AdminBroadcastsPageProps) {
  const params = await searchParams;
  const [broadcasts, debugStats] = await Promise.all([
    getAdminBroadcasts(),
    getAdminBroadcastDebugStats(),
  ]);
  const debugById = new Map(debugStats.map((item) => [item.broadcastId, item]));
  const sentCount = broadcasts.filter((item) => item.status === "sent").length;
  const scheduledCount = broadcasts.filter((item) => item.status === "scheduled").length;
  const draftCount = broadcasts.filter((item) => item.status === "draft").length;
  const failedCount = broadcasts.filter((item) =>
    ["failed", "partially_failed"].includes(item.status),
  ).length;
  const popupCount = broadcasts.filter((item) => item.showAsPopup && item.isActive).length;
  const notice =
    typeof params.sent === "string"
      ? "Broadcast sent."
      : typeof params.saved === "string"
        ? "Broadcast saved."
        : typeof params.deleted === "string"
          ? "Broadcast removed."
          : null;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <AdminShell
      active="broadcasts"
      description="Compose archive announcements, deliver them to website inboxes and Telegram, and control persistent verified-user popups."
      title="Archive Broadcast Center"
    >
      <section className="space-y-6">
        {notice ? (
          <div className="rounded-[16px] border border-emerald-300/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-[16px] border border-rose-300/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <OverviewCard label="Total broadcasts" value={broadcasts.length} />
          <OverviewCard label="Sent" value={sentCount} />
          <OverviewCard label="Scheduled" value={scheduledCount} />
          <OverviewCard label="Drafts" value={draftCount} />
          <OverviewCard label="Failed" value={failedCount} />
          <OverviewCard label="Active popups" value={popupCount} />
        </div>

        <BroadcastComposer />

        <section className="rounded-[22px] border border-line bg-panel p-6 shadow-panel">
          <h2 className="text-xl font-semibold text-foreground">Broadcast History</h2>
          <div className="mt-5 space-y-3">
            {broadcasts.map((broadcast) => {
              const debug = debugById.get(broadcast.id);
              const channels = safeParseChannels(broadcast.channels);
              const canRetryTelegram =
                channels.includes("telegram") &&
                ["sent", "failed", "partially_failed"].includes(broadcast.status);
              return (
                <article
                  className="rounded-[16px] border border-line bg-panel-strong p-4"
                  key={broadcast.id}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted">
                          {broadcast.type}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted">
                          {broadcast.status}
                        </span>
                        {broadcast.showAsPopup ? (
                          <span className="rounded-full border border-violet-300/25 bg-violet-500/12 px-2.5 py-1 text-[11px] text-violet-100">
                            popup
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-foreground">
                        {broadcast.title}
                      </h3>
                      <p className="mt-1 max-w-3xl truncate text-sm text-muted">
                        {broadcast.body}
                      </p>
                      <div className="mt-2 text-xs text-muted">
                        {broadcast.broadcastId} | {broadcast.targetType} |{" "}
                        {formatUtcDateTime(broadcast.createdAt)} UTC
                      </div>
                      <div className="mt-3 grid gap-2 text-[11px] text-muted sm:grid-cols-2 xl:grid-cols-6">
                        <DebugPill
                          label="show_as_popup"
                          value={broadcast.showAsPopup ? "yes" : "no"}
                        />
                        <DebugPill
                          label="is_active"
                          value={broadcast.isActive ? "yes" : "no"}
                        />
                        <DebugPill label="target" value={debug?.targetCount ?? 0} />
                        <DebugPill
                          label="website"
                          value={debug?.websiteDeliveries ?? 0}
                        />
                        <DebugPill
                          label="telegram"
                          value={debug?.telegramDeliveries ?? 0}
                        />
                        <DebugPill
                          label="popup eligible"
                          value={debug?.activePopupEligible ?? 0}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {["draft", "scheduled", "failed", "partially_failed"].includes(
                        broadcast.status,
                      ) ? (
                        <form action={sendBroadcastAction}>
                          <input name="broadcastId" type="hidden" value={broadcast.id} />
                          <Button size="sm" type="submit">
                            Send
                          </Button>
                        </form>
                      ) : null}
                      {canRetryTelegram ? (
                        <form action={retryBroadcastTelegramChannelAction}>
                          <input name="broadcastId" type="hidden" value={broadcast.id} />
                          <Button size="sm" type="submit" variant="secondary">
                            Retry Telegram channel
                          </Button>
                        </form>
                      ) : null}
                      <form action={deleteBroadcastAction}>
                        <input name="broadcastId" type="hidden" value={broadcast.id} />
                        <Button size="sm" type="submit" variant="destructive">
                          <Trash2 className="size-4" />
                          Remove
                        </Button>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })}
            {broadcasts.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-line bg-panel-strong px-5 py-8 text-center text-sm text-muted">
                No archive broadcasts yet.
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </AdminShell>
  );
}

function safeParseChannels(value: string | null) {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function OverviewCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[16px] border border-line bg-panel px-5 py-4 shadow-panel">
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function DebugPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[10px] border border-white/10 bg-white/[0.04] px-3 py-2">
      <span className="block uppercase tracking-[0.14em]">{label}</span>
      <span className="mt-1 block font-semibold text-foreground">{value}</span>
    </div>
  );
}
