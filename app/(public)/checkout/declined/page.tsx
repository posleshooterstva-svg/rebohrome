import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { Button } from "@/components/ui/button";
import { getOrderById } from "@/lib/db/repository";
import {
  formatCurrency,
  formatDisplayDateTime,
} from "@/lib/rebohrome-data";
import { requireUserSession } from "@/lib/session";

type DeclinedPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getOrderParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function DeclinedPage({
  searchParams,
}: DeclinedPageProps) {
  const params = await searchParams;
  const orderId = getOrderParam(params.order);
  const session = await requireUserSession("/login");
  const orderBundle = orderId ? await getOrderById(orderId, session.userId) : null;

  if (!orderBundle || orderBundle.order.paymentState !== "failed") {
    return (
      <main className="mx-auto flex w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="w-full rounded-[34px] border border-line bg-panel px-6 py-10 text-center shadow-panel sm:px-8">
          <h1 className="display-font text-4xl font-semibold tracking-[-0.04em] text-foreground">
            Failed receipt not found.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
            Open this page from a declined checkout attempt to review the failed transaction.
          </p>
          <div className="mt-8">
            <Button asChild>
              <Link href="/checkout">Return to checkout</Link>
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
      : "N/A";
  const paymentReference =
    typeof orderBundle.transactionMeta?.paymentReference === "string"
      ? orderBundle.transactionMeta.paymentReference
      : "N/A";

  return (
    <main className="mx-auto flex w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="w-full rounded-[34px] border border-line bg-panel px-6 py-10 shadow-panel sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          <div className="flex size-20 items-center justify-center rounded-full border border-rose-300/60 bg-rose-100/70 text-rose-500 shadow-[0_0_70px_rgba(244,114,182,0.14)] dark:border-rose-400/20 dark:bg-rose-500/8 dark:text-rose-300">
            <AlertCircle className="size-10" />
          </div>
          <p className="mt-6 text-xs uppercase tracking-[0.3em] text-rose-500 dark:text-rose-300">
            Payment Failed
          </p>
          <h1 className="mt-3 display-font text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
            Payment Declined.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
            Your transaction could not be completed. No charges were applied. Please verify your payment information or add more balance before retrying.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-6 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="rounded-[28px] border border-line bg-panel-strong p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-muted">
              Attempted Cards
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
              Failed Receipt
            </div>
            <div className="mt-5 space-y-3 text-sm text-muted">
              <Row label="Failed Order ID" value={order.id} />
              <Row label="Transaction ID" value={orderBundle.transaction?.id ?? "N/A"} />
              <Row label="Payment State" value={order.paymentState} />
              <Row label="Method" value={order.paymentMethod} />
              <Row label="Provider" value={provider} />
              <Row label="Reference" value={paymentReference} />
              <Row
                label="Attempted Total"
                value={formatCurrency(order.total, order.currency)}
              />
              <Row label="Reason" value={order.failureReason ?? "Declined"} />
              <Row label="Created" value={formatDisplayDateTime(order.createdAt)} />
            </div>

            <div className="mt-8 flex flex-col gap-3">
              <Button asChild>
                <Link href="/checkout">Retry Payment</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/cart">Return to Cart</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/dashboard/deposit">Add Balance</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/contact">Contact Support</Link>
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
