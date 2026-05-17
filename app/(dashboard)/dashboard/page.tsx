import Link from "next/link";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { RarityBadge } from "@/components/rebohrome/rarity-badge";
import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import {
  getDashboardStats,
  getMarketplaceProducts,
  getUserInventory,
  getUserOrders,
} from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";
import {
  formatDisplayDate,
  formatUsd,
} from "@/lib/rebohrome-data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireUserSession("/login");
  const [dashboardStats, dashboardOrders, inventory, latestProducts] = await Promise.all([
    getDashboardStats(session.userId),
    getUserOrders(session.userId),
    getUserInventory(session.userId),
    getMarketplaceProducts({ sort: "newest" }),
  ]);

  const featuredCard = inventory[0]?.product ?? latestProducts[0] ?? null;
  const newDropCards = latestProducts.slice(0, 4);

  return (
    <DashboardShell
      active="dashboard"
      title="Collector Dashboard"
      description="Your private product surface for archive balance, verified ownership, new drops, and real transaction-aware collection activity."
      hideIntro
    >
      <div className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
        <section>
          <div className="text-[11px] uppercase tracking-[0.28em] text-muted">
            Private Vault
          </div>
          <h2 className="mt-4 display-font max-w-[620px] text-5xl font-semibold leading-[0.96] tracking-[-0.06em] text-foreground">
            Manage rare digital artifacts from one archive canvas.
          </h2>
          <p className="mt-5 max-w-[520px] text-base leading-8 text-muted">
            Fund your balance, preserve purchased cards, and follow every order from one clean collector workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className="inline-flex items-center justify-center rounded-[10px] bg-foreground px-5 py-3 text-sm font-medium text-white transition hover:opacity-92"
              href="/marketplace"
            >
              Explore Marketplace
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-[10px] border border-line bg-white px-5 py-3 text-sm font-medium text-foreground transition hover:bg-[var(--background-strong)]"
              href="/dashboard/collection"
            >
              View Collection
            </Link>
          </div>
        </section>

        <section className="rounded-[14px] border border-line bg-[linear-gradient(180deg,#ffffff_0%,#f7f8fb_100%)] p-6">
          {featuredCard ? (
            <div className="relative mx-auto flex min-h-[340px] max-w-[420px] items-center justify-center">
              <div className="absolute inset-x-10 bottom-6 h-10 rounded-full bg-[radial-gradient(circle_at_center,rgba(153,167,212,0.32),transparent_72%)] blur-xl" />
              <div className="relative w-full max-w-[320px]">
                <div className="rounded-[8px] border border-[rgba(15,23,42,0.16)] bg-[rgba(255,255,255,0.48)] p-3 shadow-[0_18px_38px_rgba(15,23,42,0.07)] backdrop-blur">
                  <div className="rounded-[6px] border border-[rgba(255,255,255,0.84)] bg-[rgba(255,255,255,0.58)] p-3">
                    <CardArtwork card={featuredCard} className="aspect-[4/5] w-full" />
                  </div>
                </div>
                <div className="mx-auto h-8 w-[88%] rounded-b-[6px] border border-line bg-[linear-gradient(180deg,#ffffff_0%,#eceef3_100%)]" />
              </div>
            </div>
          ) : (
            <div className="flex min-h-[340px] items-center justify-center text-sm text-muted">
              Your featured archive object will appear here after the first acquisition.
            </div>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-3 border-y border-line py-5 md:grid-cols-5">
        {dashboardStats.map((stat) => (
          <div key={stat.label}>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted">
              {stat.label}
            </div>
            <div className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-foreground">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-[14px] border border-line bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted">
            New Drop
          </div>
          <Link
            className="text-sm font-medium text-muted transition hover:text-foreground"
            href="/marketplace"
          >
            View all
          </Link>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
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
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-foreground">
                    {card.title}
                  </h3>
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

      <section className="mt-6 rounded-[14px] border border-line bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted">
            Recent Orders
          </div>
          <Link
            className="text-sm font-medium text-muted transition hover:text-foreground"
            href="/dashboard/orders"
          >
            View all
          </Link>
        </div>
        <div className="mt-5 space-y-3">
          {dashboardOrders.slice(0, 4).map((order) => (
            <div
              key={order.id}
              className="rounded-[12px] border border-line bg-[var(--background-soft)] px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{order.id}</div>
                  <div className="mt-1 text-xs leading-5 text-muted">
                    {formatDisplayDate(order.createdAt)} / {order.itemCount} items
                  </div>
                </div>
                <div className="text-sm font-medium text-foreground">
                  {formatUsd(order.total)}
                </div>
              </div>
            </div>
          ))}

          {dashboardOrders.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-line bg-[var(--background-soft)] px-4 py-6 text-sm leading-6 text-muted">
              No orders yet. Explore the marketplace to begin your collection.
            </div>
          ) : null}
        </div>
      </section>
    </DashboardShell>
  );
}
