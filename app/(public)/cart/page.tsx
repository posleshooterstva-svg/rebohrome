import { CartPageClient } from "@/components/cart/cart-page-client";
import { getMarketplaceProducts } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const products = await getMarketplaceProducts({ sort: "title-asc" });

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <CartPageClient products={products} />
    </main>
  );
}
