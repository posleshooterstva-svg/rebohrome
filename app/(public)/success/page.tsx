import Link from "next/link";
import { OrderSuccessView } from "@/components/rebohrome/order-success-view";
import { Button } from "@/components/ui/button";
import { getOrderById } from "@/lib/db/repository";
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
      : "Internal Wallet";
  const paymentReference =
    orderBundle.transaction?.transvoucherReferenceId ||
    (typeof orderBundle.transactionMeta?.paymentReference === "string"
      ? orderBundle.transactionMeta.paymentReference
      : null) ||
    orderBundle.transaction?.referenceId ||
    "Secure payment session";

  return (
    <OrderSuccessView
      createdAt={order.createdAt}
      currency={order.currency}
      items={items.map((item) => ({
        product: item.product,
        quantity: item.quantity,
      }))}
      orderId={order.id}
      paymentMethod={order.paymentMethod}
      paymentReference={paymentReference}
      provider={provider}
      providerReferenceId={orderBundle.transaction?.transvoucherReferenceId ?? null}
      providerTransactionId={orderBundle.transaction?.transvoucherTransactionId ?? null}
      remainingBalance={order.remainingBalance}
      total={order.total}
      transactionId={orderBundle.transaction?.id ?? null}
      userId={session.userId}
    />
  );
}
