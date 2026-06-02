import Link from "next/link";
import { BellRing, CheckCircle2, ExternalLink } from "lucide-react";
import { markNotificationReadAction } from "@/app/actions/marketplace";
import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import { Button } from "@/components/ui/button";
import { getUserNotifications } from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";

export default async function NotificationsPage() {
  const session = await requireUserSession("/login");
  const notifications = await getUserNotifications(session.userId);

  return (
    <DashboardShell
      active="dashboard"
      description="Important archive notices and platform announcements appear here."
      hideIntro
      notificationHref="/notifications"
      title="Notifications"
    >
      <section className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">
              Archive Notices
            </div>
            <h1 className="mt-2 display-font text-4xl font-semibold tracking-[-0.05em] text-foreground">
              Notifications
            </h1>
          </div>
          <form action={markNotificationReadAction}>
            <input name="all" type="hidden" value="true" />
            <Button type="submit" variant="secondary">
              Mark all as read
            </Button>
          </form>
        </div>

        {notifications.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-line bg-panel p-8 text-center">
            <BellRing className="mx-auto size-8 text-[var(--accent)]" />
            <h2 className="mt-4 text-xl font-semibold text-foreground">
              No archive notices yet.
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted">
              Important updates from ReboHrome will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <article
                className="rounded-[18px] border border-line bg-panel p-5 shadow-panel"
                key={notification.id}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted">
                        {notification.type.replace(/_/g, " ")}
                      </span>
                      {!notification.readAt ? (
                        <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)]">
                          Unread
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-3 text-xl font-semibold text-foreground">
                      {notification.title}
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
                      {notification.body}
                    </p>
                    <div className="mt-3 text-xs text-muted">
                      {new Date(notification.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {notification.ctaUrl ? (
                      <Button asChild>
                        <Link href={notification.ctaUrl}>
                          {notification.ctaLabel || "Open"}
                          <ExternalLink className="ml-2 size-4" />
                        </Link>
                      </Button>
                    ) : null}
                    {!notification.readAt ? (
                      <form action={markNotificationReadAction}>
                        <input
                          name="notificationId"
                          type="hidden"
                          value={notification.id}
                        />
                        <Button type="submit" variant="secondary">
                          <CheckCircle2 className="mr-2 size-4" />
                          Mark read
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
