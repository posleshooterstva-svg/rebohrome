import { CheckoutPageClient } from "@/components/cart/checkout-page-client";
import {
  getBalanceByUserId,
  getMarketplaceProducts,
  getUserById,
} from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const session = await requireUserSession("/login?redirectTo=/checkout");
  const [products, user, balance] = await Promise.all([
    getMarketplaceProducts({ sort: "title-asc" }),
    getUserById(session.userId),
    getBalanceByUserId(session.userId),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <CheckoutPageClient
        availableBalance={balance?.available ?? 0}
        defaultEmail={user?.email ?? "collector@rebohrome.com"}
        defaultName={user?.name ?? user?.username ?? "Collector"}
        products={products}
        userId={session.userId}
      />
    </main>
  );
}
