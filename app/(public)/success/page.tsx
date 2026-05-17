import Link from "next/link";
import { Check } from "lucide-react";
import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { Button } from "@/components/ui/button";
import { getOrderById } from "@/lib/db/repository";
import {
  formatCurrency,
  formatDisplayDateTime,
  formatUsd,
} from "@/lib/rebohrome-data";
import { requireUserSession } from "@/lib/session";

type SuccessPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getOrderParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function SuccessPage({ searchParams }: SuccessPageProps) {
  const params = await searchParams;
  const orderId = getOrderParam(params.order);
  const session = await requireUserSession("/login");
  const orderBundle = orderId ? await getOrderById(orderId, session.userId) : null;

  if (!orderBundle || orderBundle.order.paymentState !== "completed") {
    return (
      <main className="mx-auto flex w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="w-full rounded-[34px] border border-line bg-panel px-6 py-10 text-center shadow-panel sm:px-8">
          <h1 className="display-font text-4xl font-semibold tracking-[-0.04em] text-foreground">
            Order not found.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
            Open this page from a completed checkout to inspect a real order receipt.
          </p>
          <div className="mt-8">
            <Button asChild>
              <Link href="/marketplace">Return to marketplace</Link>
            </Button>
          </div>
        </section>
      </main>
    );
  }

  const { order, items } = orderBundle;
  const provider =
    typeof orderBundle.transactionMeta?.provider === "string"
      ? orderBundle.transactionMeta.provider
      : "Archive Wallet";
  const paymentReference =
    typeof orderBundle.transactionMeta?.paymentReference === "string"
      ? orderBundle.transactionMeta.paymentReference
      : "Secure payment session";
  const telegramUsername =
    typeof orderBundle.transactionMeta?.telegramUsername === "string"
      ? orderBundle.transactionMeta.telegramUsername
      : "N/A";

  return (
    <main className="mx-auto flex w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="w-full rounded-[34px] border border-line bg-panel px-6 py-10 shadow-panel sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          <div className="flex size-20 items-center justify-center rounded-full border border-emerald-300/60 bg-emerald-100/70 text-emerald-500 shadow-[0_0_70px_rgba(52,211,153,0.18)] dark:border-emerald-400/20 dark:bg-emerald-500/8 dark:text-emerald-300">
            <Check className="size-10" />
          </div>
          <p className="mt-6 text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
            Archive Completed
          </p>
          <h1 className="mt-3 display-font text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
            Card Archived.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
            Your collectible has been securely added to your galactic vault. Balance,
            ownership, and order history were updated in one completed transaction.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-6 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="rounded-[28px] border border-line bg-panel-strong p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-muted">
              Purchased Cards
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="rounded-[24px] border border-line bg-panel p-3"
                >
                  <CardArtwork
                    card={item.product}
                    className="aspect-[4/5] w-full"
                    compact
                  />
                  <div className="mt-3 text-sm font-semibold text-foreground">
                    {item.product.title}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    Qty {item.quantity} · {item.product.rarity}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-line bg-panel-strong p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-muted">
              Receipt
            </div>
            <div className="mt-5 space-y-3 text-sm text-muted">
              <Row label="Order ID" value={order.id} />
              <Row label="Transaction ID" value={orderBundle.transaction?.id ?? "N/A"} />
              <Row label="Transaction Status" value={order.status} />
              <Row label="Payment" value={order.paymentMethod} />
              <Row label="Provider" value={provider} />
              <Row label="Payment Reference" value={paymentReference} />
              <Row label="Telegram" value={telegramUsername} />
              <Row label="Placed" value={formatDisplayDateTime(order.createdAt)} />
              <Row label="Currency" value={order.currency} />
              <Row label="Subtotal" value={formatCurrency(order.subtotal, order.currency)} />
              <Row label="Shipping" value={formatCurrency(order.shipping, order.currency)} />
              <Row label="Total" value={formatCurrency(order.total, order.currency)} />
              <Row
                label="Remaining Balance"
                value={formatUsd(order.remainingBalance ?? 0)}
              />
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/dashboard/collection">Open my collection</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/dashboard/orders">View orders</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-line bg-panel px-4 py-3">
      <span>{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
