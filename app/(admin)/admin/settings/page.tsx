import { saveMaintenanceModeAction } from "@/app/actions/marketplace";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import { Button } from "@/components/ui/button";
import { getMaintenanceModeConfig } from "@/lib/db/repository";
import { formatDisplayDateTime } from "@/lib/rebohrome-data";

type AdminSettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return formatter.format(date).replace(" ", "T");
}

export default async function AdminSettingsPage({
  searchParams,
}: AdminSettingsPageProps) {
  const params = await searchParams;
  const maintenance = await getMaintenanceModeConfig();
  const wasSaved = params.saved === "1";
  const error =
    typeof params.error === "string" && params.error.trim().length > 0
      ? params.error
      : null;

  return (
    <AdminShell
      active="settings"
      title="System Settings"
      description="Platform-wide controls live here so admins can stage maintenance, protect integrations, and keep public routes predictable during operational work."
    >
      {wasSaved ? (
        <div className="mb-6 rounded-[20px] border border-emerald-300/50 bg-emerald-100/70 px-4 py-3 text-sm text-emerald-700">
          Maintenance settings updated successfully.
        </div>
      ) : null}

      {error ? (
        <div className="mb-6 rounded-[20px] border border-rose-300/50 bg-rose-100/70 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <form
          action={saveMaintenanceModeAction}
          className="rounded-[28px] border border-line bg-panel-strong p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-foreground">
                Maintenance Mode
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                Lock down the public archive while leaving admin access, health
                checks, and webhooks online.
              </p>
            </div>
            <div
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                maintenance.enabled
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {maintenance.enabled ? "Active" : "Disabled"}
            </div>
          </div>

          {maintenance.enabled ? (
            <div className="mt-5 rounded-[20px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-700">
              Public site access is currently locked for regular users.
            </div>
          ) : null}

          <div className="mt-6 grid gap-4">
            <label className="flex items-center justify-between rounded-[20px] border border-line bg-panel px-4 py-4">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Enable Maintenance Mode
                </div>
                <div className="mt-1 text-sm text-muted">
                  Public users will be redirected to the maintenance screen.
                </div>
              </div>
              <input
                className="size-5 accent-[var(--accent)]"
                defaultChecked={maintenance.enabled}
                name="enabled"
                type="checkbox"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">
                Public title
              </span>
              <input
                className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                defaultValue={maintenance.title}
                name="title"
                placeholder="We'll be back soon."
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">
                Public message
              </span>
              <textarea
                className="min-h-32 w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm leading-6 text-foreground outline-none"
                defaultValue={maintenance.message}
                name="message"
                placeholder="ReboHrome is currently undergoing scheduled maintenance. Our archive will reopen shortly."
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">
                  Estimated return
                </span>
                <input
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                  defaultValue={toDateTimeLocalValue(maintenance.estimatedReturnAt)}
                  name="estimatedReturnAt"
                  type="datetime-local"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">
                  Internal admin note
                </span>
                <input
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                  defaultValue={maintenance.internalNote ?? ""}
                  name="internalNote"
                  placeholder="Deploying payments update"
                />
              </label>
            </div>
          </div>

          <input name="redirectTo" type="hidden" value="/admin/settings" />

          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="submit">Save maintenance settings</Button>
            <Button asChild type="button" variant="secondary">
              <a href="/maintenance" rel="noreferrer" target="_blank">
                Preview maintenance page
              </a>
            </Button>
          </div>
        </form>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-line bg-panel-strong p-5">
            <div className="text-lg font-semibold text-foreground">
              Current status
            </div>
            <div className="mt-4 space-y-3">
              <StatusRow
                label="Status"
                value={maintenance.enabled ? "Active" : "Disabled"}
              />
              <StatusRow
                label="Last enabled by"
                value={maintenance.lastEnabledByUsername ?? "Never"}
              />
              <StatusRow
                label="Last updated by"
                value={maintenance.updatedByUsername ?? "Not set"}
              />
              <StatusRow
                label="Last updated at"
                value={
                  maintenance.updatedAt
                    ? formatDisplayDateTime(maintenance.updatedAt)
                    : "Not set"
                }
              />
              <StatusRow
                label="Estimated return"
                value={
                  maintenance.estimatedReturnAt
                    ? formatDisplayDateTime(maintenance.estimatedReturnAt)
                    : "Not provided"
                }
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-line bg-panel-strong p-5">
            <div className="text-lg font-semibold text-foreground">
              Public message preview
            </div>
            <div className="mt-4 rounded-[24px] border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,248,252,0.92))] p-5 shadow-[0_18px_36px_rgba(15,23,42,0.05)]">
              <div className="inline-flex rounded-full border border-[rgba(139,124,255,0.18)] bg-[rgba(139,124,255,0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">
                {maintenance.enabled ? "Maintenance Active" : "Maintenance Preview"}
              </div>
              <div className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                {maintenance.title}
              </div>
              <p className="mt-3 text-sm leading-7 text-muted">
                {maintenance.message}
              </p>
              {maintenance.estimatedReturnAt ? (
                <div className="mt-4 text-sm font-medium text-foreground">
                  Estimated return: {formatDisplayDateTime(maintenance.estimatedReturnAt)}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </AdminShell>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[16px] border border-line bg-panel px-4 py-3">
      <div className="text-sm text-muted">{label}</div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
