import { LiveCollectionView } from "@/components/dashboard/live-collection-view";
import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import { getDashboardStats, getUserInventory } from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardCollectionPage() {
  const session = await requireUserSession("/login");
  const [dashboardStats, inventory] = await Promise.all([
    getDashboardStats(session.userId),
    getUserInventory(session.userId),
  ]);

  return (
    <DashboardShell
      active="collection"
      title="Owned Collection"
      description="Every purchased card lives here in a dedicated vault view, isolated from browsing and checkout."
    >
      <LiveCollectionView
        dashboardStats={dashboardStats}
        initialInventory={inventory}
        userId={session.userId}
      />
    </DashboardShell>
  );
}
