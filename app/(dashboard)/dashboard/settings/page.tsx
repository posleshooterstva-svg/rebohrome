import {
  acceptArchiveRulesAction,
  changeEmailAction,
  saveProfileAction,
} from "@/app/actions/marketplace";
import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import { Button } from "@/components/ui/button";
import { getBalanceByUserId, getUserById } from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";
import {
  formatDisplayDate,
  formatUsd,
  getPayoutTierProgress,
} from "@/lib/rebohrome-data";

type DashboardSettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function DashboardSettingsPage({
  searchParams,
}: DashboardSettingsPageProps) {
  const params = await searchParams;
  const session = await requireUserSession("/login");
  const [user, balance] = await Promise.all([
    getUserById(session.userId),
    getBalanceByUserId(session.userId),
  ]);
  const tierProgress = getPayoutTierProgress(balance?.totalDeposited ?? 0);
  const wasSaved = params.saved === "1";
  const emailUpdated = params.emailUpdated === "1";
  const archiveRulesAccepted = params.archiveRulesAccepted === "1";
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
      {archiveRulesAccepted ? (
        <div className="mb-6 rounded-[20px] border border-emerald-300/50 bg-emerald-100/70 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          Archive Economy Rules accepted. Vault Integrity has been refreshed.
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <form action={saveProfileAction} className="rounded-[24px] border border-line bg-panel-strong p-5">
            <div className="text-lg font-semibold text-foreground">
              Payout Details
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Telegram and a valid USDT BEP20 wallet are required before creating a withdrawal request.
            </p>
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
              <Button type="submit">Save payout details</Button>
            </div>
          </form>

          <section className="rounded-[24px] border border-line bg-panel-strong p-5">
            <div className="text-lg font-semibold text-foreground">
              Vault Integrity
            </div>
            <div className="mt-4 rounded-2xl border border-line bg-panel px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">
                    Archive readiness
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-foreground">
                    {user?.vaultIntegrityScore ?? 0}%
                  </div>
                </div>
                <div className="rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 text-sm font-medium text-[var(--accent)]">
                  {user?.vaultIntegrityStatus ?? "Unstable"}
                </div>
              </div>
              <p className="mt-4 text-sm leading-7 text-muted">
                Your archive profile reflects verified contact details, completed
                profile setup, account security, platform alignment, and active
                collector readiness.
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--background-soft)]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#8b5cf6,#b388ff)]"
                  style={{ width: `${user?.vaultIntegrityScore ?? 0}%` }}
                />
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-line bg-panel-strong p-5">
            <div className="text-lg font-semibold text-foreground">
              Archive Rules
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Review the latest Archive Economy Rules to keep your profile aligned
              with platform standards.
            </p>
            <div className="mt-4 rounded-2xl border border-line bg-panel px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">
                    Status
                  </div>
                  <div className="mt-2 text-base font-semibold text-foreground">
                    {user?.archiveRulesAcceptedAt ? "Accepted" : "Not accepted"}
                  </div>
                </div>
                <Button asChild variant="secondary">
                  <a href="/archive-rules">Review rules</a>
                </Button>
              </div>
              {!user?.archiveRulesAcceptedAt ? (
                <form action={acceptArchiveRulesAction} className="mt-4">
                  <Button type="submit">Accept Archive Rules</Button>
                </form>
              ) : null}
            </div>
          </section>

          <section className="rounded-[24px] border border-line bg-panel-strong p-5">
            <div className="text-lg font-semibold text-foreground">
              Payout Tier Progress
            </div>
            <div className="mt-4 rounded-2xl border border-line bg-panel px-4 py-4">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted">Progress</span>
                <span className="font-semibold text-foreground">
                  {formatUsd(balance?.totalDeposited ?? 0)} / {formatUsd(tierProgress.nextThreshold)}
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--background-soft)]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#111827,#7266ff)]"
                  style={{
                    width: `${Math.min(
                      100,
                      ((balance?.totalDeposited ?? 0) / tierProgress.nextThreshold) * 100,
                    )}%`,
                  }}
                />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <InfoPill label="Current bonus" value={`+${tierProgress.currentBonus}%`} />
                <InfoPill label="Next bonus at" value={formatUsd(tierProgress.nextThreshold)} />
              </div>
            </div>
          </section>

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

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel-strong px-4 py-3">
      <div className="text-xs uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className="mt-2 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
