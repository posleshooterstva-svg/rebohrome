import { LiveDashboardOverview } from "@/components/dashboard/live-dashboard-overview";
import { VerificationRequiredCard } from "@/components/kyc/verification-required-card";
import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import {
  getDashboardStats,
  getUserInventory,
  getUserOrders,
} from "@/lib/db/repository";
import { isKycVerified } from "@/lib/rebohrome-data";
import { withPerf } from "@/lib/server/perf";
import { requireUserSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  return withPerf("route=/dashboard", async () => {
  const session = await requireUserSession("/login");
  const [dashboardStats, dashboardOrders, inventory] = await Promise.all([
    getDashboardStats(session.userId),
    getUserOrders(session.userId, 6),
    getUserInventory(session.userId, 8),
  ]);

  return (
    <DashboardShell
      active="dashboard"
      title="Collector Dashboard"
      description="Your private product surface for archive balance, verified ownership, new drops, and real transaction-aware collection activity."
      hideIntro
    >
      {!isKycVerified(session.user) ? (
        <div className="mb-6">
          <VerificationRequiredCard
            compact
            description="Complete identity verification to unlock deposits and card payments."
            title="Verify your account"
            user={session.user}
          />
        </div>
      ) : null}
      <LiveDashboardOverview
        dashboardStats={dashboardStats}
        initialInventory={inventory}
        initialOrders={dashboardOrders}
        userId={session.userId}
      />
    </DashboardShell>
  );
  });
}
