"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type WertGateCheckoutClientProps = {
  sessionId: string;
  widgetOptions: Record<string, unknown> | null;
  contractAddress: string | null;
  contractOrderId: string | null;
  recipientWallet: string | null;
};

const REQUIRED_WERT_FIELDS = [
  "partner_id",
  "origin",
  "click_id",
  "address",
  "commodity",
  "commodity_amount",
  "network",
  "sc_address",
  "sc_input_data",
  "signature",
] as const;

function getMissingFields(widgetOptions: Record<string, unknown> | null) {
  if (!widgetOptions) {
    return [...REQUIRED_WERT_FIELDS];
  }

  return REQUIRED_WERT_FIELDS.filter((field) => {
    const value = widgetOptions[field];
    return value === null || value === undefined || String(value).trim() === "";
  });
}

export function WertGateCheckoutClient({
  sessionId,
  widgetOptions,
  contractAddress,
  contractOrderId,
  recipientWallet,
}: WertGateCheckoutClientProps) {
  const [openError, setOpenError] = useState<string | null>(null);
  const [status, setStatus] = useState("created");
  const [message, setMessage] = useState("Waiting for Wert checkout...");
  const missingFields = useMemo(() => getMissingFields(widgetOptions), [widgetOptions]);

  useEffect(() => {
    let mounted = true;

    async function pollStatus() {
      try {
        const response = await fetch(
          `/api/payments/session-status?sessionId=${encodeURIComponent(sessionId)}&type=deposit`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          status?: string | null;
          message?: string | null;
        };

        if (!mounted) {
          return;
        }

        setStatus(payload.status ?? "pending");
        setMessage(payload.message ?? "Checking Wert payment status...");
      } catch {
        if (mounted) {
          setMessage("Status check is temporarily unavailable.");
        }
      }
    }

    void pollStatus();
    const intervalId = window.setInterval(pollStatus, 5_000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [sessionId]);

  useEffect(() => {
    if (missingFields.length > 0 || !widgetOptions) {
      setOpenError(
        `Gate #3 checkout could not be prepared. Missing: ${missingFields.join(", ")}.`,
      );
      return;
    }

    const safeWidgetOptions = widgetOptions;
    let cancelled = false;

    async function openWidget() {
      try {
        const wertModule = await import("@wert-io/widget-initializer");
        const WertWidget = (wertModule.default ?? wertModule) as unknown as new (
          options: Record<string, unknown>,
        ) => { open: () => void };

        if (cancelled) {
          return;
        }

        const widget = new WertWidget(safeWidgetOptions);
        widget.open();
      } catch (error) {
        console.error("Unable to open Wert checkout.", error);
        if (!cancelled) {
          setOpenError("Gate #3 checkout could not be opened. Please try again.");
        }
      }
    }

    void openWidget();

    return () => {
      cancelled = true;
    };
  }, [missingFields, widgetOptions]);

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-4xl items-center px-4 py-10">
      <div className="w-full rounded-[28px] border border-violet-300/20 bg-[rgba(12,16,32,0.92)] p-6 text-white shadow-[0_28px_90px_rgba(0,0,0,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-violet-200">
          Gate #3 - Wert.io
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Smart-contract checkout
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
          Wert checkout opens separately while ReboHrome verifies the order
          server-side through webhook and Data API before any financial update.
        </p>

        {openError ? (
          <div className="mt-6 rounded-[16px] border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {openError}
          </div>
        ) : (
          <div className="mt-6 rounded-[16px] border border-emerald-300/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Wert checkout is prepared. Complete payment in the secure widget.
          </div>
        )}

        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-[16px] border border-white/10 bg-white/[0.04] p-4">
            <dt className="text-slate-400">Session</dt>
            <dd className="mt-1 break-all font-mono text-xs">{sessionId}</dd>
          </div>
          <div className="rounded-[16px] border border-white/10 bg-white/[0.04] p-4">
            <dt className="text-slate-400">Status</dt>
            <dd className="mt-1 font-semibold uppercase">{status}</dd>
          </div>
          <div className="rounded-[16px] border border-white/10 bg-white/[0.04] p-4">
            <dt className="text-slate-400">Contract</dt>
            <dd className="mt-1 break-all font-mono text-xs">
              {contractAddress ?? "Not configured"}
            </dd>
          </div>
          <div className="rounded-[16px] border border-white/10 bg-white/[0.04] p-4">
            <dt className="text-slate-400">Recipient wallet</dt>
            <dd className="mt-1 break-all font-mono text-xs">
              {recipientWallet ?? "Missing"}
            </dd>
          </div>
          <div className="rounded-[16px] border border-white/10 bg-white/[0.04] p-4 sm:col-span-2">
            <dt className="text-slate-400">Contract order ID</dt>
            <dd className="mt-1 break-all font-mono text-xs">
              {contractOrderId ?? "Pending"}
            </dd>
          </div>
        </dl>

        <p className="mt-5 text-sm text-slate-300">{message}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            className="min-h-12 rounded-[14px] bg-[linear-gradient(135deg,#a78bfa,#6d4df2)] px-5 py-3 text-sm font-semibold text-white"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reopen Wert checkout
          </button>
          <Link
            className="inline-flex min-h-12 items-center rounded-[14px] border border-white/10 px-5 py-3 text-sm font-semibold text-slate-200"
            href="/dashboard/deposit"
          >
            Back to deposit
          </Link>
        </div>
      </div>
    </section>
  );
}
