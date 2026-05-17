import { updateOrderStatusAction } from "@/app/actions/marketplace";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import { getAdminOrders } from "@/lib/db/repository";
import { formatCurrency, formatDisplayDate } from "@/lib/rebohrome-data";

type AdminOrdersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  searchParams,
}: AdminOrdersPageProps) {
  const params = await searchParams;
  const adminOrders = await getAdminOrders();

  return (
    <AdminShell
      active="orders"
      title="Orders Management"
      description="Monitor payment, fulfillment, and customer status from a dedicated operations screen."
    >
      {params.updated === "1" ? (
        <div className="mb-6 rounded-[20px] border border-emerald-300/50 bg-emerald-100/70 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          Order status updated successfully.
        </div>
      ) : null}
      {adminOrders.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-line bg-panel-strong px-6 py-10 text-center">
          <div className="text-lg font-semibold text-foreground">
            No orders yet.
          </div>
          <p className="mt-2 text-sm leading-7 text-muted">
            New purchases will appear here automatically after checkout.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {adminOrders.map((order) => (
            <form
              key={order.id}
              action={updateOrderStatusAction}
              className="grid gap-3 rounded-[24px] border border-line bg-panel-strong px-5 py-5 text-sm text-muted md:grid-cols-[1fr_0.9fr_0.7fr_0.8fr_0.8fr_auto]"
            >
              <input name="orderId" type="hidden" value={order.id} />
              <div>
                <div className="font-semibold text-foreground">{order.id}</div>
                <div className="mt-1 text-xs text-muted">
                  {formatDisplayDate(order.createdAt)}
                </div>
              </div>
              <div>{order.customer}</div>
              <div>{order.itemCount} items</div>
              <div className="text-foreground">
                {formatCurrency(order.total, order.currency)}
              </div>
              <select
                className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                defaultValue={order.status}
                name="status"
              >
                <option value="Pending">Pending</option>
                <option value="Processing">Processing</option>
                <option value="Completed">Completed</option>
                <option value="Declined">Declined</option>
              </select>
              <button
                className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground transition hover:bg-[var(--foreground-soft)]"
                type="submit"
              >
                Save
              </button>
            </form>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
