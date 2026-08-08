"use client";

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

function normalizeStatusText(step: LoadingStep, title?: string) {
  const value = (title ?? "").toLowerCase();

  if (step === "redirect" || value.includes("opening")) {
    return "Opening checkout...";
  }

  if (step === "verifying" || value.includes("verify")) {
    return "Verifying securely...";
  }

  return "Processing securely...";
}

export function PremiumLoadingSystem({
  step = "payment",
  title,
  subtitle,
  compact = false,
  fullScreen = true,
}: PremiumLoadingSystemProps) {
  const statusText = normalizeStatusText(step, title ?? subtitle);

  return (
    <section
      aria-busy="true"
      aria-label={statusText}
      aria-live="polite"
      className={cn(
        "payment-loading-surface",
        fullScreen
          ? "is-fullscreen fixed inset-0 z-[240] flex min-h-dvh w-full items-center justify-center px-4 py-6"
          : "is-inline relative flex min-h-[420px] w-full items-center justify-center rounded-[28px] px-4 py-10",
      )}
      role="status"
    >
      <div className="payment-loading-backdrop" />
      <div className="payment-loading-glow" />
      <div
        className={cn(
          "payment-loading-card",
          compact ? "min-h-[300px] max-w-[520px]" : "min-h-[340px] max-w-[600px]",
        )}
      >
        <div className="payment-loading-mark" aria-hidden="true">
          R
        </div>
        <div className="payment-loading-bar" aria-hidden="true">
          <span />
        </div>
        <p className="payment-loading-text">{statusText}</p>
      </div>
    </section>
  );
}
