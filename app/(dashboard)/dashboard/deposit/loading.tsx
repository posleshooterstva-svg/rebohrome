export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <div>
            <div className="h-10 w-44 animate-pulse rounded-full bg-white/[0.08]" />
            <div className="mt-4 h-4 w-72 animate-pulse rounded-full bg-white/[0.06]" />
          </div>
          <div className="rounded-[20px] border border-line bg-panel p-5 shadow-panel">
            <div className="h-5 w-36 animate-pulse rounded-full bg-white/[0.08]" />
            <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  className="h-24 animate-pulse rounded-[16px] border border-line bg-panel-strong"
                  key={index}
                />
              ))}
            </div>
          </div>
          <div className="rounded-[20px] border border-line bg-panel p-5 shadow-panel">
            <div className="h-5 w-48 animate-pulse rounded-full bg-white/[0.08]" />
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="h-24 animate-pulse rounded-[16px] border border-line bg-panel-strong" />
              <div className="h-24 animate-pulse rounded-[16px] border border-line bg-panel-strong" />
            </div>
          </div>
        </section>
        <aside className="hidden rounded-[20px] border border-line bg-panel p-5 shadow-panel lg:block">
          <div className="h-5 w-32 animate-pulse rounded-full bg-white/[0.08]" />
          <div className="mt-5 h-24 animate-pulse rounded-[16px] bg-white/[0.06]" />
          <div className="mt-4 h-24 animate-pulse rounded-[16px] bg-white/[0.06]" />
        </aside>
      </div>
    </main>
  );
}
