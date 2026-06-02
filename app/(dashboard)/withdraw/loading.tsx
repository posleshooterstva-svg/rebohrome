export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-[20px] border border-line bg-panel p-6 shadow-panel">
          <div className="h-10 w-64 animate-pulse rounded-full bg-white/[0.08]" />
          <div className="mt-4 h-4 w-96 max-w-full animate-pulse rounded-full bg-white/[0.06]" />
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="h-28 animate-pulse rounded-[18px] border border-line bg-panel-strong" />
            <div className="h-28 animate-pulse rounded-[18px] border border-line bg-panel-strong" />
          </div>
          <div className="mt-5 h-72 animate-pulse rounded-[18px] border border-line bg-panel-strong" />
        </section>
        <aside className="hidden rounded-[20px] border border-line bg-panel p-6 shadow-panel lg:block">
          <div className="h-5 w-40 animate-pulse rounded-full bg-white/[0.08]" />
          <div className="mt-5 h-28 animate-pulse rounded-[16px] bg-white/[0.06]" />
          <div className="mt-4 h-28 animate-pulse rounded-[16px] bg-white/[0.06]" />
        </aside>
      </div>
    </main>
  );
}
