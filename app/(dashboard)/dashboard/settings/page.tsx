import { saveProfileAction } from "@/app/actions/marketplace";
import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import { Button } from "@/components/ui/button";
import { getUserById } from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";
import { formatDisplayDate } from "@/lib/rebohrome-data";

type DashboardSettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function DashboardSettingsPage({
  searchParams,
}: DashboardSettingsPageProps) {
  const params = await searchParams;
  const session = await requireUserSession("/login");
  const user = await getUserById(session.userId);
  const wasSaved = params.saved === "1";

  return (
    <DashboardShell
      active="settings"
      title="Settings"
      description="Personal preferences, delivery defaults, and collector identity live here instead of being scattered across other screens."
    >
      {wasSaved ? (
        <div className="mb-6 rounded-[20px] border border-emerald-300/50 bg-emerald-100/70 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          Profile updated successfully.
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <form action={saveProfileAction} className="rounded-[24px] border border-line bg-panel-strong p-5">
          <div className="text-lg font-semibold text-foreground">
            Account profile
          </div>
          <div className="mt-4 space-y-3">
            <input
              className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
              defaultValue={user?.name ?? ""}
              name="name"
            />
            <input
              className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
              defaultValue={user?.telegramUsername ?? ""}
              name="telegramUsername"
            />
            <input
              className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
              defaultValue={user?.telegramId ?? ""}
              name="telegramId"
              placeholder="Telegram ID"
            />
            <input
              className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
              defaultValue={user?.withdrawalWallet ?? ""}
              name="withdrawalWallet"
              placeholder="USDT BEP20 wallet"
            />
          </div>
          <div className="mt-6">
            <Button type="submit">Save settings</Button>
          </div>
        </form>

        <div className="rounded-[24px] border border-line bg-panel-strong p-5">
          <div className="text-lg font-semibold text-foreground">
            Collector access
          </div>
          <div className="mt-4 space-y-4 text-sm text-muted">
            <div className="rounded-2xl border border-line bg-panel px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                Account role
              </div>
              <div className="mt-2 text-base font-semibold text-foreground">
                {user?.role === "admin" ? "Administrator" : "Collector"}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-panel px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                Username
              </div>
              <div className="mt-2 text-base font-semibold text-foreground">
                {user?.username ?? "Unknown"}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-panel px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                Member since
              </div>
              <div className="mt-2 text-base font-semibold text-foreground">
                {user ? formatDisplayDate(user.createdAt) : "Unknown"}
              </div>
            </div>
            <p className="leading-7">
              Collection ownership, vault value, and order history are all driven by your live purchases.
            </p>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
