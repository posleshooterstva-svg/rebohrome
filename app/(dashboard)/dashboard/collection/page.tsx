import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { RarityBadge } from "@/components/rebohrome/rarity-badge";
import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import { getDashboardStats, getUserInventory } from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";
import { formatDisplayDate } from "@/lib/rebohrome-data";

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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {dashboardStats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[24px] border border-line bg-panel-strong px-5 py-5"
          >
            <div className="text-xs uppercase tracking-[0.24em] text-muted">
              {stat.label}
            </div>
            <div className="mt-2 text-3xl font-semibold text-foreground">
              {stat.value}
            </div>
          </div>
        ))}
      </div>
      {inventory.length === 0 ? (
        <div className="mt-6 rounded-[24px] border border-dashed border-line bg-panel-strong px-6 py-10 text-center">
          <div className="text-lg font-semibold text-foreground">
            Your vault is empty.
          </div>
          <p className="mt-2 text-sm leading-7 text-muted">
            Purchased cards move here automatically after a successful checkout.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {inventory.map((entry) => (
            <article
              key={entry.inventoryId}
              className="rounded-[24px] border border-line bg-panel-strong p-4"
            >
              <CardArtwork
                card={entry.product}
                className="aspect-[4/5] w-full"
                compact
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {entry.product.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {entry.product.collection}
                  </p>
                </div>
                <RarityBadge rarity={entry.product.rarity} />
              </div>
                <div className="mt-4 grid gap-2 text-sm text-muted">
                  <div>Owned since {formatDisplayDate(entry.acquiredAt)}</div>
                  <div>Quantity {entry.quantity}</div>
                  <div>Edition {entry.product.edition}</div>
                  <div>{entry.product.category}</div>
                </div>
            </article>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
