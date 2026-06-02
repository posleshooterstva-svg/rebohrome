import { Activity, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { reconcileTransVoucherPaymentsInlineAction } from "@/app/actions/marketplace";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import { Button } from "@/components/ui/button";
import { getProviderIntelligence } from "@/lib/db/repository";
import { formatUtcDateTime } from "@/lib/rebohrome-data";

async function runManualReconciliation() {
  "use server";

  await reconcileTransVoucherPaymentsInlineAction();
}

type ProviderIntelligencePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ranges = [
  ["24h", "24h"],
  ["7d", "7d"],
  ["30d", "30d"],
  ["all", "All time"],
] as const;

function normalizeRange(value: string | string[] | undefined) {
  const range = Array.isArray(value) ? value[0] : value;
  return range === "7d" || range === "30d" || range === "all" ? range : "24h";
}

export default async function ProviderIntelligencePage({
  searchParams,
}: ProviderIntelligencePageProps) {
  const params = await searchParams;
  const range = normalizeRange(params.range);
  const intel = await getProviderIntelligence({
    range,
    environment: "production",
  });

  return (
    <AdminShell
      active="provider-intelligence"
      description="Operational view of provider health, reconciliation, webhook recovery, and payment outcomes."
      title="Provider Intelligence"
    >
      <section className="space-y-5">
        <div className="flex flex-col gap-4 rounded-[18px] border border-line bg-panel p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted">
              Provider Status
            </div>
            <div className="mt-2 flex items-center gap-3 text-2xl font-semibold text-foreground">
              {intel.status === "Operational" ? (
                <CheckCircle2 className="size-6 text-emerald-300" />
              ) : intel.status === "No recent activity" ? (
                <Clock className="size-6 text-sky-300" />
              ) : (
                <AlertTriangle className="size-6 text-amber-300" />
              )}
              TransVoucher: {intel.status}
            </div>
            <p className="mt-2 text-sm leading-7 text-muted">
              Last reconciliation:{" "}
              {intel.lastReconciliationRun
                ? `${formatUtcDateTime(intel.lastReconciliationRun)} UTC`
                : "No run recorded"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">
                Data window: {intel.window}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">
                Environment: {intel.environment}
              </span>
            </div>
          </div>
          <form action={runManualReconciliation}>
            <Button type="submit">Manual Status Refresh</Button>
          </form>
        </div>

        <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-panel p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            Old expired/test transactions are excluded from operational health unless
            All time is selected.
          </p>
          <div className="flex flex-wrap gap-2">
            {ranges.map(([value, label]) => (
              <Link
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  range === value
                    ? "border-violet-300/35 bg-violet-500/15 text-violet-100"
                    : "border-white/10 bg-white/[0.04] text-muted hover:text-foreground"
                }`}
                href={`/admin/provider-intelligence?range=${value}`}
                key={value}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Created" value={intel.funnel.created} />
          <MetricCard label="Succeeded" value={intel.funnel.succeeded} />
          <MetricCard label="Failed" value={intel.funnel.failed} />
          <MetricCard label="Expired" value={intel.funnel.expired} />
          <MetricCard label="Pending" value={intel.funnel.pending} />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-[18px] border border-line bg-panel p-5">
            <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Activity className="size-5 text-[var(--accent)]" />
              Success Rate
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MetricCard label="24h" value={`${intel.successRate.last24h}%`} />
              <MetricCard label="7d" value={`${intel.successRate.last7d}%`} />
              <MetricCard label="30d" value={`${intel.successRate.last30d}%`} />
            </div>
          </section>

          <section className="rounded-[18px] border border-line bg-panel p-5">
            <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Clock className="size-5 text-[var(--accent)]" />
              Pending Too Long
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricCard label="Over 15 minutes" value={intel.pendingTooLong.over15m} />
              <MetricCard label="Over 1 hour" value={intel.pendingTooLong.over1h} />
            </div>
          </section>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-[18px] border border-line bg-panel p-5">
            <h2 className="text-lg font-semibold text-foreground">
              Reconciliation Health
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricCard label="Checked" value={intel.reconciliation.checked} />
              <MetricCard label="Succeeded by cron" value={intel.reconciliation.succeeded} />
              <MetricCard label="Failed by cron" value={intel.reconciliation.failed} />
              <MetricCard label="Expired by cron" value={intel.reconciliation.expired} />
            </div>
            {intel.reconciliation.lastError ? (
              <p className="mt-4 rounded-[12px] border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {intel.reconciliation.lastError}
              </p>
            ) : null}
          </section>

          <section className="rounded-[18px] border border-line bg-panel p-5">
            <h2 className="text-lg font-semibold text-foreground">Webhook Health</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricCard
                label="Last webhook"
                value={
                  intel.lastWebhookReceived
                    ? formatUtcDateTime(intel.lastWebhookReceived)
                    : "N/A"
                }
              />
              <MetricCard
                label="Invalid signatures"
                value={intel.webhook.invalidSignatureCount}
              />
              <MetricCard label="Duplicates" value={intel.webhook.duplicateCount} />
            </div>
          </section>
        </div>

        <section className="rounded-[18px] border border-line bg-panel p-5">
          <h2 className="text-lg font-semibold text-foreground">Failed Payments</h2>
          <div className="mt-4 space-y-2">
            {intel.failedReasons.map((item) => (
              <div
                className="flex items-center justify-between gap-4 rounded-[12px] border border-line bg-panel-strong px-4 py-3 text-sm"
                key={item.reason}
              >
                <span className="truncate text-muted">{item.reason}</span>
                <span className="font-semibold text-foreground">{item.count}</span>
              </div>
            ))}
            {intel.failedReasons.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-line bg-panel-strong px-4 py-4 text-sm text-muted">
                No failed payment reasons recorded.
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </AdminShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[14px] border border-line bg-panel-strong px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
