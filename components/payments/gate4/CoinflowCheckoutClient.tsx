"use client";

import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { CoinflowPurchase } from "@coinflowlabs/react";
import { Currency } from "@coinflowlabs/react/build/esm/common/types/Subtotal";
import { PremiumLoadingSystem } from "@/components/rebohrome/premium-loading-system";

type CheckoutTokenResponse =
  | {
      ok: true;
      session: {
        id: string;
        amount: number;
        amountCents: number;
        currency: "USD";
        status: string;
      };
      coinflow: {
        merchantId: string;
        env: "prod" | "sandbox";
        sessionKey: string;
        checkoutJwtToken: string;
        subtotal: {
          cents: number;
          currency: "USD";
        };
        email: string;
        settlementType: string;
        webhookInfo: Record<string, unknown>;
        chargebackProtectionData: Array<Record<string, unknown>>;
        enableApplePay: boolean;
        enableGooglePay: boolean;
        enableCard: boolean;
        enableAch: boolean;
        enableSepa: boolean;
        enableUkFasterPayments: boolean;
        enablePix: boolean;
      };
    }
  | { ok: false; error?: string };

type StatusResponse =
  | {
      ok: true;
      status: string;
      amount: number;
      currency: "USD";
      credited: boolean;
      environment: "prod" | "sandbox";
      message: string;
    }
  | { ok: false; error?: string };

const terminalStatuses = new Set([
  "settled",
  "declined",
  "failed",
  "expired",
  "refunded",
  "chargeback_opened",
  "chargeback_lost",
  "chargeback_won",
]);

const CoinflowPurchaseRuntime = CoinflowPurchase as unknown as ComponentType<
  Record<string, unknown>
>;

export function CoinflowCheckoutClient({ sessionId }: { sessionId: string }) {
  const [token, setToken] = useState<CheckoutTokenResponse | null>(null);
  const [message, setMessage] = useState("Preparing secure card checkout...");
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [widgetHeight, setWidgetHeight] = useState(760);

  useEffect(() => {
    let canceled = false;

    async function loadToken() {
      try {
        const response = await fetch(
          `/api/payments/gate4/session/${encodeURIComponent(sessionId)}/checkout-token`,
        );
        const payload = (await response.json()) as CheckoutTokenResponse;
        if (!canceled) {
          setToken(payload);
          if (!payload.ok) {
            setMessage(payload.error ?? "Gate #4 checkout could not be prepared.");
          } else {
            setMessage("Secure checkout is ready.");
          }
        }
      } catch {
        if (!canceled) {
          setMessage("Gate #4 checkout could not be prepared.");
        }
      }
    }

    void loadToken();
    return () => {
      canceled = true;
    };
  }, [loadAttempt, sessionId]);

  useEffect(() => {
    if (!paymentSubmitted) {
      return;
    }

    let stopped = false;
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(
          `/api/payments/gate4/session/${encodeURIComponent(sessionId)}/status`,
        );
        const payload = (await response.json()) as StatusResponse;
        if (!payload.ok || stopped) {
          return;
        }
        setMessage(payload.message);
        if (terminalStatuses.has(payload.status)) {
          window.clearInterval(interval);
        }
      } catch {
        setMessage("Waiting for secure card payment confirmation...");
      }
    }, 4000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [paymentSubmitted, sessionId]);

  if (!token) {
    return <CheckoutShell message={message} />;
  }

  if (!token.ok) {
    return (
      <CheckoutShell
        message={message}
        onRetry={() => {
          setToken(null);
          setMessage("Preparing secure card checkout...");
          setLoadAttempt((value) => value + 1);
        }}
        tone="error"
      />
    );
  }

  const coinflow = token.coinflow;

  return (
    <div className="space-y-4">
      <StatusCard message={message} tone={paymentSubmitted ? "pending" : "ready"} />
      <div
        className="coinflow-widget-shell w-full rounded-[24px] border border-line bg-white p-3 text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] sm:p-4"
        style={{ height: `${Math.max(widgetHeight, 760)}px` }}
      >
        <div
          className="coinflow-widget-frame h-full w-full"
          style={{ height: `${Math.max(widgetHeight, 760)}px` }}
        >
          <CoinflowPurchaseRuntime
            allowedPaymentMethods={["card"]}
            chargebackProtectionData={coinflow.chargebackProtectionData as never}
            disableApplePay={!coinflow.enableApplePay}
            disableGooglePay={!coinflow.enableGooglePay}
            email={coinflow.email}
            env={coinflow.env}
            handleHeightChange={(height: unknown) => {
              const nextHeight = Number.parseInt(String(height), 10);
              if (Number.isFinite(nextHeight) && nextHeight > 0) {
                setWidgetHeight(Math.max(nextHeight + 48, 760));
              }
            }}
            jwtToken={coinflow.checkoutJwtToken}
            merchantId={coinflow.merchantId}
            onSuccess={() => {
              console.info(`[COINFLOW_GATE4][${coinflow.env}][card] frontend_success_received`, {
                sessionId,
              });
              setPaymentSubmitted(true);
              setMessage("Card payment submitted. Waiting for secure confirmation...");
            }}
            sessionKey={coinflow.sessionKey}
            settlementType={coinflow.settlementType as never}
            subtotal={{
              cents: coinflow.subtotal.cents,
              currency: Currency.USD,
            }}
            webhookInfo={coinflow.webhookInfo}
          />
        </div>
      </div>
    </div>
  );
}

function CheckoutShell({
  message,
  tone = "ready",
  onRetry,
}: {
  message: string;
  tone?: "ready" | "pending" | "error";
  onRetry?: () => void;
}) {
  const isError = tone === "error";

  return (
    <div className="space-y-4">
      <StatusCard message={message} tone={tone} />
      <div className="relative flex min-h-[620px] w-full flex-col items-center justify-center overflow-hidden rounded-[24px] border border-line bg-[#080b16] p-6 text-center text-slate-950 max-sm:min-h-[700px]">
        {isError ? (
          <div className="mx-auto max-w-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-2xl font-semibold text-violet-700">
              !
            </div>
            <h3 className="mt-5 text-xl font-semibold text-white">
              Checkout could not be opened.
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Please try again or return to deposit.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950"
                onClick={onRetry}
                type="button"
              >
                Try again
              </button>
              <a
                className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white"
                href="/dashboard/deposit"
              >
                Back to deposit
              </a>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-[620px]">
            <PremiumLoadingSystem compact fullScreen={false} step="payment" />
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCard({
  message,
  tone = "ready",
}: {
  message: string;
  tone?: "ready" | "pending" | "error";
}) {
  const toneClass =
    tone === "error"
      ? "border-rose-300/20 bg-rose-500/10 text-rose-100"
      : tone === "pending"
        ? "border-amber-300/20 bg-amber-500/10 text-amber-100"
        : "border-emerald-300/20 bg-emerald-500/10 text-emerald-100";

  return (
    <div className={`rounded-[18px] border px-4 py-3 text-sm ${toneClass}`}>
      {message}
    </div>
  );
}
