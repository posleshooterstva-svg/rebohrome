import { Search } from "lucide-react";
import { ArchiveSidebar } from "@/components/rebohrome/archive-sidebar";
import { ArchiveSurfaceLayout } from "@/components/rebohrome/archive-surface-layout";
import { CollectorRail } from "@/components/rebohrome/collector-rail";
import { MarketCard } from "@/components/rebohrome/market-card";
import { Button } from "@/components/ui/button";
import {
  getFinancialOverview,
  getHeaderAccount,
  getMarketplaceFacets,
  getMarketplaceProducts,
  getUserById,
} from "@/lib/db/repository";
import {
  formatCurrency,
  formatUsd,
} from "@/lib/rebohrome-data";
import { getSessionState } from "@/lib/session";

type MarketplacePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getSingleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function MarketplacePage({
  searchParams,
}: MarketplacePageProps) {
  const params = await searchParams;
  const filters = {
    search: getSingleValue(params.search),
    rarity: getSingleValue(params.rarity),
    collection: getSingleValue(params.collection),
    sort: getSingleValue(params.sort) || "newest",
  };

  const session = await getSessionState();
  const isAuthenticated = Boolean(session.userId && session.isUserAuthenticated);

  const [products, facets, account, financialOverview, user] = await Promise.all([
    getMarketplaceProducts(filters),
    getMarketplaceFacets(),
    isAuthenticated && session.userId
      ? getHeaderAccount(session.userId)
      : Promise.resolve(null),
    isAuthenticated && session.userId
      ? getFinancialOverview(session.userId)
      : Promise.resolve(null),
    isAuthenticated && session.userId
      ? getUserById(session.userId)
      : Promise.resolve(null),
  ]);

  const activityItems =
    isAuthenticated && financialOverview
      ? financialOverview.recentTransactions.slice(0, 4).map((transaction) => ({
          id: transaction.id,
          title:
            transaction.kind === "deposit"
              ? "Deposit"
              : transaction.kind === "purchase"
                ? "Purchase"
                : transaction.kind === "withdrawal"
                  ? "Withdrawal Request"
                  : "Archive Activity",
          meta: transaction.summary,
          amount: `${transaction.amount >= 0 ? "+" : ""}${formatCurrency(
            transaction.amount,
            transaction.displayCurrency ?? "USD",
          )}`,
          tone:
            transaction.amount > 0
              ? ("positive" as const)
              : transaction.amount < 0
                ? ("negative" as const)
                : ("neutral" as const),
        }))
      : products.slice(0, 4).map((product) => ({
          id: product.id,
          title: product.title,
          meta: `${product.collection} / ${product.rarity}`,
          amount: formatUsd(product.price),
          tone: "neutral" as const,
        }));

  const securityItems = isAuthenticated
    ? [
        {
          id: "verification",
          label: "Verification",
          status: user?.verified ? "Verified" : "Pending",
          tone: user?.verified ? ("positive" as const) : ("warning" as const),
        },
        {
          id: "telegram",
          label: "Telegram",
          status: user?.telegramUsername || "Missing",
          tone: user?.telegramUsername ? ("positive" as const) : ("warning" as const),
        },
        {
          id: "wallet",
          label: "Withdrawal Wallet",
          status: user?.withdrawalWallet ? "Connected" : "Missing",
          tone: user?.withdrawalWallet ? ("positive" as const) : ("warning" as const),
        },
        {
          id: "payments",
          label: "Encrypted Checkout",
          status: "Active",
          tone: "positive" as const,
        },
      ]
    : [
        {
          id: "verified-marketplace",
          label: "Verified Marketplace",
          status: "Active",
          tone: "positive" as const,
        },
        {
          id: "digital-delivery",
          label: "Instant Delivery",
          status: "Ready",
          tone: "positive" as const,
        },
        {
          id: "withdraw-review",
          label: "Withdrawal Review",
          status: "Manual",
          tone: "neutral" as const,
        },
      ];

  const hasFilters = Boolean(
    filters.search || filters.rarity || filters.collection || filters.sort !== "newest",
  );

  return (
    <main className="mx-auto w-full max-w-[1540px] px-4 py-6 sm:px-6 lg:px-8">
      <ArchiveSurfaceLayout
        rightRail={
          <CollectorRail
            activityItems={activityItems}
            balanceNote={
              isAuthenticated
                ? "Archive funds stay available for purchases, deposits, and manual withdrawals."
                : "Sign in to unlock your wallet, balance history, and collector activity."
            }
            emptyActivity="Recent checkout activity appears here once your account begins collecting."
            initialBalance={{
              available: account?.balance.available ?? 0,
              pendingWithdrawal: account?.balance.pendingWithdrawal ?? 0,
              totalDeposited: account?.balance.totalDeposited ?? 0,
              totalSpent: account?.balance.totalSpent ?? 0,
              totalWithdrawn: account?.balance.totalWithdrawn ?? 0,
            }}
            primaryActionHref={
              isAuthenticated ? "/dashboard/deposit" : "/login?redirectTo=/dashboard/deposit"
            }
            primaryActionLabel="Deposit"
            secondaryActionHref={isAuthenticated ? "/withdraw" : "/login?redirectTo=/withdraw"}
            secondaryActionLabel="Withdraw"
            securityItems={securityItems}
            userId={account?.user.id ?? null}
          />
        }
        sidebar={
          <ArchiveSidebar
            account={account}
            active="marketplace"
            mode="public"
          />
        }
      >
        <div className="p-6 sm:p-8">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">
              Archive Marketplace
            </div>
            <h1 className="mt-3 display-font text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
              Marketplace
            </h1>
            <p className="mt-3 text-sm leading-7 text-muted">
              Browse collectible releases, refine the archive by rarity or collection, and move directly into purchase flow.
            </p>
          </div>

          <form className="mt-8 grid gap-3 xl:grid-cols-[1.45fr_0.9fr_0.9fr_0.9fr_auto_auto]" method="get">
            <div className="flex min-w-[240px] items-center gap-2 rounded-[10px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-muted">
              <Search className="size-4" />
              <input
                className="w-full bg-transparent text-foreground outline-none placeholder:text-muted"
                defaultValue={filters.search}
                name="search"
                placeholder="Search archive..."
              />
            </div>
            <select
              className="rounded-[10px] border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
              defaultValue={filters.rarity}
              name="rarity"
            >
              <option value="">All rarities</option>
              {facets.rarities.map((rarity) => (
                <option key={rarity} value={rarity}>
                  {rarity}
                </option>
              ))}
            </select>
            <select
              className="rounded-[10px] border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
              defaultValue={filters.collection}
              name="collection"
            >
              <option value="">All collections</option>
              {facets.collections.map((collection) => (
                <option key={collection} value={collection}>
                  {collection}
                </option>
              ))}
            </select>
            <select
              className="rounded-[10px] border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
              defaultValue={filters.sort}
              name="sort"
            >
              <option value="newest">Newest</option>
              <option value="price-asc">Price: Low to high</option>
              <option value="price-desc">Price: High to low</option>
              <option value="stock-desc">Stock</option>
              <option value="title-asc">Title</option>
            </select>
            <Button type="submit">Apply</Button>
            {hasFilters ? (
              <Button type="button" variant="secondary" asChild>
                <a href="/marketplace">Reset</a>
              </Button>
            ) : null}
          </form>

          <div className="mt-5 border-y border-line py-4 text-sm text-muted">
            {products.length} collectible cards available in the archive
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {products.length > 0 ? (
              products.map((card) => <MarketCard key={card.id} card={card} />)
            ) : (
              <div className="col-span-full rounded-[14px] border border-dashed border-line bg-[var(--background-soft)] px-6 py-12 text-center">
                <div className="text-lg font-semibold text-foreground">
                  No cards matched these filters.
                </div>
                <p className="mt-2 text-sm leading-7 text-muted">
                  Reset your filters or browse another collection from the archive.
                </p>
              </div>
            )}
          </div>
        </div>
      </ArchiveSurfaceLayout>
    </main>
  );
}
