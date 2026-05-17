import { DepositPageClient } from "@/components/dashboard/deposit-page-client";
import { DepositSidebarRail } from "@/components/dashboard/deposit-sidebar-rail";
import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import {
  getBalanceByUserId,
  getDepositOutcomeById,
  getUserTransactions,
} from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type DashboardDepositPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardDepositPage({
  searchParams,
}: DashboardDepositPageProps) {
  const session = await requireUserSession("/login");
  const params = await searchParams;
  const receiptId = typeof params.receipt === "string" ? params.receipt : null;
  const failedId = typeof params.failed === "string" ? params.failed : null;
  const outcomeId = receiptId || failedId;

  const [balance, recentTransactions, initialOutcome] = await Promise.all([
    getBalanceByUserId(session.userId),
    getUserTransactions(session.userId, 5),
    outcomeId ? getDepositOutcomeById(session.userId, outcomeId) : Promise.resolve(null),
  ]);

  return (
    <DashboardShell
      active="deposit"
      title="Deposit"
      description="Fund your internal archive balance through a cinematic premium flow and keep every top-up tracked in one private place."
      hideIntro
      rightRail={
        <DepositSidebarRail
          balance={balance}
          recentTransactions={recentTransactions}
        />
      }
    >
      <DepositPageClient initialOutcome={initialOutcome} />
    </DashboardShell>
  );
}
