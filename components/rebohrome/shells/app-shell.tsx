import { type HeaderAccount } from "@/lib/rebohrome-data";
import { cn } from "@/lib/utils";
import { ArchiveSurfaceLayout } from "../archive-surface-layout";
import { WorkspaceTopbar } from "../workspace-topbar";

type AppShellProps = {
  account: HeaderAccount | null;
  sidebar: React.ReactNode;
  rightRail?: React.ReactNode;
  children: React.ReactNode;
  eyebrow?: string;
  title?: string;
  description?: string;
  hideIntro?: boolean;
  notificationHref?: string;
  cartHref?: string;
  quickActionHref?: string;
  showCart?: boolean;
  showQuickAction?: boolean;
  searchPlaceholder?: string;
  contentClassName?: string;
  surfaceClassName?: string;
  mobileNavigation?: React.ReactNode;
};

export function AppShell({
  account,
  sidebar,
  rightRail = null,
  children,
  eyebrow,
  title,
  description,
  hideIntro = false,
  notificationHref = "/dashboard/transactions",
  cartHref = "/cart",
  quickActionHref = "/marketplace",
  showCart = false,
  showQuickAction = true,
  searchPlaceholder = "Search collectibles, collections...",
  contentClassName,
  surfaceClassName,
  mobileNavigation,
}: AppShellProps) {
  const showIntro = !hideIntro && Boolean(eyebrow || title || description);

  return (
    <>
      <main
        className={cn(
          "mx-auto w-full max-w-[1540px] px-4 py-6 sm:px-6 lg:px-8",
          mobileNavigation ? "pb-28 xl:pb-6" : "pb-6",
        )}
      >
      <header className="relative z-[120]">
        <WorkspaceTopbar
          account={account}
          cartHref={cartHref}
          notificationHref={notificationHref}
          quickActionHref={quickActionHref}
          searchPlaceholder={searchPlaceholder}
          showCart={showCart}
          showLogo
          showQuickAction={showQuickAction}
        />
      </header>
      <div className="mt-6">
        <ArchiveSurfaceLayout
          className={surfaceClassName}
          rightRail={rightRail}
          sidebar={sidebar}
        >
          <div className={cn("p-6 sm:p-8", contentClassName)}>
            {showIntro ? (
              <div className="max-w-3xl">
                {eyebrow ? (
                  <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">
                    {eyebrow}
                  </div>
                ) : null}
                {title ? (
                  <h1 className="mt-3 display-font text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
                    {title}
                  </h1>
                ) : null}
                {description ? (
                  <p className="mt-3 text-sm leading-7 text-muted">{description}</p>
                ) : null}
              </div>
            ) : null}
          <div className={showIntro ? "mt-8" : ""}>{children}</div>
        </div>
      </ArchiveSurfaceLayout>
      </div>
      </main>
      {mobileNavigation}
    </>
  );
}
