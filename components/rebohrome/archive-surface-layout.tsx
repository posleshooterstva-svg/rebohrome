import { cn } from "@/lib/utils";

type ArchiveSurfaceLayoutProps = {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  rightRail?: React.ReactNode;
  className?: string;
  sidebarClassName?: string;
  rightRailClassName?: string;
};

export function ArchiveSurfaceLayout({
  sidebar,
  children,
  rightRail,
  className,
  sidebarClassName,
  rightRailClassName,
}: ArchiveSurfaceLayoutProps) {
  const hasRightRail = Boolean(rightRail);

  return (
    <div
      className={cn(
        "grid min-h-[calc(100dvh-73px)] w-full overflow-hidden bg-panel",
        hasRightRail
          ? "xl:grid-cols-[260px_minmax(0,1fr)_340px]"
          : "xl:grid-cols-[260px_minmax(0,1fr)]",
        className,
      )}
    >
      <aside
        className={cn(
          "hidden border-b border-line bg-panel-strong xl:block xl:border-b-0 xl:border-r",
          sidebarClassName,
        )}
      >
        {sidebar}
      </aside>
      <section
        className={cn(
          "min-w-0 border-b border-line bg-[linear-gradient(180deg,rgba(14,20,34,0.84)_0%,rgba(9,13,22,0.94)_100%)] xl:border-b-0",
          hasRightRail ? "xl:border-r" : "",
        )}
      >
        {children}
      </section>
      {hasRightRail ? (
        <aside
          className={cn(
            "min-w-0 border-t border-line bg-[linear-gradient(180deg,rgba(17,24,39,0.82)_0%,rgba(9,13,22,0.94)_100%)] xl:border-t-0",
            rightRailClassName,
          )}
        >
          {rightRail}
        </aside>
      ) : null}
    </div>
  );
}
