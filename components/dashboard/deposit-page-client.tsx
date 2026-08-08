"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, LockKeyhole, ShieldCheck } from "lucide-react";
import { CinematicLoadingOverlay } from "@/components/rebohrome/cinematic-loading-overlay";
import { PaymentSuccessModal, type PaymentSuccessRow } from "@/components/rebohrome/payment-success-modal";
import {
  type ActivePaymentSessionRecord,
  depositPaymentOptions,
  formatCurrency,
  formatDisplayDateTime,
  formatUsd,
  getPublicPaymentProviderLabel,
  type DepositRecord,
  type PaymentGateAccessRecord,
  type PaymentMethodName,
  type PaymentProviderName,
  type SupportedCurrency,
} from "@/lib/rebohrome-data";
import { useAccountExperienceStore } from "@/lib/stores/account-experience-store";

type DepositPageClientProps = {
  userId: string;
  paymentGates: PaymentGateAccessRecord[];
  gate2Details: {
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  };
  initialOutcome: {
    deposit: DepositRecord;
    transactionId: string | null;
    failureReason: string | null;
  } | null;
};

type DepositDraft = {
  selectedAmount: number;
  customAmount: string;
  paymentMethod: PaymentMethodName | "";
  currency: SupportedCurrency | "";
  provider: PaymentProviderName | "";
};

type DepositSessionResponse =
  | {
      sessionId: string;
      paymentUrl?: string | null;
      embedUrl?: string | null;
      useEmbed?: boolean;
      wertWidgetOptions?: Record<string, unknown> | null;
      redirectPath: string;
      activeSession?: ActivePaymentSessionRecord | null;
      reusedExistingSession?: boolean;
    }
  | { error?: string; requiresGate2Details?: boolean };

const DEPOSIT_DRAFT_KEY = "rebohrome-deposit-draft";
const DEPOSIT_SESSION_TIMEOUT_MS = 25_000;
const amountOptions = [50, 100, 250, 500, 1000];

