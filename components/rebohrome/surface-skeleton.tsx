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
  showRightRail = false,
  cardCount = 4,
}: SurfaceSkeletonProps) {
  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-[#060912] pb-28 text-white xl:pl-[72px] xl:pb-0">
      {showSidebar ? (
        <aside className="fixed left-0 top-0 z-[170] hidden h-dvh w-[72px] overflow-hidden border-r border-line bg-panel-strong xl:flex xl:flex-col">
          <div className="flex h-[76px] shrink-0 items-center justify-center">
            <SkeletonBlock className="size-9 rounded-[12px]" />
          </div>
          <div className="min-h-0 flex-1">
            <div className="space-y-4 px-5 py-5">
              <SkeletonBlock className="h-4 w-7 rounded-full" />
              {Array.from({ length: 7 }).map((_, index) => (
                <SkeletonBlock key={index} className="size-8 rounded-[10px]" />
              ))}
            </div>
          </div>
        </aside>
      ) : null}

      <section className="relative min-w-0 bg-panel">
        <div className="pointer-events-none sticky top-0 z-[120] flex w-full justify-end px-3 pt-4 sm:px-6 lg:px-8">
          <div className="flex w-full items-center gap-3 sm:gap-6 xl:w-auto xl:min-w-[520px]">
            <SkeletonBlock className="h-9 w-[158px] rounded-[12px] xl:hidden" />
            <div className="ml-auto flex items-center gap-3">
              <SkeletonBlock className="hidden h-11 w-[320px] rounded-[12px] xl:block" />
              <SkeletonBlock className="h-10 w-10 rounded-[14px]" />
              <SkeletonBlock className="h-10 w-10 rounded-[14px]" />
              <SkeletonBlock className="h-12 w-[156px] rounded-[16px]" />
            </div>
          </div>
        </div>

        <div
          className={cn(
            "-mt-[64px] grid min-h-dvh w-full overflow-hidden bg-panel pt-[76px]",
            showRightRail ? "xl:grid-cols-[minmax(0,1fr)_340px]" : "",
          )}
        >
          <section
            className={cn(
              "min-w-0 border-b border-line bg-[linear-gradient(180deg,rgba(14,20,34,0.86)_0%,rgba(9,13,22,0.92)_100%)] p-4 pt-3 sm:p-6 sm:pt-4 lg:p-8 lg:pt-5 xl:border-b-0",
              showRightRail ? "xl:border-r" : "",
            )}
          >
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
            <aside className="space-y-4 bg-[linear-gradient(180deg,rgba(17,24,39,0.84)_0%,rgba(9,13,22,0.94)_100%)] p-4 sm:p-5">
              <SkeletonBlock className="h-[190px] w-full rounded-[16px]" />
              <SkeletonBlock className="h-[214px] w-full rounded-[16px]" />
              <SkeletonBlock className="h-[190px] w-full rounded-[16px]" />
            </aside>
          ) : null}
        </div>
      </section>
    </main>
  );
}
