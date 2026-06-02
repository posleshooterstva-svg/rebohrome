"use client";

import { LockKeyhole, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type LoadingStep =
  | "syncing"
  | "verifying"
  | "vault"
  | "assigning"
  | "payment"
  | "redirect"
  | "balance";

type PremiumLoadingSystemProps = {
  step?: LoadingStep;
  title?: string;
  subtitle?: string;
  progress?: number;
  transactionId?: string | null;
  compact?: boolean;
  fullScreen?: boolean;
};

const stepMeta: Record<
  LoadingStep,
  {
    title: string;
    subtitle: string;
    status: string;
    index: number;
  }
> = {
  syncing: {
    title: "Syncing archive...",
    subtitle: "Connecting your collector profile to the archive.",
    status: "Connecting to archive nodes...",
    index: 0,
  },
  payment: {
    title: "Preparing secure payment...",
    subtitle: "Creating your TransVoucher hosted checkout session.",
    status: "Opening secure provider route...",
    index: 0,
  },
  redirect: {
    title: "Redirecting to secure payment...",
    subtitle: "You are being redirected to our payment provider.",
    status: "Provider handoff initialized...",
    index: 1,
  },
  verifying: {
    title: "Verifying payment...",
    subtitle: "Checking transaction status through the payment provider.",
    status: "Awaiting provider confirmation...",
    index: 1,
  },
  vault: {
    title: "Preparing vault...",
    subtitle: "Opening a secure vault slot for your collectible.",
    status: "Secure vault slot is opening...",
    index: 2,
  },
  assigning: {
    title: "Assigning collectible...",
    subtitle: "Finalizing ownership and updating your collection.",
    status: "Collectible assignment queued...",
    index: 3,
  },
  balance: {
    title: "Updating balance...",
    subtitle: "Your archive balance is being synchronized.",
    status: "Balance sync pending...",
    index: 2,
  },
};

const progressSteps = [
  "Syncing archive",
  "Verifying payment",
  "Preparing vault",
  "Assigning collectible",
];

export function PremiumLoadingSystem({
  step = "syncing",
  title,
  subtitle,
  progress,
  transactionId,
  compact = false,
  fullScreen = true,
}: PremiumLoadingSystemProps) {
  const meta = stepMeta[step];
  const activeIndex = meta.index;
  const fillProgress =
    typeof progress === "number"
      ? Math.min(Math.max(progress, 0), 100)
      : (activeIndex / (progressSteps.length - 1)) * 100;

  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className={cn(
        "relative isolate overflow-hidden bg-[#05070d] text-white",
        fullScreen
          ? "fixed inset-0 z-[240] min-h-screen w-full"
          : "min-h-[520px] rounded-[28px]",
        compact ? "px-4 py-10" : "px-4 py-12 sm:px-6 lg:py-14",
      )}
    >
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-10%,rgba(139,92,246,0.24),transparent_34%),radial-gradient(circle_at_12%_34%,rgba(168,85,247,0.14),transparent_28%),radial-gradient(circle_at_88%_34%,rgba(192,38,211,0.12),transparent_26%),linear-gradient(180deg,#05070d_0%,#0b1020_58%,#05070d_100%)]" />
      <div className="archive-particles absolute inset-0 -z-10 opacity-50" />
      <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-purple-300/40 to-transparent" />

      <div className="mx-auto flex min-h-[calc(100vh-7rem)] w-full max-w-7xl flex-col items-center">
        <div className="text-center">
          <div className="mx-auto text-[38px] font-black tracking-[-0.16em] text-[#9b7cff] drop-shadow-[0_0_28px_rgba(139,92,246,0.65)]">
            RH
          </div>
          <div className="mt-3 text-[13px] font-semibold uppercase tracking-[0.52em] text-slate-100">
            ReboHrome
          </div>
        </div>

        <div className="mt-10 text-center">
          <h1 className="display-font text-4xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">
            {title ?? meta.title}
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-300 sm:text-lg">
            {subtitle ?? meta.subtitle}
          </p>
        </div>

        <div className="mt-10 w-full max-w-5xl">
          <div className="relative h-1 rounded-full bg-white/12">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8b5cf6] via-[#b388ff] to-[#8b5cf6] shadow-[0_0_28px_rgba(139,92,246,0.62)] transition-all duration-700"
              style={{ width: `${fillProgress}%` }}
            />
            <div className="absolute inset-x-0 top-1/2 grid -translate-y-1/2 grid-cols-4">
              {progressSteps.map((label, index) => {
                const isActive = index === activeIndex;
                const isComplete = index < activeIndex;
                return (
                  <div key={label} className="relative flex justify-center">
                    <div
                      className={cn(
                        "size-9 rounded-full border bg-[#111827] p-1 shadow-[0_0_0_6px_rgba(255,255,255,0.03)] transition",
                        isActive
                          ? "border-[#b388ff] shadow-[0_0_34px_rgba(139,92,246,0.72)]"
                          : isComplete
                            ? "border-[#8b5cf6]"
                            : "border-white/16",
                      )}
                    >
                      <div
                        className={cn(
                          "size-full rounded-full",
                          isActive || isComplete ? "bg-[#9b7cff]" : "bg-slate-500",
                          isActive ? "archive-node-pulse" : "",
                        )}
                      />
                    </div>
                    <div
                      className={cn(
                        "absolute top-12 w-36 text-center text-sm",
                        isActive ? "text-[#c4a7ff]" : "text-slate-400",
                      )}
                    >
                      {label}...
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-24 grid w-full flex-1 items-center gap-8 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
          <div className="hidden rounded-[18px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl lg:block">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
              Transaction status
            </div>
            <div className="mt-4 h-px bg-white/10" />
            <div className="mt-4 flex items-center gap-3 text-sm text-slate-100">
              <span className="size-2.5 rounded-full bg-[#b388ff] shadow-[0_0_20px_rgba(179,136,255,0.8)]" />
              <span>{meta.status}</span>
            </div>
            {transactionId ? (
              <div className="mt-4 rounded-[12px] border border-white/10 bg-black/18 px-3 py-2 text-xs text-slate-400">
                ID {transactionId}
              </div>
            ) : null}
          </div>

          <div className="relative mx-auto flex min-h-[360px] w-full max-w-[520px] items-end justify-center">
            <div className="archive-card-float relative z-10 mb-20 h-[270px] w-[190px] rounded-[22px] border border-[#b388ff]/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.14),rgba(139,92,246,0.08)_42%,rgba(2,6,23,0.55))] p-4 shadow-[0_0_70px_rgba(139,92,246,0.44)] backdrop-blur-xl">
              <div className="absolute inset-3 rounded-[16px] border border-white/14" />
              <div className="relative flex h-full flex-col items-center justify-center text-center">
                <div className="text-[42px] font-black tracking-[-0.16em] text-[#9b7cff] drop-shadow-[0_0_26px_rgba(139,92,246,0.75)]">
                  RH
                </div>
                <div className="mt-4 text-[11px] uppercase tracking-[0.38em] text-white">
                  ReboHrome
                </div>
                <div className="mt-8 text-[10px] uppercase tracking-[0.22em] text-slate-400">
                  Digital collectible
                </div>
                <div className="mt-3 w-full rounded-[9px] border border-white/12 bg-black/18 px-3 py-2 text-left text-[10px] text-slate-300">
                  <div className="text-slate-500">ID</div>
                  <div>RH-2026-001</div>
                </div>
              </div>
            </div>
            <div className="absolute bottom-10 h-24 w-[360px] rounded-[100%] border border-[#b388ff]/30 bg-[radial-gradient(circle_at_center,rgba(179,136,255,0.46),rgba(139,92,246,0.14)_35%,transparent_68%)] blur-[2px]" />
            <div className="archive-ring absolute bottom-8 h-20 w-[420px] rounded-[100%] border border-[#b388ff]/24" />
            <div className="archive-ring archive-ring-delay absolute bottom-14 h-12 w-[280px] rounded-[100%] border border-[#b388ff]/28" />
          </div>

          <div className="rounded-[18px] border border-white/10 bg-white/[0.045] p-5 text-sm text-slate-300 backdrop-blur-xl lg:hidden">
            <div className="flex items-center gap-3">
              <span className="size-2.5 rounded-full bg-[#b388ff]" />
              <span>{meta.status}</span>
            </div>
          </div>
        </div>

        <div className="mt-auto flex items-center gap-2 pb-2 text-sm text-slate-400">
          <LockKeyhole className="size-4" />
          <span>Secure. Encrypted. Verified.</span>
          <ShieldCheck className="size-4 text-[#9b7cff]" />
        </div>
      </div>
    </section>
  );
}
