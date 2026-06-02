import { cn } from "@/lib/utils";

type SurfaceSkeletonProps = {
  titleWidth?: string;
  showSidebar?: boolean;
  showRightRail?: boolean;
  cardCount?: number;
};

function SkeletonBlock({
  className,
}: {
  className: string;
}) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[14px] bg-[linear-gradient(90deg,rgba(255,255,255,0.045)_0%,rgba(139,92,246,0.12)_45%,rgba(255,255,255,0.045)_100%)]",
        className,
      )}
    />
  );
}

export function SurfaceSkeleton({
  titleWidth = "w-[320px]",
  showSidebar = true,
  showRightRail = true,
  cardCount = 4,
}: SurfaceSkeletonProps) {
  return (
    <main className="mx-auto w-full max-w-[1540px] px-4 py-6 pb-28 sm:px-6 lg:px-8 xl:pb-6">
      <div className="rounded-[16px] border border-line bg-panel px-4 py-4 shadow-panel sm:px-6">
        <div className="flex items-center gap-6">
          <SkeletonBlock className="h-9 w-[158px] rounded-[12px]" />
          <div className="hidden gap-4 lg:flex">
            <SkeletonBlock className="h-4 w-20 rounded-full" />
            <SkeletonBlock className="h-4 w-20 rounded-full" />
            <SkeletonBlock className="h-4 w-16 rounded-full" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <SkeletonBlock className="hidden h-11 w-[320px] rounded-[12px] xl:block" />
            <SkeletonBlock className="h-10 w-10 rounded-[12px]" />
            <SkeletonBlock className="h-10 w-10 rounded-[12px]" />
            <SkeletonBlock className="h-10 w-[156px] rounded-[12px]" />
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-[16px] border border-line bg-panel shadow-panel xl:grid xl:grid-cols-[228px_minmax(0,1fr)_318px]">
        {showSidebar ? (
          <aside className="hidden border-r border-line bg-panel-strong xl:block">
            <div className="space-y-4 p-5">
              <SkeletonBlock className="h-4 w-16 rounded-full" />
              {Array.from({ length: 7 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-11 w-full rounded-[12px]" />
              ))}
            </div>
          </aside>
        ) : null}

        <section className="min-w-0 border-b border-line bg-[linear-gradient(180deg,rgba(14,20,34,0.86)_0%,rgba(9,13,22,0.92)_100%)] p-6 sm:p-8 xl:border-b-0 xl:border-r">
          <SkeletonBlock className="h-4 w-28 rounded-full" />
          <SkeletonBlock className={cn("mt-4 h-12 rounded-[16px]", titleWidth)} />
          <SkeletonBlock className="mt-4 h-4 w-full max-w-[560px] rounded-full" />
          <SkeletonBlock className="mt-2 h-4 w-full max-w-[480px] rounded-full" />
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: cardCount }).map((_, index) => (
              <div
                key={index}
                className="rounded-[16px] border border-line bg-panel-strong p-4"
              >
                <SkeletonBlock className="aspect-[4/5] w-full rounded-[14px]" />
                <SkeletonBlock className="mt-4 h-4 w-3/4 rounded-full" />
                <SkeletonBlock className="mt-2 h-3.5 w-1/2 rounded-full" />
              </div>
            ))}
          </div>
        </section>

        {showRightRail ? (
          <aside className="space-y-4 bg-[linear-gradient(180deg,rgba(17,24,39,0.84)_0%,rgba(9,13,22,0.94)_100%)] p-5">
            <SkeletonBlock className="h-[190px] w-full rounded-[16px]" />
            <SkeletonBlock className="h-[214px] w-full rounded-[16px]" />
            <SkeletonBlock className="h-[190px] w-full rounded-[16px]" />
          </aside>
        ) : null}
      </div>
    </main>
  );
}
