import { CheckoutPageClient } from "@/components/cart/checkout-page-client";
import { ActivePaymentSessionCard } from "@/components/payment/active-payment-session-card";
import {
  getBalanceByUserId,
  getActivePaymentSession,
  getMarketplaceProducts,
  getUserById,
} from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const session = await requireUserSession("/login?redirectTo=/checkout");
  const [products, user, balance, activePaymentSession] = await Promise.all([
    getMarketplaceProducts({ sort: "title-asc" }),
    getUserById(session.userId),
    getBalanceByUserId(session.userId),
    getActivePaymentSession(session.userId, "purchase"),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-5">
        {activePaymentSession ? (
          <ActivePaymentSessionCard session={activePaymentSession} />
        ) : null}
        <CheckoutPageClient
          availableBalance={balance?.available ?? 0}
          defaultEmail={user?.email ?? "collector@rebohrome.com"}
          defaultName={user?.name ?? user?.username ?? "Collector"}
          products={products}
          userId={session.userId}
        />
      </div>
    </main>
  );
}
