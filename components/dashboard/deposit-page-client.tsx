"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  depositPaymentOptions,
  formatCurrency,
  formatDisplayDateTime,
  formatUsd,
  paymentProviderOptions,
  type DepositRecord,
  type PaymentMethodName,
  type PaymentProviderName,
  type SupportedCurrency,
} from "@/lib/rebohrome-data";

type DepositPageClientProps = {
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
      redirectPath: string;
    }
  | { error?: string };

const DEPOSIT_DRAFT_KEY = "rebohrome-deposit-draft";
const amountOptions = [50, 100, 250, 500, 1000];

export function DepositPageClient({
  initialOutcome,
}: DepositPageClientProps) {
  const router = useRouter();
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
    if (!currency) {
      setProvider("");
      return;
    }

    const activeProvider = paymentProviderOptions.find((option) => option.id === provider);
    if (activeProvider && activeProvider.supportedCurrencies.includes(currency)) {
      return;
    }

    setProvider("");
  }, [currency, provider]);

  const amount = useMemo(() => {
    const normalized = Number(customAmount);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : selectedAmount;
  }, [customAmount, selectedAmount]);

  const availableProviders = useMemo(() => {
    if (!currency) {
      return [];
    }

    return paymentProviderOptions.map((option) => ({
      ...option,
      supported: option.supportedCurrencies.includes(currency),
    }));
  }, [currency]);

  const providerVisible = Boolean(paymentMethod && currency);
  const continueLabel = provider ? "Continue to secure payment" : "Select payment provider";
  const failureNotice =
    initialOutcome?.deposit.status === "failed"
      ? initialOutcome.failureReason || "Payment was declined by the issuing bank."
      : null;

  async function handleContinue() {
    if (!paymentMethod || !currency || !provider || isSubmitting || amount <= 0) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/deposit/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          paymentMethod,
          currency,
          provider,
        }),
      });

      const payload = (await response.json()) as DepositSessionResponse;
      if (!response.ok || !("redirectPath" in payload)) {
        throw new Error(
          "error" in payload ? payload.error : "Unable to initialize secure deposit.",
        );
      }

      router.push(payload.redirectPath);
    } catch (depositError) {
      setError(
        depositError instanceof Error
          ? depositError.message
          : "Unable to continue to secure payment.",
      );
      setIsSubmitting(false);
    }
  }

  function dismissOutcome() {
    setShowReceipt(false);
    setError(null);
    router.replace("/dashboard/deposit");
    router.refresh();
  }

  function downloadReceipt() {
    if (!initialOutcome || initialOutcome.deposit.status !== "completed") {
      return;
    }

    const { deposit, transactionId } = initialOutcome;
    const content = [
      "REBOHROME DEPOSIT RECEIPT",
      `Deposit ID: ${deposit.id}`,
      `Transaction ID: ${transactionId ?? "Pending"}`,
      `Paid Amount: ${formatCurrency(deposit.originalAmount ?? deposit.amount, deposit.originalCurrency ?? "USD")}`,
      `Credited Amount: +${formatUsd(deposit.creditedAmountUsd ?? deposit.amount)}`,
      `Exchange Rate: 1 ${deposit.originalCurrency ?? "USD"} = ${(deposit.exchangeRate ?? 1).toFixed(2)} USD`,
      `Payment Method: ${deposit.paymentMethod}`,
      `Provider: ${deposit.paymentProvider ?? "Unknown"}`,
      `Reference: ${deposit.cardMasked}`,
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
      <section className="space-y-5">
        <div>
          <h1 className="display-font text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
            Deposit
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted">
            Add funds to your archive balance using a secure payment method.
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
          <div className="mt-4 flex items-center rounded-[14px] border border-line bg-white px-4">
            <span className="text-lg text-muted">
              {currency === "USD" ? "$" : "EUR"}
            </span>
            <input
              className="w-full bg-transparent px-3 py-4 text-sm text-foreground outline-none"
              onChange={(event) => setCustomAmount(event.target.value)}
              placeholder="Enter custom amount"
              value={customAmount}
            />
            <div className="flex items-center gap-2 rounded-[12px] border border-line bg-[var(--background-soft)] px-4 py-2 text-sm text-foreground">
              <span>{currency || "USD"}</span>
            </div>
          </div>
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
              <StepHeader number="4" title="Select provider" />
              <div className="mt-5 grid gap-3 xl:grid-cols-2">
                {availableProviders.map((option) => (
                  <ProviderCard
                    key={option.id}
                    active={provider === option.id}
                    disabled={!option.supported}
                    label={option.id === "Stripe Pay" ? "Stripe" : option.label}
                    speedLabel={
                      option.id === "Stripe Pay"
                        ? "Secure payments"
                        : option.speedLabel
                    }
                    secureLabel={
                      option.id === "Stripe Pay"
                        ? "Powered by Stripe"
                        : option.secureLabel
                    }
                    recommended={option.id === "Stripe Pay"}
                    onClick={() => setProvider(option.id)}
                  />
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {error ? (
          <div className="rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <button
          className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-[linear-gradient(135deg,#141922,#0f1420)] px-5 py-4 text-sm font-medium text-white shadow-[0_16px_40px_rgba(17,19,24,0.12)] transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-55"
          disabled={!provider || isSubmitting || amount <= 0}
          onClick={handleContinue}
          type="button"
        >
          <LockKeyhole className="size-4" />
          {isSubmitting ? "Preparing secure payment..." : continueLabel}
        </button>
        <div className="flex items-center justify-center gap-2 text-sm text-muted">
          <ShieldInfoIcon />
          <span>
            You will be redirected to our secure payment provider to complete your
            deposit.
          </span>
        </div>
      </section>

      <AnimatePresence>
        {showReceipt && initialOutcome && initialOutcome.deposit.status === "completed" ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[260] flex items-center justify-center bg-[rgba(250,251,255,0.9)] px-4 backdrop-blur-2xl"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            <motion.div
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="w-full max-w-md rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,247,255,0.92))] p-7 shadow-[0_50px_120px_rgba(138,149,201,0.24)]"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.26em] text-[var(--accent)]">
                  Deposit Receipt
                </div>
                <div className="flex size-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Check className="size-5" />
                </div>
              </div>

              <div className="mt-6 space-y-3 text-sm text-muted">
                <ReceiptRow label="Deposit ID" value={initialOutcome.deposit.id} />
                <ReceiptRow
                  label="Transaction ID"
                  value={initialOutcome.transactionId ?? "Pending"}
                />
                <ReceiptRow
                  label="Paid"
                  value={formatCurrency(
                    initialOutcome.deposit.originalAmount ?? initialOutcome.deposit.amount,
                    initialOutcome.deposit.originalCurrency ?? "USD",
                  )}
                />
                <ReceiptRow
                  label="Credited"
                  value={`+${formatUsd(
                    initialOutcome.deposit.creditedAmountUsd ?? initialOutcome.deposit.amount,
                  )}`}
                />
                <ReceiptRow
                  label="Exchange Rate"
                  value={`1 ${initialOutcome.deposit.originalCurrency ?? "USD"} = ${(
                    initialOutcome.deposit.exchangeRate ?? 1
                  ).toFixed(2)} USD`}
                />
                <ReceiptRow label="Payment" value={initialOutcome.deposit.paymentMethod} />
                <ReceiptRow
                  label="Provider"
                  value={initialOutcome.deposit.paymentProvider ?? "Unknown"}
                />
                <ReceiptRow label="Reference" value={initialOutcome.deposit.cardMasked} />
                <ReceiptRow
                  label="Updated Balance"
                  value={formatUsd(initialOutcome.deposit.balanceAfter)}
                />
                <ReceiptRow
                  label="Timestamp"
                  value={formatDisplayDateTime(
                    initialOutcome.deposit.completedAt ?? initialOutcome.deposit.createdAt,
                  )}
                />
                <ReceiptRow label="Status" value="SUCCESS" />
              </div>

              <div className="mt-7 grid grid-cols-2 gap-3">
                <button
                  className="rounded-[12px] border border-line bg-white px-4 py-3 text-sm font-medium text-foreground transition hover:bg-[var(--foreground-soft)]"
                  onClick={downloadReceipt}
                  type="button"
                >
                  Download Receipt
                </button>
                <button
                  className="rounded-[12px] bg-foreground px-4 py-3 text-sm font-medium text-white transition hover:opacity-92"
                  onClick={dismissOutcome}
                  type="button"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          </motion.div>
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
      className={`relative min-h-[112px] rounded-[12px] border px-4 py-4 text-left transition ${
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
      className={`relative rounded-[12px] border px-4 py-4 text-left transition ${
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
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-semibold text-foreground">{label}</div>
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
      className={`relative rounded-[12px] border px-4 py-4 text-sm font-medium transition ${
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

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
