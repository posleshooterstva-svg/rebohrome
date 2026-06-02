"use client";

import { useState } from "react";
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

  async function runStatusCheck() {
    setBusyAction("check");
    setMessage(null);
    try {
      const response = await fetch("/api/payments/check-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: session.type }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to check payment status.");
      }
      setMessage("Payment status refreshed. Balance updates automatically after provider confirmation.");
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
            This payment is still being verified. You can continue it, refresh
            its status, cancel it locally, or create another payment if needed.
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
              <span className="text-foreground">{session.status}</span>
            </div>
            <div>
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
              onClick={() => window.open(session.paymentUrl!, "_blank", "noreferrer")}
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
