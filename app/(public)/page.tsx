import Link from "next/link";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { ArchiveSidebar } from "@/components/rebohrome/archive-sidebar";
import { ArchiveSurfaceLayout } from "@/components/rebohrome/archive-surface-layout";
import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { CollectorRail } from "@/components/rebohrome/collector-rail";
import { RarityBadge } from "@/components/rebohrome/rarity-badge";
import { Button } from "@/components/ui/button";
import {
  getFinancialOverview,
  getHeaderAccount,
  getMarketplaceProducts,
  getUserById,
  getUserInventory,
  getUserOrders,
} from "@/lib/db/repository";
import {
  formatCurrency,
  formatUsd,
} from "@/lib/rebohrome-data";
import { getSessionState } from "@/lib/session";

export const dynamic = "force-dynamic";

function formatMemberSince(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function HomePage() {
  const session = await getSessionState();
  const isAuthenticated = Boolean(session.userId && session.isUserAuthenticated);

  const [
    account,
    financialOverview,
    user,
    inventory,
    orders,
    latestProducts,
  ] = await Promise.all([
    isAuthenticated && session.userId
      ? getHeaderAccount(session.userId)
      : Promise.resolve(null),
    isAuthenticated && session.userId
      ? getFinancialOverview(session.userId)
      : Promise.resolve(null),
    isAuthenticated && session.userId
      ? getUserById(session.userId)
      : Promise.resolve(null),
    isAuthenticated && session.userId
      ? getUserInventory(session.userId)
      : Promise.resolve([]),
    isAuthenticated && session.userId
      ? getUserOrders(session.userId)
      : Promise.resolve([]),
    getMarketplaceProducts({ sort: "newest" }),
  ]);

  const heroCard = latestProducts[0] ?? null;
  const newDropCards = latestProducts.slice(0, 4);

  if (!heroCard) {
    return (
      <main className="mx-auto w-full max-w-[1540px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[16px] border border-line bg-panel px-6 py-10 text-center shadow-panel">
          <h1 className="display-font text-4xl font-semibold tracking-[-0.04em] text-foreground">
            The archive is preparing its first drop.
          </h1>
          <p className="mt-4 text-sm leading-7 text-muted">
            Product inventory will appear here as soon as the first release is published.
          </p>
        </div>
      </main>
    );
  }

  const totalCollectionValue = inventory.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );
  const cardsOwned = inventory.reduce((sum, item) => sum + item.quantity, 0);
  const guestCollections = new Set(latestProducts.map((product) => product.collection)).size;
  const guestStock = latestProducts.reduce((sum, product) => sum + product.stock, 0);

  const workspaceStats = isAuthenticated
    ? [
        { label: "Total Collection Value", value: formatUsd(totalCollectionValue) },
        { label: "Cards Owned", value: `${cardsOwned}` },
        { label: "Total Orders", value: `${orders.length}` },
        { label: "Vault Items", value: `${cardsOwned}` },
        { label: "Member Since", value: user ? formatMemberSince(user.createdAt) : "Private" },
      ]
    : [
        { label: "Live Products", value: `${latestProducts.length}` },
        { label: "Collections", value: `${guestCollections}` },
        { label: "Archive Stock", value: `${guestStock}` },
        { label: "Featured Drops", value: `${newDropCards.length}` },
        { label: "Delivery", value: "Instant" },
      ];

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
      : newDropCards.map((card) => ({
          id: card.id,
          title: card.title,
          meta: `${card.collection} / ${card.rarity}`,
          amount: formatUsd(card.price),
          tone: "neutral" as const,
        }));

  const securityItems = isAuthenticated
    ? [
        {
          id: "verification",
          label: "Account Verification",
          status: user?.verified ? "Verified" : "Pending",
          tone: user?.verified ? ("positive" as const) : ("warning" as const),
        },
        {
          id: "telegram",
          label: "Telegram Username",
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
          label: "Encrypted Transactions",
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
          id: "secure-payments",
          label: "Encrypted Checkout",
          status: "Enabled",
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
          label: "Manual Withdrawals",
          status: "Reviewed",
          tone: "neutral" as const,
        },
      ];

  return (
    <main className="mx-auto w-full max-w-[1540px] px-4 py-6 sm:px-6 lg:px-8">
      <ArchiveSurfaceLayout
        rightRail={
          <CollectorRail
            activityItems={activityItems}
            balanceNote={
              isAuthenticated
                ? "Available balance is synced with your archive wallet."
                : "Sign in to fund your archive balance and preserve purchases in your private vault."
            }
            balanceValue={formatUsd(account?.balance.available ?? 0)}
            emptyActivity="Sign in to track deposits, purchases, and withdrawal review from one private rail."
            primaryActionHref={
              isAuthenticated ? "/dashboard/deposit" : "/login?redirectTo=/dashboard/deposit"
            }
            primaryActionLabel="Deposit"
            secondaryActionHref={isAuthenticated ? "/withdraw" : "/login?redirectTo=/withdraw"}
            secondaryActionLabel="Withdraw"
            securityItems={securityItems}
          />
        }
        sidebar={
          <ArchiveSidebar
            account={account}
            active="dashboard"
            mode="public"
          />
        }
      >
        <div className="p-6 sm:p-8">
          <div className="grid gap-8 xl:grid-cols-[1.02fr_0.98fr]">
            <section className="pt-4">
              <div className="text-[11px] uppercase tracking-[0.28em] text-muted">
                Welcome to ReboHrome
              </div>
              <h1 className="mt-4 display-font max-w-[680px] text-5xl font-semibold leading-[0.96] tracking-[-0.06em] text-foreground sm:text-6xl">
                The Future of Digital Collectibles
              </h1>
              <p className="mt-5 max-w-[520px] text-base leading-8 text-muted">
                Premium digital artifacts curated for private ownership, verified provenance,
                and archive-grade preservation.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/marketplace">Explore Marketplace</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href={isAuthenticated ? "/dashboard/collection" : "/marketplace"}>
                    View Collection
                  </Link>
                </Button>
              </div>
            </section>

            <section className="rounded-[14px] border border-line bg-[linear-gradient(180deg,#ffffff_0%,#f7f8fb_100%)] p-6">
              <div className="relative mx-auto flex min-h-[360px] max-w-[420px] items-center justify-center">
                <div className="absolute inset-x-10 bottom-6 h-10 rounded-full bg-[radial-gradient(circle_at_center,rgba(153,167,212,0.32),transparent_72%)] blur-xl" />
                <div className="relative w-full max-w-[320px]">
                  <div className="rounded-[8px] border border-[rgba(15,23,42,0.16)] bg-[rgba(255,255,255,0.48)] p-3 shadow-[0_18px_38px_rgba(15,23,42,0.07)] backdrop-blur">
                    <div className="rounded-[6px] border border-[rgba(255,255,255,0.84)] bg-[rgba(255,255,255,0.58)] p-3">
                      <CardArtwork card={heroCard} className="aspect-[4/5] w-full" />
                    </div>
                  </div>
                  <div className="mx-auto h-8 w-[88%] rounded-b-[6px] border border-line bg-[linear-gradient(180deg,#ffffff_0%,#eceef3_100%)]" />
                </div>
              </div>
            </section>
          </div>

          <div className="mt-6 grid gap-3 border-y border-line py-5 md:grid-cols-5" id="collections">
            {workspaceStats.map((item) => (
              <div key={item.label}>
                <div className="text-[11px] uppercase tracking-[0.22em] text-muted">
                  {item.label}
                </div>
                <div className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-foreground">
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <section className="mt-6 rounded-[14px] border border-line bg-white p-5" id="drops">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-muted">
                  New Drop
                </div>
              </div>
              <Link
                className="text-sm font-medium text-muted transition hover:text-foreground"
                href="/marketplace"
              >
                View all
              </Link>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-4">
              {newDropCards.map((card, index) => (
                <article
                  key={card.id}
                  className="rounded-[14px] border border-line bg-[var(--background-soft)] p-3"
                >
                  <Link className="block" href={`/product/${card.id}`}>
                    <div className="relative">
                      <div className="absolute left-3 top-3 z-10 text-[30px] font-light tracking-[-0.06em] text-muted">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <CardArtwork card={card} className="aspect-[1.05/1] w-full" compact />
                    </div>
                    <div className="mt-3">
                      <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-foreground">
                        {card.title}
                      </h2>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                        Series {card.edition}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-foreground">
                        {formatUsd(card.price)}
                      </div>
                      <RarityBadge rarity={card.rarity} />
                    </div>
                  </Link>
                  <div className="mt-3">
                    <AddToCartButton
                      disabled={card.stock <= 0}
                      fullWidth
                      productId={card.id}
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </ArchiveSurfaceLayout>
    </main>
  );
}
