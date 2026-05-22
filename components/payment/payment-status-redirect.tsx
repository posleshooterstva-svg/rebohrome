"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type PaymentStatusRedirectProps = {
  tx: string;
  title: string;
  description: string;
  fallbackHref: string;
  fallbackLabel: string;
};

type RefreshStatusResponse = {
  ok: boolean;
  target?: string | null;
  authRequired?: boolean;
  loginPath?: string;
  error?: string;
};

export function PaymentStatusRedirect({
  tx,
  title,
  description,
  fallbackHref,
  fallbackLabel,
}: PaymentStatusRedirectProps) {
  const router = useRouter();
  const [message, setMessage] = useState(description);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!tx) {
      setBusy(false);
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        const response = await fetch("/api/payments/refresh-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tx }),
        });
        const payload = (await response.json()) as RefreshStatusResponse;

        if (cancelled) {
          return;
        }

        if (payload.authRequired && payload.loginPath) {
          router.replace(payload.loginPath);
          return;
        }

        if (payload.ok && payload.target) {
          router.replace(payload.target);
          return;
        }

        setMessage(payload.error || "We could not verify this payment yet.");
      } catch {
        if (!cancelled) {
          setMessage("We could not verify this payment yet.");
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [router, tx]);

  return (
    <main className="mx-auto flex min-h-[72vh] w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-3xl rounded-[34px] border border-line bg-panel px-6 py-10 text-center shadow-panel sm:px-8">
        <p className="text-xs uppercase tracking-[0.32em] text-[var(--accent)]">
          Secure Payment
        </p>
        <h1 className="mt-5 display-font text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
          {title}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
          {message}
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            className="inline-flex min-w-[220px] items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#111827,#7266ff)] px-5 py-3 text-sm font-medium text-white transition hover:translate-y-[-1px]"
            href={fallbackHref}
          >
            {busy ? "Checking payment status..." : fallbackLabel}
          </Link>
          <button
            className="inline-flex min-w-[220px] items-center justify-center rounded-2xl border border-line bg-panel px-5 py-3 text-sm font-medium text-foreground transition hover:bg-[var(--foreground-soft)]"
            onClick={() => router.refresh()}
            type="button"
          >
            Refresh page
          </button>
        </div>
      </section>
    </main>
  );
}
