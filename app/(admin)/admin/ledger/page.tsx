import { ShieldCheck } from "lucide-react";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import { getAdminArchiveLedger } from "@/lib/db/repository";
import { formatUtcDateTime } from "@/lib/rebohrome-data";

type AdminLedgerPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminLedgerPage({
  searchParams,
}: AdminLedgerPageProps) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const eventType = typeof params.eventType === "string" ? params.eventType : "";
  const records = await getAdminArchiveLedger({
    query,
    eventType: eventType || null,
    limit: 120,
  });

  return (
    <AdminShell
      active="ledger"
      description="Internal append-only archive event history with integrity hashes."
      title="Archive Ledger"
    >
      <section className="space-y-5">
        <form className="grid gap-3 rounded-[18px] border border-line bg-panel p-4 sm:grid-cols-[1fr_240px_auto]">
          <input
            className="rounded-[12px] border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none"
            defaultValue={query}
            name="q"
            placeholder="Search user, order, transaction, entity..."
          />
          <input
            className="rounded-[12px] border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none"
            defaultValue={eventType}
            name="eventType"
            placeholder="event type"
          />
          <button className="rounded-[12px] bg-[var(--accent)] px-5 py-3 text-sm font-medium text-white">
            Search
          </button>
        </form>

        <div className="space-y-3">
          {records.map((record) => (
            <article
              className="rounded-[18px] border border-line bg-panel p-5 shadow-panel"
              key={record.id}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted">
                      {record.eventType}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200">
                      <ShieldCheck className="size-3" />
                      Event integrity hash
                    </span>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold text-foreground">
                    {record.title}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
                    {record.description}
                  </p>
                  <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
                    <div>Record ID: {record.ledgerId}</div>
                    <div>Entity: {record.entityType} / {record.entityId}</div>
                    <div>User: {record.userId ?? "N/A"}</div>
                    <div>Created: {formatUtcDateTime(record.createdAt)} UTC</div>
                  </div>
                </div>
                <div className="w-full rounded-[14px] border border-line bg-panel-strong p-3 text-xs text-muted lg:w-[360px]">
                  <div className="break-all">Hash: {record.eventHash}</div>
                  <div className="mt-2 break-all">Previous: {record.previousHash ?? "Genesis"}</div>
                </div>
              </div>
            </article>
          ))}
          {records.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-line bg-panel p-8 text-center text-sm text-muted">
              No archive ledger records match this search.
            </div>
          ) : null}
        </div>
      </section>
    </AdminShell>
  );
}
