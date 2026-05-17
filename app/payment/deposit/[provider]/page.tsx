import Link from "next/link";
import { notFound } from "next/navigation";
import { DepositHostedPageClient } from "@/components/payment/deposit-hosted-page-client";
import { Button } from "@/components/ui/button";
import {
  getBalanceByUserId,
  getDepositPaymentSessionBundle,
} from "@/lib/db/repository";
import { paymentProviderSlugMap, type PaymentProviderSlug } from "@/lib/rebohrome-data";
import { requireUserSession } from "@/lib/session";

type DepositPaymentPageProps = {
  params: Promise<{
    provider: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getQueryValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export const dynamic = "force-dynamic";

export default async function DepositPaymentProviderPage({
  params,
  searchParams,
}: DepositPaymentPageProps) {
  const routeParams = await params;
  const query = await searchParams;
  const providerSlug = routeParams.provider as PaymentProviderSlug;
  const providerName = paymentProviderSlugMap[providerSlug];

  if (!providerName || providerName === "Internal Wallet") {
    notFound();
  }

  const sessionId = getQueryValue(query.session);
  if (!sessionId) {
    notFound();
  }

  const session = await requireUserSession(
    `/login?redirectTo=/payment/deposit/${providerSlug}?session=${sessionId}`,
  );
  const [paymentBundle, balance] = await Promise.all([
    getDepositPaymentSessionBundle(sessionId, session.userId),
    getBalanceByUserId(session.userId),
  ]);

  if (!paymentBundle || paymentBundle.session.paymentProvider !== providerName) {
    notFound();
  }

  if (paymentBundle.session.status !== "pending") {
    return (
      <main className="min-h-screen bg-[#f3f4f8] px-4 py-10 sm:px-6 lg:px-8">
        <section className="mx-auto w-full max-w-3xl rounded-[20px] border border-line bg-white px-6 py-10 shadow-panel sm:px-8">
          <div className="text-xs uppercase tracking-[0.3em] text-muted">
            Secure deposit session
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-foreground">
            This deposit session is no longer active.
          </h1>
          <p className="mt-4 text-sm leading-7 text-muted">
            Return to the deposit workspace to create a new provider session or review
            the linked receipt if this payment already completed.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/dashboard/deposit">Return to deposit</Link>
            </Button>
            {paymentBundle.session.depositId ? (
              <Button asChild variant="secondary">
                <Link
                  href={
                    paymentBundle.session.status === "completed"
                      ? `/dashboard/deposit?receipt=${paymentBundle.session.depositId}`
                      : `/dashboard/deposit?failed=${paymentBundle.session.depositId}`
                  }
                >
                  Open receipt
                </Link>
              </Button>
            ) : null}
          </div>
        </section>
      </main>
    );
  }

  return (
    <DepositHostedPageClient
      creditedAmountUsd={paymentBundle.session.creditedAmountUsd}
      currency={paymentBundle.session.currency}
      currentBalance={balance?.available ?? 0}
      exchangeRate={paymentBundle.session.exchangeRate}
      originalAmount={paymentBundle.session.originalAmount}
      paymentMethod={paymentBundle.session.paymentMethod}
      provider={paymentBundle.session.paymentProvider}
      sessionId={paymentBundle.session.id}
    />
  );
}
