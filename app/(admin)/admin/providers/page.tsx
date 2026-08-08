import { redirect } from "next/navigation";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import { Button } from "@/components/ui/button";
import {
  getAdminPaymentProviders,
  syncWertOrderStatus,
  updateAdminPaymentProviderLimits,
} from "@/lib/db/repository";
import {
  formatUsd,
  type PaymentGateAccessRecord,
  type PaymentProviderKey,
} from "@/lib/rebohrome-data";
import { withPerf } from "@/lib/server/perf";
import {
  COINFLOW_API_KEY,
  COINFLOW_API_BASE_URL,
  COINFLOW_DEFAULT_CURRENCY,
  COINFLOW_DEFAULT_PAYMENT_METHOD,
  COINFLOW_ENABLE_ACH,
  COINFLOW_ENABLE_APPLE_PAY,
  COINFLOW_ENABLE_CARD,
  COINFLOW_ENABLE_GOOGLE_PAY,
  COINFLOW_ENABLE_PIX,
  COINFLOW_ENABLE_SEPA,
  COINFLOW_ENABLE_UK_FASTER_PAYMENTS,
  COINFLOW_ENV,
  COINFLOW_MERCHANT_ID,
  COINFLOW_SETTLEMENT_TYPE,
  COINFLOW_WEBHOOK_VALIDATION_KEY,
  WERT_API_KEY,
  WERT_DEFAULT_COMMODITY,
  WERT_DEFAULT_COMMODITY_AMOUNT,
  WERT_DEFAULT_NETWORK,
  WERT_ENV,
  WERT_NFT_DELIVERY_MODE,
  WERT_ORIGIN,
  WERT_PARTNER_ID,
  WERT_PRIVATE_KEY,
  WERT_SMART_CONTRACT_ADDRESS,
  WERT_WEBHOOK_SECRET,
} from "@/lib/server-config";
import { getRequestMeta, requireAdminSession } from "@/lib/session";

type AdminProvidersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function saveProviderLimitsAction(formData: FormData) {
  "use server";

  const session = await requireAdminSession("/");
  const providerKey = readString(formData, "providerKey") as PaymentProviderKey;
  const meta = await getRequestMeta("/admin/providers");

  try {
    await updateAdminPaymentProviderLimits({
      adminUserId: session.userId,
      providerKey,
      minDepositAmount: readString(formData, "minDepositAmount"),
      maxDepositAmount: readString(formData, "maxDepositAmount"),
      defaultDepositAmount: readString(formData, "defaultDepositAmount"),
      ...meta,
    });
  } catch (error) {
    redirect(
      `/admin/providers?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Unable to save gate limits.",
      )}`,
    );
  }

  redirect("/admin/providers?saved=1");
}

async function syncWertOrderAction(formData: FormData) {
  "use server";

  await requireAdminSession("/");
  const clickId = readString(formData, "clickId");
  const wertOrderId = readString(formData, "wertOrderId");

  try {
    await syncWertOrderStatus({
      clickId: clickId || null,
      wertOrderId: wertOrderId || null,
      source: "manual_check",
    });
  } catch (error) {
    redirect(
      `/admin/providers?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Unable to sync Wert order.",
      )}`,
    );
  }

  redirect("/admin/providers?wertSynced=1");
}

function formatLimit(value: number | null) {
  return value === null ? "No maximum" : formatUsd(value);
}

