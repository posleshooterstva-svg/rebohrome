import { LiveDashboardOverview } from "@/components/dashboard/live-dashboard-overview";
import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import {
  getDashboardStats,
  getMarketplaceProducts,
  getUserInventory,
  getUserOrders,
} from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireUserSession("/login");
  const [dashboardStats, dashboardOrders, inventory, latestProducts] = await Promise.all([
    getDashboardStats(session.userId),
    getUserOrders(session.userId),
    getUserInventory(session.userId),
    getMarketplaceProducts({ sort: "newest" }),
  ]);

  return (
    <DashboardShell
      active="dashboard"
      title="Collector Dashboard"
      description="Your private product surface for archive balance, verified ownership, new drops, and real transaction-aware collection activity."
      hideIntro
    >
      <LiveDashboardOverview
        dashboardStats={dashboardStats}
        initialInventory={inventory}
        initialOrders={dashboardOrders}
        latestProducts={latestProducts}
        userId={session.userId}
      />
    </DashboardShell>
  );
}
