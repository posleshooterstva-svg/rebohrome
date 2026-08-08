import { redirect } from "next/navigation";
import { WertGateCheckoutClient } from "@/components/payment/wert-gate-checkout-client";
import { getWertGateCheckoutSession } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

type WertGateCheckoutPageProps = {
  params: Promise<{
    sessionId: string;
  }>;
};

export default async function WertGateCheckoutPage({
  params,
}: WertGateCheckoutPageProps) {
  const session = await getSessionState();

  if (!session.userId) {
    redirect("/login");
  }

  const { sessionId } = await params;
  const checkout = await getWertGateCheckoutSession({
    userId: session.userId,
    sessionId,
  });

  if (!checkout) {
    redirect("/dashboard/deposit");
  }

  return (
    <WertGateCheckoutClient
      contractAddress={checkout.contractAddress}
      contractOrderId={checkout.contractOrderId}
      recipientWallet={checkout.recipientWallet}
      sessionId={checkout.session.id}
      widgetOptions={checkout.widgetOptions}
    />
  );
}
