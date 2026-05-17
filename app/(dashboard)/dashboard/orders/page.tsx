import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import { getUserOrders } from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";
import { formatDisplayDate, formatUsd } from "@/lib/rebohrome-data";

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
      {dashboardOrders.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-line bg-panel-strong px-6 py-10 text-center">
          <div className="text-lg font-semibold text-foreground">
            No orders yet.
          </div>
          <p className="mt-2 text-sm leading-7 text-muted">
            No orders yet. Explore the marketplace to begin your collection.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {dashboardOrders.map((order) => (
            <div
              key={order.id}
              className="grid gap-3 rounded-[24px] border border-line bg-panel-strong px-5 py-5 text-sm text-muted md:grid-cols-[1fr_0.9fr_0.6fr_0.6fr_0.7fr]"
            >
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Order ID
                </div>
                <div className="mt-2 text-base font-semibold text-foreground">
                  {order.id}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Placed
                </div>
                <div className="mt-2 text-base text-foreground">
                  {formatDisplayDate(order.createdAt)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Items
                </div>
                <div className="mt-2 text-base text-foreground">{order.itemCount}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Total
                </div>
                <div className="mt-2 text-base font-semibold text-foreground">
                  {formatUsd(order.total)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Status
                </div>
                <div
                  className={`mt-2 text-base ${
                    order.status === "Completed"
                      ? "text-emerald-500 dark:text-emerald-300"
                      : order.status === "Processing"
                        ? "text-amber-500 dark:text-amber-300"
                        : order.status === "Declined"
                          ? "text-rose-500 dark:text-rose-300"
                          : "text-sky-500 dark:text-sky-300"
                  }`}
                >
                  {order.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
