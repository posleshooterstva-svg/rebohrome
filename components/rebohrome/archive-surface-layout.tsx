import { cn } from "@/lib/utils";

type ArchiveSurfaceLayoutProps = {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  rightRail: React.ReactNode;
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
  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-[16px] border border-line bg-panel shadow-panel xl:grid-cols-[228px_minmax(0,1fr)_318px]",
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
      <section className="min-w-0 border-b border-line bg-[linear-gradient(180deg,#ffffff_0%,#fcfcfa_100%)] xl:border-b-0 xl:border-r">
        {children}
      </section>
      <aside
        className={cn(
          "min-w-0 border-t border-line bg-[linear-gradient(180deg,#ffffff_0%,#fbfbf9_100%)] xl:border-t-0",
          rightRailClassName,
        )}
      >
        {rightRail}
      </aside>
    </div>
  );
}
