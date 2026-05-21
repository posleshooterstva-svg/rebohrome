import { LiveOrdersView } from "@/components/dashboard/live-orders-view";
import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import { getUserOrders } from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardOrdersPage() {
  const session = await requireUserSession("/login");
  const dashboardOrders = await getUserOrders(session.userId);

  return (
    <DashboardShell
      active="orders"
      title="Order History"
      description="Track every completed order, delivery state, and collectible purchase from one private archive view."
    >
      <LiveOrdersView initialOrders={dashboardOrders} userId={session.userId} />
    </DashboardShell>
  );
}
