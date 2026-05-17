import { cn } from "@/lib/utils";

type ArchiveSurfaceLayoutProps = {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  rightRail: React.ReactNode;
  className?: string;
};

export function ArchiveSurfaceLayout({
  sidebar,
  children,
  rightRail,
  className,
}: ArchiveSurfaceLayoutProps) {
  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-[16px] border border-line bg-panel shadow-panel xl:grid-cols-[228px_minmax(0,1fr)_318px]",
        className,
      )}
    >
      <aside className="border-b border-line bg-panel-strong xl:border-b-0 xl:border-r">
        {sidebar}
      </aside>
      <section className="min-w-0 border-b border-line bg-[linear-gradient(180deg,#ffffff_0%,#fcfcfa_100%)] xl:border-b-0 xl:border-r">
        {children}
      </section>
      <aside className="min-w-0 bg-[linear-gradient(180deg,#ffffff_0%,#fbfbf9_100%)]">
        {rightRail}
      </aside>
    </div>
  );
}