function ProviderLimitCard({ gate }: { gate: PaymentGateAccessRecord }) {
  const usdOnly =
    gate.providerKey === "cleffo" ||
    gate.providerKey === "wert" ||
    gate.providerKey === "coinflow";

  return (
    <section className="rounded-[22px] border border-line bg-panel p-5 shadow-[0_24px_90px_rgba(0,0,0,0.16)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">
            Payment Gate
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
            {gate.adminName.replace(" - ", " — ")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            User-facing name: {gate.publicName}. Configure server-enforced
            deposit limits for hosted payment sessions.
          </p>
        </div>
        <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
          {gate.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <InfoTile label="Current minimum" value={formatUsd(gate.minAmount)} />
        <InfoTile label="Current maximum" value={formatLimit(gate.maxAmount)} />
        <InfoTile
          label="Currencies"
          value={usdOnly ? "USD only / EUR disabled" : gate.supportsCurrencies.join(" / ")}
        />
      </div>

      <form action={saveProviderLimitsAction} className="mt-5 grid gap-4">
        <input name="providerKey" type="hidden" value={gate.providerKey} />
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Minimum deposit amount
            </span>
            <input
              className="rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none"
              defaultValue={gate.minAmount}
              min="0.01"
              name="minDepositAmount"
              step="0.01"
              type="number"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Maximum deposit amount
            </span>
            <input
              className="rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none"
              defaultValue={gate.maxAmount ?? ""}
              min="0.01"
              name="maxDepositAmount"
              step="0.01"
              type="number"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Default deposit amount
            </span>
            <input
              className="rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none"
              defaultValue={gate.defaultAmount ?? ""}
              min="0.01"
              name="defaultDepositAmount"
              step="0.01"
              type="number"
            />
          </label>
        </div>
        {gate.providerKey === "wert" ? (
          <div className="space-y-4 rounded-[14px] border border-violet-300/20 bg-violet-500/10 px-4 py-4 text-sm text-violet-100">
            <p>
              Gate #3 uses Wert.io smart-contract checkout. Private key and API
              key are never shown here and must stay only in environment variables.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <InfoTile label="Environment" value={WERT_ENV} />
              <InfoTile label="Origin" value={WERT_ORIGIN} />
              <InfoTile label="Partner ID" value={WERT_PARTNER_ID ? "Configured" : "Missing"} />
              <InfoTile label="API key" value={WERT_API_KEY ? "Configured" : "Missing"} />
              <InfoTile label="Private key" value={WERT_PRIVATE_KEY ? "Configured" : "Missing"} />
              <InfoTile label="Webhook secret" value={WERT_WEBHOOK_SECRET ? "Configured" : "Missing"} />
              <InfoTile label="Commodity" value={`${WERT_DEFAULT_COMMODITY} / ${WERT_DEFAULT_COMMODITY_AMOUNT}`} />
              <InfoTile label="Network" value={WERT_DEFAULT_NETWORK} />
              <InfoTile label="NFT delivery" value={WERT_NFT_DELIVERY_MODE} />
            </div>
            <InfoTile label="Smart contract" value={WERT_SMART_CONTRACT_ADDRESS || "Missing"} />
            {!WERT_API_KEY ? (
              <p className="rounded-[12px] border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-amber-100">
                Wert API key is not configured. Server-side order lookup is disabled.
              </p>
            ) : null}
            <form action={syncWertOrderAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <input
                className="rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none"
                name="clickId"
                placeholder="click_id"
              />
              <input
                className="rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none"
                name="wertOrderId"
                placeholder="Wert order ID optional"
              />
              <Button type="submit">Sync Wert Order</Button>
            </form>
          </div>
        ) : null}
        {gate.providerKey === "coinflow" ? (
          <div className="space-y-4 rounded-[14px] border border-cyan-300/20 bg-cyan-500/10 px-4 py-4 text-sm text-cyan-100">
            <p>
              Gate #4 uses Coinflow hosted card checkout. API key, webhook
              validation key, session keys, and JWT tokens are never displayed.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <InfoTile label="Environment" value={COINFLOW_ENV === "sandbox" ? "Sandbox" : "Production"} />
              <InfoTile label="API URL" value={COINFLOW_API_BASE_URL} />
              <InfoTile label="Primary method" value={COINFLOW_DEFAULT_PAYMENT_METHOD === "card" ? "Card" : COINFLOW_DEFAULT_PAYMENT_METHOD} />
              <InfoTile label="Merchant ID" value={COINFLOW_MERCHANT_ID ? "Configured" : "Missing"} />
              <InfoTile label="API key" value={COINFLOW_API_KEY ? "Configured" : "Missing"} />
              <InfoTile label="Webhook key" value={COINFLOW_WEBHOOK_VALIDATION_KEY ? "Configured" : "Missing"} />
              <InfoTile label="Settlement type" value={`${COINFLOW_SETTLEMENT_TYPE} (internal provider setting)`} />
              <InfoTile label="Currency" value={COINFLOW_DEFAULT_CURRENCY} />
              <InfoTile label="Card" value={COINFLOW_ENABLE_CARD ? "Enabled" : "Disabled"} />
              <InfoTile label="Apple Pay" value={COINFLOW_ENABLE_APPLE_PAY ? "Enabled" : "Disabled"} />
              <InfoTile label="Google Pay" value={COINFLOW_ENABLE_GOOGLE_PAY ? "Enabled" : "Disabled"} />
              <InfoTile label="ACH" value={COINFLOW_ENABLE_ACH ? "Enabled" : "Disabled"} />
              <InfoTile label="SEPA" value={COINFLOW_ENABLE_SEPA ? "Enabled" : "Disabled"} />
              <InfoTile label="UK Faster Payments" value={COINFLOW_ENABLE_UK_FASTER_PAYMENTS ? "Enabled" : "Disabled"} />
              <InfoTile label="PIX" value={COINFLOW_ENABLE_PIX ? "Enabled" : "Disabled"} />
            </div>
          </div>
        ) : null}
        {usdOnly ? (
          <p className="rounded-[14px] border border-sky-300/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
            {gate.publicName} supports USD payments only. EUR is disabled and cannot be
            enabled from this panel yet.
          </p>
        ) : null}
        <div>
          <Button type="submit">Save Gate Limits</Button>
        </div>
      </form>
    </section>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-line bg-panel-strong px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted">{label}</div>
      <div className="mt-2 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

export default async function AdminProvidersPage({
  searchParams,
}: AdminProvidersPageProps) {
  return withPerf("route=/admin/providers", async () => {
    const params = await searchParams;
    const providers = await getAdminPaymentProviders();
  const saved = params.saved === "1";
    const wertSynced = params.wertSynced === "1";
    const error = typeof params.error === "string" ? params.error : null;

    return (
      <AdminShell
        active="providers"
        description="Configure payment gate deposit limits and currency support."
        title="Payment Providers"
      >
        <div className="space-y-5">
          {saved ? (
            <div className="rounded-[16px] border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              Payment gate limits saved.
            </div>
          ) : null}
          {wertSynced ? (
            <div className="rounded-[16px] border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              Wert order synced from Data API.
            </div>
          ) : null}
          {error ? (
            <div className="rounded-[16px] border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}
          {providers.map((provider) => (
            <ProviderLimitCard gate={provider} key={provider.providerKey} />
          ))}
        </div>
      </AdminShell>
    );
  });
}