export function DepositPageClient({
  userId,
  paymentGates,
  gate2Details,
  initialOutcome,
}: DepositPageClientProps) {
  const router = useRouter();
  const applyDeposit = useAccountExperienceStore((state) => state.applyDeposit);
  const [selectedAmount, setSelectedAmount] = useState(250);
  const [customAmount, setCustomAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodName | "">("");
  const [currency, setCurrency] = useState<SupportedCurrency | "">("");
  const [provider, setProvider] = useState<PaymentProviderName | "">("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showReceipt, setShowReceipt] = useState(
    initialOutcome?.deposit.status === "completed",
  );

  useEffect(() => {
    setMounted(true);
    const saved = window.sessionStorage.getItem(DEPOSIT_DRAFT_KEY);
    if (!saved) {
      return;
    }

    try {
      const draft = JSON.parse(saved) as DepositDraft;
      setSelectedAmount(draft.selectedAmount || 250);
      setCustomAmount(draft.customAmount || "");
      setPaymentMethod(draft.paymentMethod || "");
      setCurrency(draft.currency || "");
      setProvider(draft.provider || "");
    } catch {
      window.sessionStorage.removeItem(DEPOSIT_DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    window.sessionStorage.setItem(
      DEPOSIT_DRAFT_KEY,
      JSON.stringify({
        selectedAmount,
        customAmount,
        paymentMethod,
        currency,
        provider,
      } satisfies DepositDraft),
    );
  }, [currency, customAmount, mounted, paymentMethod, provider, selectedAmount]);

  useEffect(() => {
    if (!paymentMethod || !currency) {
      setProvider("");
      return;
    }

    setProvider((currentProvider) => {
      const currentGate = paymentGates.find(
        (gate) => gate.providerName === currentProvider,
      );

      if (
        currentGate?.enabled &&
        currentGate.accessEnabled &&
        currentGate.supportsCurrencies.includes(currency)
      ) {
        return currentProvider;
      }

      const firstAvailable = paymentGates.find(
        (gate) =>
          gate.enabled &&
          gate.accessEnabled &&
          gate.supportsCurrencies.includes(currency),
      );
      return firstAvailable?.providerName ?? "";
    });
  }, [currency, paymentGates, paymentMethod]);

  const amount = useMemo(() => {
    const normalized = Number(customAmount);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : selectedAmount;
  }, [customAmount, selectedAmount]);

  const availableProviders = useMemo(() => {
    if (!currency) {
      return [];
    }

    return paymentGates.map((gate) => ({
      id: gate.providerName,
      gateNumber: gate.gateNumber,
      label: gate.publicName,
      secureLabel: "Card / Apple Pay / Google Pay",
      speedLabel: "Secure hosted payment",
      supported: gate.enabled && gate.supportsCurrencies.includes(currency),
    }));
  }, [currency, paymentGates]);

  const providerVisible = Boolean(paymentMethod && currency);
  const selectedGate = paymentGates.find((gate) => gate.providerName === provider);
  const amountLimitError =
    selectedGate && amount < selectedGate.minAmount
      ? `Minimum deposit for ${selectedGate.publicName} is ${formatCurrency(selectedGate.minAmount, "USD")}.`
      : selectedGate && selectedGate.maxAmount !== null && amount > selectedGate.maxAmount
        ? `Maximum deposit for ${selectedGate.publicName} is ${formatCurrency(selectedGate.maxAmount, "USD")}.`
        : null;
  const selectedGateRequiresDetails =
    selectedGate?.providerKey === "cleffo" &&
    (!gate2Details.firstName ||
      !gate2Details.lastName ||
      !/^\d{8,15}$/.test((gate2Details.phone ?? "").replace(/\D/g, "")));
  const continueLabel = provider ? "Continue to secure payment" : "Select payment provider";
  const failureNotice =
    initialOutcome?.deposit.status === "failed"
      ? initialOutcome.failureReason || "Payment was declined by the issuing bank."
      : null;
  const receiptRows: PaymentSuccessRow[] =
    initialOutcome && initialOutcome.deposit.status === "completed"
      ? [
          {
            label: "Deposit ID",
            value: initialOutcome.deposit.id,
            icon: "receipt",
          },
          {
            label: "Local Transaction ID",
            value: initialOutcome.transactionId ?? "Pending",
            icon: "transaction",
          },
          {
            label: "Provider Transaction ID",
            value: initialOutcome.deposit.transvoucherTransactionId ?? "Pending",
            icon: "transaction",
          },
          {
            label: "Paid",
            value: formatCurrency(
              initialOutcome.deposit.originalAmount ?? initialOutcome.deposit.amount,
              initialOutcome.deposit.originalCurrency ?? "USD",
            ),
            icon: "paid",
          },
          {
            label: "Credited",
            value: `+${formatUsd(
              initialOutcome.deposit.creditedAmountUsd ?? initialOutcome.deposit.amount,
            )}`,
            icon: "credited",
            tone: "accent",
          },
          {
            label: "Exchange Rate",
            value: `1 ${initialOutcome.deposit.originalCurrency ?? "USD"} = ${(
              initialOutcome.deposit.exchangeRate ?? 1
            ).toFixed(2)} USD`,
            icon: "exchange-rate",
          },
          {
            label: "Payment",
            value: initialOutcome.deposit.paymentMethod,
            icon: "payment",
          },
          {
            label: "Provider",
            value: getPublicPaymentProviderLabel(
              initialOutcome.deposit.paymentProvider,
            ),
            icon: "provider",
          },
          {
            label: "Reference ID",
            value:
              initialOutcome.deposit.transvoucherReferenceId ??
              initialOutcome.deposit.cardMasked,
            icon: "reference",
          },
          {
            label: "Updated Balance",
            value: formatUsd(initialOutcome.deposit.balanceAfter),
            icon: "wallet",
            tone: "accent",
          },
          {
            label: "Timestamp",
            value: formatDisplayDateTime(
              initialOutcome.deposit.completedAt ?? initialOutcome.deposit.createdAt,
            ),
            icon: "timestamp",
          },
          {
            label: "Status",
            value: "SUCCESS",
            icon: "status",
            tone: "success",
          },
        ]
      : [];

  useEffect(() => {
    if (!initialOutcome || initialOutcome.deposit.status !== "completed") {
      return;
    }

    applyDeposit(userId, {
      depositId: initialOutcome.deposit.id,
      originalAmount:
        initialOutcome.deposit.originalAmount ?? initialOutcome.deposit.amount,
      originalCurrency: initialOutcome.deposit.originalCurrency ?? "USD",
      creditedAmountUsd:
        initialOutcome.deposit.creditedAmountUsd ?? initialOutcome.deposit.amount,
      summary: `${initialOutcome.deposit.id} · ${formatDisplayDateTime(
        initialOutcome.deposit.completedAt ?? initialOutcome.deposit.createdAt,
      )}`,
    });
  }, [applyDeposit, initialOutcome, userId]);

  async function handleContinue() {
    if (!paymentMethod || !currency || !provider || isSubmitting || amount <= 0) {
      return;
    }

    if (amountLimitError) {
      setError(amountLimitError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (selectedGateRequiresDetails) {
        router.push("/dashboard/settings?section=payments");
        return;
      }
      const controller = new AbortController();
      const timeout = window.setTimeout(() => {
        controller.abort();
      }, DEPOSIT_SESSION_TIMEOUT_MS);
      const response = await fetch("/api/deposit/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          amount,
          paymentMethod,
          currency,
          provider,
          gateNumber: selectedGate?.gateNumber,
        }),
      }).finally(() => window.clearTimeout(timeout));

      const payload = (await response.json()) as DepositSessionResponse;
      if (!response.ok || !("redirectPath" in payload)) {
        throw new Error(
          "error" in payload ? payload.error : "Unable to initialize secure deposit.",
        );
      }

      const embedUrl = payload.embedUrl || null;
      const paymentUrl = payload.paymentUrl || payload.redirectPath;
      if (!paymentUrl) {
        throw new Error("Payment page could not be created.");
      }

      const wertWidgetOptions = payload.wertWidgetOptions ?? null;
      if (wertWidgetOptions) {
        await openWertPayment(wertWidgetOptions);
      } else if (selectedGate?.providerKey === "coinflow") {
        router.push(paymentUrl);
      } else if (payload.useEmbed && embedUrl) {
        openEmbedPayment(embedUrl);
      } else {
        window.open(paymentUrl, "_blank");
      }
      router.refresh();
    } catch (depositError) {
      if (depositError instanceof DOMException && depositError.name === "AbortError") {
        setError(
          "Payment provider is taking too long to respond. Please try again in a moment.",
        );
        return;
      }

      setError(
        depositError instanceof Error
          ? depositError.message
          : "Payment page could not be created. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function dismissOutcome() {
    setShowReceipt(false);
    setError(null);
    router.replace("/dashboard/deposit");
    router.refresh();
  }

  function continueToDashboard() {
    setShowReceipt(false);
    setError(null);
    router.push("/dashboard");
  }

  function openEmbedPayment(embedUrl: string) {
    let overlay = document.getElementById("transvoucher-iframe-overlay");
    let iframe = document.getElementById("transvoucher-iframe") as HTMLIFrameElement | null;

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "transvoucher-iframe-overlay";
      overlay.style.cssText =
        "display:none;position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:999999;";

      const closeButton = document.createElement("button");
      closeButton.id = "transvoucher-close-payment";
      closeButton.innerHTML = "&times;";
      closeButton.type = "button";
      closeButton.style.cssText =
        "position:absolute;top:14px;right:14px;width:44px;height:44px;border:0;border-radius:999px;background:#fff;color:#111;font-size:28px;line-height:44px;cursor:pointer;box-shadow:0 12px 30px rgba(0,0,0,.35);z-index:1000000;";
      closeButton.onclick = closeEmbedPayment;

      iframe = document.createElement("iframe");
      iframe.id = "transvoucher-iframe";
      iframe.style.cssText = "width:100%;height:100%;border:0;";
      iframe.setAttribute("allowpaymentrequest", "true");

      overlay.appendChild(closeButton);
      overlay.appendChild(iframe);
      document.body.appendChild(overlay);
    }

    if (!iframe) {
      iframe = document.getElementById("transvoucher-iframe") as HTMLIFrameElement | null;
    }

    if (iframe) {
      iframe.src = embedUrl;
    }

    overlay.style.display = "block";
    document.body.style.overflow = "hidden";
  }

  function closeEmbedPayment() {
    const overlay = document.getElementById("transvoucher-iframe-overlay");
    if (overlay) {
      overlay.style.display = "none";
      document.body.style.overflow = "";
    }
  }

  async function openWertPayment(widgetOptions: Record<string, unknown>) {
    try {
      const wertModule = await import("@wert-io/widget-initializer");
      const WertWidget = (wertModule.default ?? wertModule) as unknown as new (
        options: Record<string, unknown>,
      ) => { open: () => void };
      const widget = new WertWidget(widgetOptions);
      widget.open();
    } catch (widgetError) {
      console.error("Unable to open Wert widget.", widgetError);
      throw new Error("Unable to open Gate #3 checkout. Please try again.");
    }
  }

  function downloadReceipt() {
    if (!initialOutcome || initialOutcome.deposit.status !== "completed") {
      return;
    }

    const { deposit, transactionId } = initialOutcome;
    const content = [
      "REBOHROME DEPOSIT RECEIPT",
      `Deposit ID: ${deposit.id}`,
      `Local Transaction ID: ${transactionId ?? "Pending"}`,
      `Provider Transaction ID: ${deposit.transvoucherTransactionId ?? "Pending"}`,
      `Paid Amount: ${formatCurrency(deposit.originalAmount ?? deposit.amount, deposit.originalCurrency ?? "USD")}`,
      `Credited Amount: +${formatUsd(deposit.creditedAmountUsd ?? deposit.amount)}`,
      `Exchange Rate: 1 ${deposit.originalCurrency ?? "USD"} = ${(deposit.exchangeRate ?? 1).toFixed(2)} USD`,
      `Payment Method: ${deposit.paymentMethod}`,
      `Provider: ${getPublicPaymentProviderLabel(deposit.paymentProvider)}`,
      `Reference ID: ${deposit.transvoucherReferenceId ?? deposit.cardMasked}`,
      `Updated Balance: ${formatUsd(deposit.balanceAfter)}`,
      `Timestamp: ${formatDisplayDateTime(deposit.completedAt ?? deposit.createdAt)}`,
      "Status: SUCCESS",
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${deposit.id}-receipt.txt`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <>
      <CinematicLoadingOverlay
        description="We are opening the secure provider environment and preparing your archive balance update."
        open={isSubmitting}
        title="Preparing Deposit"
      />
      <section className="space-y-5">
        <div>
          <h1 className="display-font text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
            Deposit
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted">
            Add funds securely.
          </p>
        </div>

        {failureNotice ? (
          <div className="rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {failureNotice}
          </div>
        ) : null}

        <div className="rounded-[16px] border border-line bg-white p-5">
          <StepHeader number="1" title="Select amount" />
          <div className="mt-5 grid gap-3 xl:grid-cols-5">
            {amountOptions.map((option) => (
              <AmountCard
                key={option}
                active={option === selectedAmount && !customAmount}
                label={formatCurrency(option, (currency || "USD") as SupportedCurrency)}
                onClick={() => {
                  setSelectedAmount(option);
                  setCustomAmount("");
                }}
              />
            ))}
          </div>
          <div className="mt-4 flex min-w-0 items-center rounded-[14px] border border-line bg-white px-4">
            <span className="text-lg text-muted">
              {currency === "USD" ? "$" : "EUR"}
            </span>
            <input
              className="w-full bg-transparent px-3 py-4 text-sm text-foreground outline-none"
              onChange={(event) => setCustomAmount(event.target.value)}
              placeholder="Enter custom amount"
              value={customAmount}
            />
            <div className="flex shrink-0 items-center gap-2 rounded-[12px] border border-line bg-[var(--background-soft)] px-4 py-2 text-sm text-foreground">
              <span>{currency || "USD"}</span>
            </div>
          </div>
          {selectedGate ? (
            <div className="mt-4 rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm">
              <div className="font-semibold text-foreground">
                {selectedGate.publicName} limits
              </div>
              <div className="mt-1 text-muted">
                Minimum: {formatCurrency(selectedGate.minAmount, "USD")}
                {selectedGate.maxAmount !== null
                  ? ` · Maximum: ${formatCurrency(selectedGate.maxAmount, "USD")}`
                  : " · No maximum"}
              </div>
              {amountLimitError ? (
                <div className="mt-2 font-semibold text-rose-500">{amountLimitError}</div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-[16px] border border-line bg-white p-5">
          <StepHeader number="2" title="Select payment method" />
          <div className="mt-5 grid gap-3 xl:grid-cols-4">
            {depositPaymentOptions.map((option) => (
              <SelectorCard
                key={option.id}
                active={paymentMethod === option.id}
                label={option.label}
                sublabel={option.sublabel}
                onClick={() => {
                  setPaymentMethod(option.id);
                  setError(null);
                }}
              />
            ))}
          </div>
        </div>

        <div className="rounded-[16px] border border-line bg-white p-5">
          <StepHeader number="3" title="Select currency" />
          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {(["EUR", "USD"] as SupportedCurrency[]).map((option) => (
              <SelectorCard
                key={option}
                active={currency === option}
                label={option}
                sublabel={
                  option === "EUR"
                    ? "Pay in euros with provider-aware availability"
                    : "Pay in US dollars through all supported providers"
                }
                onClick={() => {
                  setCurrency(option);
                  setError(null);
                }}
              />
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            Gate #2 supports USD payments only. EUR remains available only for
            gates that explicitly support it.
          </p>
        </div>

        <AnimatePresence initial={false}>
          {providerVisible ? (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[16px] border border-line bg-white p-5"
              exit={{ opacity: 0, y: -8 }}
              initial={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <StepHeader number="4" title="Select payment gate" />
              <div className="mt-5 grid gap-3 xl:grid-cols-2">
                {availableProviders.map((option) => (
                  <ProviderCard
                    key={option.id}
                    active={provider === option.id}
                    disabled={!option.supported}
                    label={option.label}
                    speedLabel={option.speedLabel}
                    secureLabel={option.secureLabel}
                    recommended={option.gateNumber === 1}
                    onClick={() => setProvider(option.id)}
                  />
                ))}
              </div>
              {availableProviders.length === 0 ? (
                <p className="mt-4 text-sm text-muted">
                  No payment gates are currently available for your account.
                </p>
              ) : null}
              {selectedGate?.providerKey === "cleffo" ? (
                <p className="mt-4 rounded-[14px] border border-sky-300/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                  Gate #2 supports USD payments only.
                </p>
              ) : null}
              {selectedGate?.providerKey === "wert" ? (
                <p className="mt-4 rounded-[14px] border border-violet-300/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
                  Gate #3 payment is powered by card-to-smart-contract checkout.
                </p>
              ) : null}
              {selectedGate?.providerKey === "coinflow" ? (
                <p className="mt-4 rounded-[14px] border border-cyan-300/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                  Gate #4 uses a secure card checkout. Your balance updates only
                  after provider confirmation.
                </p>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {error ? (
          <div className="rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {selectedGateRequiresDetails ? (
          <div className="rounded-[18px] border border-amber-300/25 bg-amber-400/10 p-5 text-sm text-amber-50">
            <div className="text-lg font-semibold text-foreground">
              Gate #2 details required
            </div>
            <p className="mt-2 max-w-2xl leading-7 text-muted">
              Before opening Gate #2 checkout, please add your first name, last
              name, and phone number in profile settings.
            </p>
            <button
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-[12px] bg-[linear-gradient(135deg,#a78bfa,#6d4df2)] px-4 py-3 text-sm font-medium text-white sm:w-auto"
              onClick={() => router.push("/dashboard/settings?section=payments")}
              type="button"
            >
              Add details
            </button>
          </div>
        ) : null}

        <button
          className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-[linear-gradient(135deg,#141922,#0f1420)] px-5 py-4 text-sm font-medium text-white shadow-[0_16px_40px_rgba(17,19,24,0.12)] transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-55"
          disabled={
            !provider ||
            isSubmitting ||
            amount <= 0 ||
            Boolean(amountLimitError) ||
            selectedGateRequiresDetails
          }
          onClick={handleContinue}
          type="button"
        >
          <LockKeyhole className="size-4" />
          {isSubmitting ? "Preparing secure payment..." : continueLabel}
        </button>
        <div className="flex items-center justify-center gap-2 text-center text-sm text-muted">
          <ShieldInfoIcon />
          <span>
            Your secure payment provider page will open in a new browser tab.
          </span>
        </div>
      </section>

      <AnimatePresence>
        {showReceipt && initialOutcome && initialOutcome.deposit.status === "completed" ? (
          <PaymentSuccessModal
            continueLabel="Continue to Dashboard"
            downloadLabel="Download Receipt"
            onClose={dismissOutcome}
            onContinue={continueToDashboard}
            onDownload={downloadReceipt}
            rows={receiptRows}
            statusLabel="Payment Successful"
            subtitle="Your transaction has been completed successfully."
            supportDescription="Explore the marketplace and discover rare digital collectibles."
            supportTitle="Your funds are secure and ready to use."
            title="Thank you for your purchase!"
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function SelectorCard({
  active,
  label,
  sublabel,
  onClick,
}: {
  active: boolean;
  label: string;
  sublabel: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`relative min-h-[112px] w-full rounded-[12px] border px-4 py-4 text-left transition ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : "border-line bg-white hover:bg-[var(--foreground-soft)]"
      }`}
      onClick={onClick}
      type="button"
    >
      {active ? (
        <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-[var(--accent)] text-white">
          <Check className="size-3" />
        </span>
      ) : null}
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="mt-2 text-sm leading-6 text-muted">{sublabel}</div>
    </button>
  );
}

function ProviderCard({
  active,
  disabled,
  label,
  speedLabel,
  secureLabel,
  recommended = false,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  speedLabel: string;
  secureLabel: string;
  recommended?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`relative w-full rounded-[12px] border px-4 py-4 text-left transition ${
        active && !disabled
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : disabled
            ? "border-line bg-white opacity-55"
            : "border-line bg-white hover:bg-[var(--foreground-soft)]"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {active && !disabled ? (
        <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-[var(--accent)] text-white">
          <Check className="size-3" />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-sm font-semibold text-foreground">{label}</div>
        {recommended ? (
          <div className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)]">
            Recommended
          </div>
        ) : (
          <div className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-medium text-[var(--accent)]">
            <LockKeyhole className="size-3" />
            Secure
          </div>
        )}
      </div>
      <div className="mt-3 text-sm text-muted">{speedLabel}</div>
      <div className="mt-1 text-sm text-muted">
        {disabled ? `${label} supports USD only.` : secureLabel}
      </div>
    </button>
  );
}

function AmountCard({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`relative min-h-12 w-full rounded-[12px] border px-4 py-4 text-sm font-medium transition ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
          : "border-line bg-white text-foreground hover:bg-[var(--foreground-soft)]"
      }`}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      {active ? (
        <span className="absolute right-3 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent)] text-white">
          <Check className="size-3" />
        </span>
      ) : null}
    </button>
  );
}

function StepHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-6 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-semibold text-white">
        {number}
      </div>
      <div className="text-base font-semibold text-foreground">{title}</div>
    </div>
  );
}

function ShieldInfoIcon() {
  return <ShieldCheck className="size-4 text-[var(--accent)]" />;
}
