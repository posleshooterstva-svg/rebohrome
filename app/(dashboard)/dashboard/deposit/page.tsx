import { DepositPageClient } from "@/components/dashboard/deposit-page-client";
import { DepositSidebarRail } from "@/components/dashboard/deposit-sidebar-rail";
import { VerificationRequiredCard } from "@/components/kyc/verification-required-card";
import { ActivePaymentSessionCard } from "@/components/payment/active-payment-session-card";
import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import {
  getBalanceByUserId,
  getDepositOutcomeById,
  getActivePaymentSession,
  getAvailablePaymentGatesForUser,
  getUserTransactions,
} from "@/lib/db/repository";
import { isKycVerified } from "@/lib/rebohrome-data";
import { withPerf } from "@/lib/server/perf";
import { requireUserSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type DashboardDepositPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardDepositPage({
  searchParams,
}: DashboardDepositPageProps) {
  return withPerf("route=/dashboard/deposit", async () => {
  const session = await requireUserSession("/login");
  const params = await searchParams;
  const receiptId = typeof params.receipt === "string" ? params.receipt : null;
  const failedId = typeof params.failed === "string" ? params.failed : null;
  const outcomeId = receiptId || failedId;

  const [
    balance,
    recentTransactions,
    initialOutcome,
    activePaymentSession,
    paymentGates,
  ] = await Promise.all([
    getBalanceByUserId(session.userId),
    getUserTransactions(session.userId, 5),
    outcomeId ? getDepositOutcomeById(session.userId, outcomeId) : Promise.resolve(null),
    getActivePaymentSession(session.userId, "deposit"),
    getAvailablePaymentGatesForUser(session.userId),
  ]);
  const user = session.user;
  const kycVerified = isKycVerified(user);

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
          userId={session.userId}
        />
      }
    >
      {kycVerified ? (
        <div className="space-y-5">
          {activePaymentSession ? (
            <ActivePaymentSessionCard session={activePaymentSession} />
          ) : null}
          <DepositPageClient
            gate2Details={{
              firstName: user.gate2FirstName,
              lastName: user.gate2LastName,
              phone: user.gate2Phone ?? user.paymentPhone,
            }}
            initialOutcome={initialOutcome}
            paymentGates={paymentGates}
            userId={session.userId}
          />
        </div>
      ) : (
        <VerificationRequiredCard
          description="Before adding funds, enter your verification details and complete identity verification."
          title="Verification required before deposit"
          user={user}
        />
      )}
    </DashboardShell>
  );
  });
}
