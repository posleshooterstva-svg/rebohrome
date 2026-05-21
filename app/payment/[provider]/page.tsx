import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCheckoutPaymentSessionBundle } from "@/lib/db/repository";
import { paymentProviderSlugMap, type PaymentProviderSlug } from "@/lib/rebohrome-data";
import { requireUserSession } from "@/lib/session";

type PaymentPageProps = {
  params: Promise<{
    provider: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getQueryValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export const dynamic = "force-dynamic";

export default async function PaymentProviderPage({
  params,
  searchParams,
}: PaymentPageProps) {
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
    `/login?redirectTo=/payment/${providerSlug}?session=${sessionId}`,
  );
  const paymentBundle = await getCheckoutPaymentSessionBundle(sessionId, session.userId);

  if (!paymentBundle || paymentBundle.session.paymentProvider !== providerName) {
    notFound();
  }

  if (
    ["pending", "attempting", "processing"].includes(paymentBundle.session.status) &&
    paymentBundle.session.paymentUrl
  ) {
    redirect(paymentBundle.session.paymentUrl);
  }

  if (paymentBundle.session.status !== "completed") {
    return (
      <main className="min-h-screen bg-[#f3f4f8] px-4 py-10 sm:px-6 lg:px-8">
        <section className="mx-auto w-full max-w-3xl rounded-[20px] border border-line bg-white px-6 py-10 shadow-panel sm:px-8">
          <div className="text-xs uppercase tracking-[0.3em] text-muted">
            Secure payment session
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-foreground">
            This payment session is no longer active.
          </h1>
          <p className="mt-4 text-sm leading-7 text-muted">
            Return to checkout to create a new secure provider session, or open the
            matching receipt if this order already completed.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/checkout">Return to checkout</Link>
            </Button>
            {paymentBundle.session.orderId ? (
              <Button asChild variant="secondary">
                <Link
                  href={
                    paymentBundle.session.status === "failed"
                      ? `/checkout/declined?order=${paymentBundle.session.orderId}`
                      : `/checkout?pending=${paymentBundle.session.orderId}`
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

  redirect(`/success?order=${encodeURIComponent(paymentBundle.session.orderId ?? "")}`);
}
