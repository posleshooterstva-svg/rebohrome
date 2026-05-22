import { PaymentStatusRedirect } from "@/components/payment/payment-status-redirect";

type PaymentSuccessRedirectPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getQueryValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export const dynamic = "force-dynamic";

export default async function PaymentSuccessRedirectPage({
  searchParams,
}: PaymentSuccessRedirectPageProps) {
  const params = await searchParams;
  const tx = getQueryValue(params.tx);

  if (!tx) {
    return (
      <PaymentStatusRedirect
        description="We could not verify a payment reference from this return URL."
        fallbackHref="/checkout"
        fallbackLabel="Return to checkout"
        title="Payment reference missing."
        tx=""
      />
    );
  }

  return (
    <PaymentStatusRedirect
      description="We are verifying the payment result and preparing your archive receipt."
      fallbackHref="/dashboard"
      fallbackLabel="Open dashboard"
      title="Finalizing secure payment"
      tx={tx}
    />
  );
}
