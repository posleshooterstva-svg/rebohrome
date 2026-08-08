import {
  ArchiveSidebar,
} from "@/components/rebohrome/archive-sidebar";
import { CollectorRail } from "@/components/rebohrome/collector-rail";
import {
  getFinancialOverview,
  getHeaderAccount,
} from "@/lib/db/repository";
import {
  formatCurrency,
} from "@/lib/rebohrome-data";
import { getSessionState } from "@/lib/session";
import { AppShell } from "./app-shell";
import { MobileBottomNav } from "../mobile-bottom-nav";

type DashboardShellProps = {
  active:
    | "dashboard"
    | "marketplace"
    | "collections"
    | "drops"
    | "collection"
    | "vault"
    | "watchlist"
    | "orders"
    | "transactions"
    | "deposit"
    | "settings";
  title: string;
  description: string;
  children: React.ReactNode;
  hideIntro?: boolean;
  rightRail?: React.ReactNode;
  showRightRail?: boolean;
  showCart?: boolean;
  showQuickAction?: boolean;
  quickActionHref?: string;
  searchPlaceholder?: string;
  notificationHref?: string;
};

export async function DashboardShell({
  active,
  title,
  description,
  children,
  hideIntro = false,
  rightRail,
  showRightRail = true,
  showCart = false,
  showQuickAction = true,
  quickActionHref = "/dashboard/marketplace",
  searchPlaceholder = "Search collectibles, collections...",
  notificationHref = "/notifications",
}: DashboardShellProps) {
  const session = await getSessionState();
  const shouldLoadRightRailData = showRightRail && !rightRail;
  const [account, financialOverview] = await Promise.all([
    session.userId ? getHeaderAccount(session.userId) : Promise.resolve(null),
    session.userId && shouldLoadRightRailData
      ? getFinancialOverview(session.userId)
      : Promise.resolve(null),
  ]);
  const user = account?.user ?? null;

  const activityItems =
    financialOverview?.recentTransactions.slice(0, 4).map((transaction) => ({
      id: transaction.id,
      title:
        transaction.kind === "deposit"
          ? "Deposit"
          : transaction.kind === "purchase"
            ? "Purchase"
              : "Refund",
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
    })) ?? [];

  const securityItems = [
    {
      id: "verification",
      label: "Verification",
      status: user?.telegramVerified ? "Verified" : "Pending",
      tone: user?.telegramVerified ? ("positive" as const) : ("warning" as const),
    },
    {
      id: "telegram",
      label: "Telegram",
      status: user?.telegramChatId ? "Chat Linked" : user?.telegramUsername ? "Awaiting Link" : "Missing",
      tone: user?.telegramChatId ? ("positive" as const) : ("warning" as const),
    },
    {
      id: "role",
      label: "Archive Access",
      status: user?.role === "admin" ? "Admin" : "Collector",
      tone: "neutral" as const,
    },
  ];

  return (
    <AppShell
      account={account}
      cartHref="/cart"
      description={description}
      eyebrow="Archive Workspace"
      hideIntro={hideIntro}
      notificationHref={notificationHref}
      quickActionHref={quickActionHref}
      rightRail={
        showRightRail
          ? rightRail ?? (
            <CollectorRail
              activityItems={activityItems}
              balanceNote="Available balance."
              emptyActivity="Your deposits, purchases, and balance updates will appear here."
              initialBalance={{
                available: account?.balance.available ?? 0,
                pendingWithdrawal: account?.balance.pendingWithdrawal ?? 0,
                totalDeposited: account?.balance.totalDeposited ?? 0,
                totalSpent: account?.balance.totalSpent ?? 0,
                totalWithdrawn: account?.balance.totalWithdrawn ?? 0,
              }}
              primaryActionHref="/dashboard/deposit"
              primaryActionLabel="Deposit"
              secondaryActionHref="/dashboard/transactions"
              secondaryActionLabel="History"
              securityItems={securityItems}
              userId={account?.user.id ?? null}
            />
          )
          : null
      }
      searchPlaceholder={searchPlaceholder}
      showCart={showCart}
      showQuickAction={showQuickAction}
      mobileNavigation={<MobileBottomNav active={active} />}
      sidebar={
        <ArchiveSidebar
          account={account}
          active={active}
          mode="dashboard"
        />
      }
      title={title}
    >
      {children}
    </AppShell>
  );
}
