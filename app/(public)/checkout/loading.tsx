export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-5 lg:grid-cols-[0.88fr_1.12fr]">
        <section className="rounded-[20px] border border-line bg-panel p-6 shadow-panel">
          <div className="h-9 w-64 animate-pulse rounded-full bg-white/[0.08]" />
          <div className="mt-4 h-4 w-80 max-w-full animate-pulse rounded-full bg-white/[0.06]" />
          <div className="mt-8 space-y-4">
            <div className="h-24 animate-pulse rounded-[16px] border border-line bg-panel-strong" />
            <div className="h-24 animate-pulse rounded-[16px] border border-line bg-panel-strong" />
            <div className="h-24 animate-pulse rounded-[16px] border border-line bg-panel-strong" />
          </div>
        </section>
        <section className="rounded-[20px] border border-line bg-panel p-6 shadow-panel">
          <div className="h-6 w-40 animate-pulse rounded-full bg-white/[0.08]" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                className="h-44 animate-pulse rounded-[18px] border border-line bg-panel-strong"
                key={index}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
