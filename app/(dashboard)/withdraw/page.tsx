import { WithdrawPageClient } from "@/components/dashboard/withdraw-page-client";
import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import {
  getBalanceByUserId,
  getUserById,
  getUserWithdrawals,
} from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function WithdrawPage() {
  const session = await requireUserSession("/login?redirectTo=/withdraw");
  const [balance, user, recentWithdrawals] = await Promise.all([
    getBalanceByUserId(session.userId),
    getUserById(session.userId),
    getUserWithdrawals(session.userId, 12),
  ]);

  return (
    <DashboardShell
      active="withdraw"
      title="Withdrawal Requests"
      description="Create manual payout requests, track approval updates, and keep your archive wallet aligned with withdrawal review."
    >
      <WithdrawPageClient
        balance={balance}
        recentWithdrawals={recentWithdrawals}
        telegramId={user?.telegramId ?? null}
        telegramUsername={user?.telegramUsername ?? ""}
        walletAddress={user?.withdrawalWallet ?? null}
      />
    </DashboardShell>
  );
}
