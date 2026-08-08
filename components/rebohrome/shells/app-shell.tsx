import { type HeaderAccount } from "@/lib/rebohrome-data";
import { cn } from "@/lib/utils";
import { RebohromeLogo } from "../logo";
import { PersistentArchiveNotice } from "../persistent-archive-notice";
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
  quickActionHref = "/dashboard/marketplace",
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
          "min-h-dvh w-full overflow-x-hidden xl:pl-[72px]",
          mobileNavigation ? "mobile-safe-bottom xl:pb-0" : "",
        )}
      >
        <div className="pointer-events-none fixed inset-y-0 left-0 z-[160] hidden w-[72px] border-r border-line bg-panel-strong xl:block" />
        <aside className="peer/sidebar group/sidebar fixed left-0 top-0 z-[170] hidden h-dvh w-[72px] overflow-hidden border-r border-line bg-panel-strong shadow-[16px_0_80px_rgba(0,0,0,0.18)] transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:w-[248px] xl:flex xl:flex-col">
          <div className="flex h-[76px] w-[72px] shrink-0 items-center justify-center group-hover/sidebar:w-full group-hover/sidebar:justify-start group-hover/sidebar:px-5">
            <RebohromeLogo
              className="relative"
              href="/"
              iconClassName="size-9"
              textClassName="pointer-events-none absolute left-11 whitespace-nowrap opacity-0 transition-all duration-200 -translate-x-2 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100"
            />
          </div>
          <div className="min-h-0 flex-1">{sidebar}</div>
        </aside>

        <section className="relative min-w-0 bg-panel">
          <div className="pointer-events-none fixed inset-0 left-[72px] z-[140] hidden bg-[rgba(3,6,18,0.42)] opacity-0 backdrop-blur-[1.5px] transition-opacity duration-200 peer-hover/sidebar:opacity-100 xl:block" />
          <div className="pointer-events-none sticky top-0 z-[120] flex w-full justify-end px-3 pt-4 sm:px-6 lg:px-8">
            <div className="pointer-events-auto w-full xl:w-auto xl:min-w-[520px]">
              <WorkspaceTopbar
                account={account}
                cartHref={cartHref}
                logoClassName="xl:hidden"
                logoHref="/"
                notificationHref={notificationHref}
                quickActionHref={quickActionHref}
                searchPlaceholder={searchPlaceholder}
                showCart={showCart}
                showLogo
                showNavigation={false}
                showQuickAction={showQuickAction}
              />
            </div>
          </div>

          <div
            className={cn(
              "-mt-[64px] grid min-h-dvh w-full overflow-hidden bg-panel pt-[76px]",
              rightRail ? "xl:grid-cols-[minmax(0,1fr)_340px]" : "",
              surfaceClassName,
            )}
          >
            <section className={cn(
              "min-w-0 bg-[linear-gradient(180deg,rgba(14,20,34,0.84)_0%,rgba(9,13,22,0.94)_100%)]",
              rightRail ? "xl:border-r" : "",
            )}>
              <div className={cn("p-4 pt-3 sm:p-6 sm:pt-4 lg:p-8 lg:pt-5", contentClassName)}>
                {showIntro ? (
                  <div className="max-w-3xl">
                    {eyebrow ? (
                      <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">
                        {eyebrow}
                      </div>
                    ) : null}
                    {title ? (
                      <h1 className="mt-3 display-font text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
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
            </section>

            {rightRail ? (
              <aside className="min-w-0 border-t border-line bg-[linear-gradient(180deg,rgba(17,24,39,0.82)_0%,rgba(9,13,22,0.94)_100%)] xl:border-t-0">
                {rightRail}
              </aside>
            ) : null}
          </div>
        </section>
      </main>
      {account ? <PersistentArchiveNotice /> : null}
      {mobileNavigation}
    </>
  );
}
