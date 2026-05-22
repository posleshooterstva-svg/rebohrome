import { PaymentStatusRedirect } from "@/components/payment/payment-status-redirect";

type PaymentReturnPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getQueryValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({
  searchParams,
}: PaymentReturnPageProps) {
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
      description="We are checking the latest provider status and routing you to the correct payment result."
      fallbackHref="/dashboard"
      fallbackLabel="Open dashboard"
      title="Checking payment status"
      tx={tx}
    />
  );
}
