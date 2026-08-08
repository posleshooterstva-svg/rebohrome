"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatCurrency,
  formatDisplayDateTime,
  type ActivePaymentSessionRecord,
} from "@/lib/rebohrome-data";

type ActivePaymentSessionCardProps = {
  session: ActivePaymentSessionRecord;
};

export function ActivePaymentSessionCard({
  session,
}: ActivePaymentSessionCardProps) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<"check" | "cancel" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState(session.status);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [isFinal, setIsFinal] = useState(false);

  const fetchSessionStatus = useCallback(async () => {
    const response = await fetch(
      `/api/payments/session-status?sessionId=${encodeURIComponent(session.id)}&type=${encodeURIComponent(session.type)}`,
      { cache: "no-store" },
    );
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      status?: string | null;
      transactionStatus?: string | null;
      lastCheckedAt?: string | null;
      message?: string;
      final?: boolean;
    };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Unable to check payment status.");
    }

    setLiveStatus(payload.transactionStatus ?? payload.status ?? session.status);
    setLastCheckedAt(payload.lastCheckedAt ?? null);
    if (payload.message) {
      setMessage(payload.message);
    }
    if (payload.final) {
      setIsFinal(true);
      router.refresh();
    }

    return payload;
  }, [router, session.id, session.status, session.type]);

  useEffect(() => {
    let canceled = false;
    const startedAt = Date.now();
    const maxDurationMs = 3 * 60 * 1000;
    let timeoutId: number | null = null;

    async function poll() {
      if (canceled || isFinal || Date.now() - startedAt > maxDurationMs) {
        return;
      }

      if (document.visibilityState === "hidden") {
        timeoutId = window.setTimeout(poll, 30_000);
        return;
      }

      let final = false;
      try {
        const payload = await fetchSessionStatus();
        final = Boolean(payload.final);
      } catch (error) {
        if (!canceled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Still waiting for provider confirmation.",
          );
        }
      }

      if (!canceled && !final && !isFinal) {
        timeoutId = window.setTimeout(poll, 30_000);
      }
    }

    timeoutId = window.setTimeout(poll, 10_000);
    return () => {
      canceled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [fetchSessionStatus, isFinal, session.id, session.type]);

  async function runStatusCheck() {
    setBusyAction("check");
    setMessage(null);
    try {
      const response = await fetch("/api/payments/check-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, type: session.type }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to check payment status.");
      }
      setLiveStatus(payload.transactionStatus ?? payload.status ?? session.status);
      setLastCheckedAt(payload.lastCheckedAt ?? null);
      setIsFinal(Boolean(payload.final));
      setMessage(payload.message ?? "Payment status refreshed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to check payment status.");
    } finally {
      setBusyAction(null);
    }
  }

  async function cancelSession() {
    setBusyAction("cancel");
    setMessage(null);
    try {
      const response = await fetch("/api/payments/cancel-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, type: session.type }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to cancel payment session.");
      }
      setMessage("Payment session canceled. You can create a new payment now.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to cancel payment session.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="rounded-[20px] border border-amber-300/25 bg-amber-400/[0.07] p-5 shadow-[0_24px_70px_rgba(245,158,11,0.08)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
            <AlertCircle className="size-4" />
            Active Payment Session
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Complete the payment or check its status.
          </p>
          <div className="mt-4 grid gap-2 text-sm text-muted sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="block text-[11px] uppercase tracking-[0.18em] text-muted">
                Amount
              </span>
              <span className="text-foreground">
                {formatCurrency(session.amount, session.currency)}
              </span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-[0.18em] text-muted">
                Provider
              </span>
              <span className="text-foreground">{session.provider}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-[0.18em] text-muted">
                Status
              </span>
              <span className="text-foreground">{liveStatus}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-[0.18em] text-muted">
                Last check
              </span>
              <span className="text-foreground">
                {lastCheckedAt ? formatDisplayDateTime(lastCheckedAt) : "Checking..."}
              </span>
            </div>
            <div className="lg:col-start-4">
              <span className="block text-[11px] uppercase tracking-[0.18em] text-muted">
                Created
              </span>
              <span className="text-foreground">
                {formatDisplayDateTime(session.createdAt)}
              </span>
            </div>
          </div>
          {message ? (
            <p className="mt-4 rounded-[12px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-muted">
              {message}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {session.paymentUrl ? (
            <Button
              onClick={() => window.open(session.paymentUrl!, "_blank")}
              size="sm"
              type="button"
            >
              Continue payment
              <ExternalLink className="size-4" />
            </Button>
          ) : null}
          <Button
            disabled={busyAction !== null}
            onClick={runStatusCheck}
            size="sm"
            type="button"
            variant="secondary"
          >
            <RefreshCw className="size-4" />
            {busyAction === "check" ? "Checking..." : "Check status"}
          </Button>
          <Button
            disabled={busyAction !== null}
            onClick={cancelSession}
            size="sm"
            type="button"
            variant="destructive"
          >
            <XCircle className="size-4" />
            {busyAction === "cancel" ? "Canceling..." : "Cancel session"}
          </Button>
        </div>
      </div>
    </section>
  );
}
