"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PaymentStatusRefreshButtonProps = {
  tx: string;
  label?: string;
};

type RefreshStatusResponse = {
  ok: boolean;
  target?: string | null;
  authRequired?: boolean;
  loginPath?: string;
  error?: string;
};

export function PaymentStatusRefreshButton({
  tx,
  label = "Refresh payment status",
}: PaymentStatusRefreshButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/payments/refresh-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tx }),
      });
      const payload = (await response.json()) as RefreshStatusResponse;

      if (payload.authRequired && payload.loginPath) {
        router.replace(payload.loginPath);
        return;
      }

      if (payload.ok && payload.target) {
        router.replace(payload.target);
        return;
      }

      setError(payload.error || "Unable to refresh payment status yet.");
    } catch {
      setError("Unable to refresh payment status yet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        className="inline-flex min-w-[220px] items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#111827,#7266ff)] px-5 py-3 text-sm font-medium text-white transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy}
        onClick={handleClick}
        type="button"
      >
        {busy ? "Refreshing..." : label}
      </button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
