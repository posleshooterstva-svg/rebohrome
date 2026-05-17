"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Apple, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  formatCurrency,
  formatUsd,
  type CryptoNetwork,
  type PaymentMethodName,
  type PaymentProviderName,
  type SupportedCurrency,
} from "@/lib/rebohrome-data";

const DEPOSIT_PAYMENT_DRAFT_PREFIX = "rebohrome-deposit-payment-draft";

type DepositHostedPageClientProps = {
  sessionId: string;
  provider: PaymentProviderName;
  paymentMethod: PaymentMethodName;
  currency: SupportedCurrency;
  originalAmount: number;
  creditedAmountUsd: number;
  exchangeRate: number;
  currentBalance: number;
};

type DepositResult =
  | {
      ok: true;
      depositId: string;
    }
  | {
      ok: false;
      depositId: string;
    };

type DepositPaymentDraft = {
  cardholderName: string;
  cardNumber: string;
  expiration: string;
  cvv: string;
  billingCountry: string;
  cryptoNetwork: CryptoNetwork | "";
};

export function DepositHostedPageClient({
  sessionId,
  provider,
  paymentMethod,
  currency,
  originalAmount,
  creditedAmountUsd,
  exchangeRate,
  currentBalance,
}: DepositHostedPageClientProps) {
  const router = useRouter();
  const [cardholderName, setCardholderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiration, setExpiration] = useState("");
  const [cvv, setCvv] = useState("");
  const [billingCountry, setBillingCountry] = useState("");
  const [cryptoNetwork, setCryptoNetwork] = useState<CryptoNetwork | "">("USDT");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paymentDraftKey = `${DEPOSIT_PAYMENT_DRAFT_PREFIX}:${sessionId}`;

  useEffect(() => {
    const saved = window.sessionStorage.getItem(paymentDraftKey);
    if (!saved) {
      return;
    }

    try {
      const draft = JSON.parse(saved) as DepositPaymentDraft;
      setCardholderName(draft.cardholderName || "");
      setCardNumber(draft.cardNumber || "");
      setExpiration(draft.expiration || "");
      setCvv(draft.cvv || "");
      setBillingCountry(draft.billingCountry || "");
      setCryptoNetwork(draft.cryptoNetwork || "USDT");
    } catch {
      window.sessionStorage.removeItem(paymentDraftKey);
    }
  }, [paymentDraftKey]);

  useEffect(() => {
    window.sessionStorage.setItem(
      paymentDraftKey,
      JSON.stringify({
        cardholderName,
        cardNumber,
        expiration,
        cvv,
        billingCountry,
        cryptoNetwork,
      } satisfies DepositPaymentDraft),
    );
  }, [
    billingCountry,
    cardNumber,
    cardholderName,
    cryptoNetwork,
    cvv,
    expiration,
    paymentDraftKey,
  ]);

  const payLabel = useMemo(() => {
    switch (paymentMethod) {
      case "Apple Pay":
        return `Pay ${formatCurrency(originalAmount, currency)} with Apple Pay`;
      case "Google Pay":
        return `Pay ${formatCurrency(originalAmount, currency)} with Google Pay`;
      case "Crypto":
        return `Pay ${formatCurrency(originalAmount, currency)} with Crypto`;
      default:
        return `Pay ${formatCurrency(originalAmount, currency)}`;
    }
  }, [currency, originalAmount, paymentMethod]);

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    if (
      paymentMethod === "Credit Card" &&
      (cardholderName.trim().length < 2 ||
        cardNumber.replace(/\D+/g, "").length < 12 ||
        expiration.trim().length < 4 ||
        cvv.trim().length < 3 ||
        billingCountry.trim().length < 2)
    ) {
      setError("Complete the secure card form before continuing.");
      return;
    }

    if (
      (paymentMethod === "Apple Pay" || paymentMethod === "Google Pay") &&
      billingCountry.trim().length < 2
    ) {
      setError("Select a billing country before continuing.");
      return;
    }

    if (paymentMethod === "Crypto" && !cryptoNetwork) {
      setError("Select a crypto settlement network before continuing.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/payment/deposit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          cardholderName,
          cardNumber: paymentMethod === "Credit Card" ? cardNumber : undefined,
          expiration: paymentMethod === "Credit Card" ? expiration : undefined,
          cvv: paymentMethod === "Credit Card" ? cvv : undefined,
          billingCountry:
            paymentMethod === "Crypto" ? undefined : billingCountry,
          cryptoNetwork: paymentMethod === "Crypto" ? cryptoNetwork : null,
        }),
      });

      const payload = (await response.json()) as DepositResult | { error?: string };
      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Deposit failed.");
      }

      if (!("ok" in payload)) {
        throw new Error("Unable to resolve secure deposit status.");
      }

      window.sessionStorage.removeItem(paymentDraftKey);
      router.push(
        payload.ok
          ? `/dashboard/deposit?receipt=${payload.depositId}`
          : `/dashboard/deposit?failed=${payload.depositId}`,
      );
      router.refresh();
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Unable to complete secure deposit.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f4f8] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.08)] lg:grid-cols-[0.92fr_1.08fr]">
        <section className="relative overflow-hidden bg-[#171b2d] px-6 py-8 sm:px-8 lg:px-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(161,145,255,0.22),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_42%)]" />
          <div className="relative">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  {provider}
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">
                  Secure Deposit
                </h1>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
                <ShieldCheck className="size-3.5 text-violet-300" />
                Hosted payment
              </div>
            </div>

            <div className="mt-8">
              <div className="text-sm text-slate-400">Amount to pay</div>
              <div className="mt-2 text-5xl font-semibold tracking-[-0.06em] text-white">
                {formatCurrency(originalAmount, currency)}
              </div>
            </div>

            <div className="mt-8 rounded-[18px] border border-white/10 bg-white/6 px-4 py-4 text-sm text-slate-300">
              <SummaryRow label="Payment method" value={paymentMethod} />
              <SummaryRow label="Provider" value={provider} />
              <SummaryRow
                label="Archive balance credit"
                value={`+${formatUsd(creditedAmountUsd)}`}
              />
              <SummaryRow
                label="Current balance"
                value={formatUsd(currentBalance)}
              />
              <SummaryRow
                label="Balance after deposit"
                value={formatUsd(currentBalance + creditedAmountUsd)}
                strong
              />
              {currency === "EUR" ? (
                <SummaryRow
                  label="Exchange rate"
                  value={`1 EUR = ${exchangeRate.toFixed(2)} USD`}
                />
              ) : null}
            </div>

            <div className="mt-6 rounded-[16px] border border-white/10 bg-white/6 px-4 py-4 text-sm leading-7 text-slate-300">
              Funds settle directly into your archive balance after provider approval.
              The hosted gateway keeps payment entry separate from the marketplace
              workspace.
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-8 text-slate-900 sm:px-8 lg:px-10">
          <div className="max-w-xl">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Secure payment details
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">
              Complete provider deposit
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              Enter payment details inside the hosted gateway, confirm the transfer,
              and return to your archive balance with an updated receipt.
            </p>

            <div className="mt-8 rounded-[18px] border border-slate-200 bg-slate-50/70 p-5">
              {paymentMethod === "Credit Card" ? (
                <div className="space-y-4">
                  <Field
                    label="Card Number"
                    onChange={setCardNumber}
                    placeholder="4242 4242 4242 4242"
                    value={cardNumber}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Expiration"
                      onChange={setExpiration}
                      placeholder="MM / YY"
                      value={expiration}
                    />
                    <Field
                      label="CVC"
                      onChange={setCvv}
                      placeholder="CVC"
                      value={cvv}
                    />
                  </div>
                  <Field
                    label="Cardholder Name"
                    onChange={setCardholderName}
                    placeholder="Alex Carter"
                    value={cardholderName}
                  />
                  <Field
                    label="Billing Country"
                    onChange={setBillingCountry}
                    placeholder="United States"
                    value={billingCountry}
                  />
                  <p className="text-sm leading-6 text-slate-500">
                    Use a card ending in <span className="font-medium text-slate-900">0000</span>{" "}
                    to simulate a declined deposit.
                  </p>
                </div>
              ) : null}

              {paymentMethod === "Apple Pay" ? (
                <WalletPane
                  actionLabel="Authorize with Apple Pay"
                  body="Confirm the selected provider route and continue through a secure wallet approval flow."
                  icon={<Apple className="size-5" />}
                >
                  <Field
                    label="Billing Country"
                    onChange={setBillingCountry}
                    placeholder="United States"
                    value={billingCountry}
                  />
                </WalletPane>
              ) : null}

              {paymentMethod === "Google Pay" ? (
                <WalletPane
                  actionLabel="Authorize with Google Pay"
                  body="Complete the deposit in-browser while every settlement detail stays attached to your transaction history."
                  icon={<span className="text-lg font-semibold">G</span>}
                >
                  <Field
                    label="Billing Country"
                    onChange={setBillingCountry}
                    placeholder="United States"
                    value={billingCountry}
                  />
                </WalletPane>
              ) : null}

              {paymentMethod === "Crypto" ? (
                <div className="space-y-4">
                  <div className="rounded-[14px] border border-slate-200 bg-white px-4 py-4">
                    <div className="text-sm font-semibold text-slate-950">Network</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {(["USDT", "BTC", "ETH"] as CryptoNetwork[]).map((network) => (
                        <button
                          key={network}
                          className={`rounded-[12px] border px-3 py-3 text-sm transition ${
                            cryptoNetwork === network
                              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-slate-950"
                              : "border-slate-200 bg-slate-50 text-slate-500"
                          }`}
                          onClick={() => setCryptoNetwork(network)}
                          type="button"
                        >
                          {network}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[14px] border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-500">
                    Settlement wallet:{" "}
                    <span className="font-medium text-slate-950">
                      archive.rebohrome/settlement/{cryptoNetwork || "network"}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            {error ? (
              <p className="mt-4 text-sm leading-6 text-rose-600">{error}</p>
            ) : null}

            <div className="mt-6 flex items-center justify-between gap-4 rounded-[16px] border border-slate-200 bg-slate-50/70 px-4 py-4 text-sm text-slate-500">
              <div className="flex items-center gap-2 text-slate-900">
                <LockKeyhole className="size-4 text-[var(--accent)]" />
                PCI-style secure handoff
              </div>
              <div>{formatCurrency(originalAmount, currency)}</div>
            </div>

            <button
              className="mt-6 inline-flex w-full items-center justify-center rounded-[12px] bg-[#1a2033] px-4 py-4 text-sm font-medium text-white transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              onClick={handleSubmit}
              type="button"
            >
              {isSubmitting ? "Processing secure deposit..." : payLabel}
            </button>

            <button
              className="mt-3 inline-flex w-full items-center justify-center rounded-[12px] border border-slate-200 bg-white px-4 py-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              onClick={() => router.push("/dashboard/deposit")}
              type="button"
            >
              Return to deposit
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-900">{label}</span>
      <input
        className="w-full rounded-[12px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        strong ? "font-semibold text-white" : ""
      }`}
    >
      <span>{label}</span>
      <span className={strong ? "" : "text-white"}>{value}</span>
    </div>
  );
}

function WalletPane({
  icon,
  actionLabel,
  body,
  children,
}: {
  icon: React.ReactNode;
  actionLabel: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-slate-950 text-white">
            {icon}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-950">{actionLabel}</div>
            <div className="mt-1 text-sm text-slate-500">{body}</div>
          </div>
        </div>
      </div>
      {children}
      <div className="rounded-[14px] border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-500">
        Wallet authorization happens inside the provider environment after you confirm this
        deposit.
      </div>
    </div>
  );
}
