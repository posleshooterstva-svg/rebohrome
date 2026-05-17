import Link from "next/link";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import { Button } from "@/components/ui/button";
import { getAdminOrders, getAdminStats } from "@/lib/db/repository";
import { formatDisplayDate, formatUsd } from "@/lib/rebohrome-data";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [adminOrders, adminStats] = await Promise.all([
    getAdminOrders(),
    getAdminStats(),
  ]);

  return (
    <AdminShell
      active="overview"
      title="Admin Dashboard"
      description="Operational controls stay in a separate workspace so the public storefront never becomes a control board."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {adminStats.map((stat) => (
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
            <div className="mt-1 text-sm text-emerald-500 dark:text-emerald-300">
              {stat.change}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/admin/upload">Create product</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/admin/products">Manage catalog</Link>
        </Button>
      </div>
      <div className="mt-6 rounded-[24px] border border-line bg-panel-strong p-5">
        <div className="text-lg font-semibold text-foreground">Recent orders</div>
        {adminOrders.length === 0 ? (
          <div className="mt-4 rounded-[20px] border border-dashed border-line bg-panel px-4 py-5 text-sm text-muted">
            Orders will appear here as soon as checkout creates real records.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {adminOrders.slice(0, 6).map((order) => (
              <div
                key={order.id}
                className="grid gap-2 rounded-[20px] border border-line bg-panel px-4 py-4 text-sm text-muted md:grid-cols-[1fr_0.9fr_0.7fr_0.7fr_0.7fr]"
              >
                <div>{order.id}</div>
                <div>{order.customer}</div>
                <div>{formatDisplayDate(order.createdAt)}</div>
                <div className="text-foreground">{formatUsd(order.total)}</div>
                <div
                  className={
                    order.status === "Completed"
                      ? "text-emerald-500 dark:text-emerald-300"
                      : order.status === "Processing"
                        ? "text-amber-500 dark:text-amber-300"
                        : order.status === "Declined"
                          ? "text-rose-500 dark:text-rose-300"
                          : "text-sky-500 dark:text-sky-300"
                  }
                >
                  {order.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
