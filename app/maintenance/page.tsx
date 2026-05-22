import Link from "next/link";
import { ArrowRight, Headset, Sparkles } from "lucide-react";
import { RebohromeLogo } from "@/components/rebohrome/logo";
import { Button } from "@/components/ui/button";
import { getMaintenanceModeConfig } from "@/lib/db/repository";
import { formatDisplayDateTime } from "@/lib/rebohrome-data";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const maintenance = await getMaintenanceModeConfig();
  const title = maintenance.title;
  const message = maintenance.message;
  const estimatedReturn = maintenance.estimatedReturnAt
    ? formatDisplayDateTime(maintenance.estimatedReturnAt)
    : null;

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,rgba(139,124,255,0.12),transparent_30%),linear-gradient(180deg,#fdfdff_0%,#f7f7fb_52%,#f5f6fa_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-6xl flex-col justify-between">
        <div className="flex justify-center sm:justify-start">
          <RebohromeLogo />
        </div>

        <div className="grid items-center gap-8 lg:grid-cols-[0.88fr_1.12fr]">
          <section className="order-2 lg:order-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(139,124,255,0.16)] bg-[rgba(139,124,255,0.08)] px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">
              <Sparkles className="size-3.5" />
              System Status
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-[-0.06em] text-foreground sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-muted sm:text-lg">
              {message}
            </p>
            {estimatedReturn ? (
              <div className="mt-6 rounded-[18px] border border-line bg-white/80 px-4 py-3 text-sm text-foreground shadow-[0_18px_40px_rgba(15,23,42,0.05)] backdrop-blur">
                Estimated return: <span className="font-medium">{estimatedReturn}</span>
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild type="button">
                <Link href="/contact">
                  <Headset className="size-4" />
                  Contact Support
                </Link>
              </Button>
            </div>
          </section>

          <section className="order-1 lg:order-2">
            <div className="relative mx-auto flex min-h-[440px] w-full max-w-[560px] items-center justify-center overflow-hidden rounded-[32px] border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(247,248,252,0.94))] p-8 shadow-[0_34px_80px_rgba(15,23,42,0.08)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(139,124,255,0.16),transparent_28%),radial-gradient(circle_at_50%_80%,rgba(255,255,255,0.86),transparent_24%)]" />
              <div className="pointer-events-none absolute left-1/2 top-[18%] h-40 w-40 -translate-x-1/2 rounded-full border border-[rgba(139,124,255,0.14)] bg-[radial-gradient(circle,rgba(255,255,255,0.98),rgba(240,240,255,0.78))] shadow-[0_0_80px_rgba(139,124,255,0.14)]" />
              <div className="pointer-events-none absolute left-1/2 top-[16%] h-56 w-56 -translate-x-1/2 rounded-full border border-[rgba(139,124,255,0.08)]" />
              <div className="pointer-events-none absolute left-1/2 top-[12%] h-72 w-72 -translate-x-1/2 rounded-full border border-[rgba(139,124,255,0.06)]" />

              <div className="relative z-10 flex w-full max-w-[320px] flex-col items-center gap-6">
                <div className="rounded-full border border-white/90 bg-white/88 px-4 py-1.5 text-[11px] uppercase tracking-[0.22em] text-muted shadow-[0_12px_24px_rgba(15,23,42,0.04)]">
                  Archive Maintenance
                </div>

                <div className="relative w-full">
                  <div className="absolute inset-x-[14%] bottom-[-20px] h-12 rounded-full bg-[radial-gradient(circle_at_center,rgba(131,146,184,0.22),transparent_72%)] blur-2xl" />
                  <div className="mx-auto h-[240px] w-[188px] rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,246,251,0.94))] p-3 shadow-[0_30px_56px_rgba(15,23,42,0.08)]">
                    <div className="flex h-full items-center justify-center rounded-[16px] border border-[rgba(228,232,243,0.96)] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.96),rgba(244,246,251,0.9)_56%,rgba(237,240,247,0.94)_100%)]">
                      <div className="relative flex size-24 items-center justify-center">
                        <div className="absolute inset-0 rotate-45 rounded-[26px] border border-[rgba(139,124,255,0.18)] bg-[rgba(139,124,255,0.08)]" />
                        <div className="absolute inset-[14px] rotate-45 rounded-[18px] border border-white bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(232,228,255,0.94))]" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mx-auto h-10 w-[78%] rounded-b-[14px] border border-line bg-[linear-gradient(180deg,#ffffff_0%,#eceff5_100%)] shadow-[0_8px_18px_rgba(15,23,42,0.05)]" />

                <div className="w-full rounded-[22px] border border-white/84 bg-white/86 px-5 py-4 shadow-[0_18px_34px_rgba(15,23,42,0.06)] backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.24em] text-muted">
                        Archive Status
                      </div>
                      <div className="mt-2 text-base font-semibold tracking-[-0.03em] text-foreground">
                        Scheduled service window
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)]">
                      Calm
                      <ArrowRight className="size-4" />
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    Core services are being prepared for a clean return. Payments and
                    system callbacks stay protected while the public archive is paused.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
