import { changeEmailAction, saveProfileAction } from "@/app/actions/marketplace";
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
  const emailUpdated = params.emailUpdated === "1";
  const emailError = typeof params.emailError === "string" ? params.emailError : null;

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
      {emailUpdated ? (
        <div className="mb-6 rounded-[20px] border border-emerald-300/50 bg-emerald-100/70 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          Email updated successfully.
        </div>
      ) : null}
      {emailError ? (
        <div className="mb-6 rounded-[20px] border border-rose-300/50 bg-rose-100/70 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300">
          {emailError}
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
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

          <form action={changeEmailAction} className="rounded-[24px] border border-line bg-panel-strong p-5">
            <div className="text-lg font-semibold text-foreground">
              Email management
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Your next TransVoucher deposit or checkout always uses the current email stored on your account.
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-line bg-panel px-4 py-3">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Current email
                </div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {user?.email ?? "Unknown"}
                </div>
              </div>
              <input
                className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                defaultValue={user?.email ?? ""}
                name="email"
                placeholder="new@example.com"
                type="email"
              />
              <input
                className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                name="confirmEmail"
                placeholder="Confirm new email"
                type="email"
              />
              <input
                className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                name="currentPassword"
                placeholder="Current password"
                type="password"
              />
            </div>
            <div className="mt-6">
              <Button type="submit">Update email</Button>
            </div>
          </form>
        </div>

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
                Telegram verification
              </div>
              <div className="mt-2 text-base font-semibold text-foreground">
                {user?.telegramVerified ? "Verified" : "Pending verification"}
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
