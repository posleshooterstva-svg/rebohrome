import Link from "next/link";
import { PaymentStatusRefreshButton } from "@/components/payment/payment-status-refresh-button";
import { getTransactionById } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

type PaymentDeclinedPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getQueryValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export const dynamic = "force-dynamic";

export default async function PaymentDeclinedPage({
  searchParams,
}: PaymentDeclinedPageProps) {
  const params = await searchParams;
  const tx = getQueryValue(params.tx);
  const session = await getSessionState();
  const transaction =
    tx && session.userId ? await getTransactionById(tx, session.userId) : null;

  const isFailed = transaction?.status === "failed";
  const isPending = Boolean(transaction) && !isFailed && transaction?.status !== "completed";

  return (
    <main className="mx-auto flex min-h-[72vh] w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-3xl rounded-[34px] border border-line bg-panel px-6 py-10 text-center shadow-panel sm:px-8">
        <p className="text-xs uppercase tracking-[0.32em] text-[var(--accent)]">
          Payment Status
        </p>
        <h1 className="mt-5 display-font text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
          {isFailed
            ? "Payment declined."
            : isPending
              ? "Payment status pending."
              : tx
                ? "Payment lookup unavailable."
                : "Missing payment reference."}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
          {isFailed
            ? "This transaction is marked as failed. No archive items were assigned and no balance changes were finalized."
            : isPending
              ? "We have not finalized this payment yet. Refresh the payment status after a few moments if the provider has already shown a result."
              : tx
                ? "We could not load a finalized payment record for this reference. You can return to checkout or sign in and refresh the status safely."
                : "Open this page from a failed or canceled payment attempt to review the payment state."}
        </p>

        {tx ? (
          <div className="mx-auto mt-8 max-w-xl rounded-[24px] border border-line bg-panel-strong px-5 py-4 text-left">
            <div className="grid gap-3 text-sm text-muted sm:grid-cols-[1fr_auto]">
              <span>Transaction ID</span>
              <span className="font-medium text-foreground">{tx}</span>
              <span>Current status</span>
              <span className="font-medium uppercase text-foreground">
                {transaction?.status ?? "unknown"}
              </span>
              <span>Payment kind</span>
              <span className="font-medium text-foreground">
                {transaction?.kind ?? "unavailable"}
              </span>
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col items-center gap-3">
          {tx ? <PaymentStatusRefreshButton tx={tx} /> : null}
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              className="inline-flex min-w-[220px] items-center justify-center rounded-2xl border border-line bg-panel px-5 py-3 text-sm font-medium text-foreground transition hover:bg-[var(--foreground-soft)]"
              href="/checkout"
            >
              Return to checkout
            </Link>
            <Link
              className="inline-flex min-w-[220px] items-center justify-center rounded-2xl border border-line bg-panel px-5 py-3 text-sm font-medium text-foreground transition hover:bg-[var(--foreground-soft)]"
              href={session.userId ? "/dashboard" : "/marketplace"}
            >
              {session.userId ? "Open dashboard" : "Return to marketplace"}
            </Link>
            {!session.userId ? (
              <Link
                className="inline-flex min-w-[220px] items-center justify-center rounded-2xl border border-line bg-panel px-5 py-3 text-sm font-medium text-foreground transition hover:bg-[var(--foreground-soft)]"
                href={tx ? `/login?redirectTo=/payment/declined?tx=${encodeURIComponent(tx)}` : "/login"}
              >
                Sign in to check status
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
