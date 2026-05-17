"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { Button } from "@/components/ui/button";
import { getCartSummary } from "@/lib/cart";
import { GLOBAL_COLLECTIBLE_DISCLAIMER } from "@/lib/legal-content";
import {
  checkoutPaymentOptions,
  composePaymentLabel,
  formatCurrency,
  formatUsd,
  paymentProviderOptions,
  type PaymentMethodName,
  type PaymentProviderName,
  type ProductRecord,
  type SupportedCurrency,
} from "@/lib/rebohrome-data";
import { useCartStore } from "@/lib/stores/cart-store";

const CHECKOUT_DRAFT_KEY = "rebohrome-checkout-draft";

type CheckoutPageClientProps = {
  products: ProductRecord[];
  defaultName: string;
  defaultEmail: string;
  availableBalance: number;
};

type CheckoutDraft = {
  paymentMethod: PaymentMethodName;
  currency: SupportedCurrency;
  provider: PaymentProviderName | "";
  agreedToTerms: boolean;
  providerStepUnlocked: boolean;
};

type CheckoutResult =
  | {
      ok: true;
      orderId: string;
    }
  | {
      ok: false;
      orderId: string;
    };

export function CheckoutPageClient({
  products,
  availableBalance,
}: CheckoutPageClientProps) {
  const router = useRouter();
  const lines = useCartStore((state) => state.lines);
  const clearCart = useCartStore((state) => state.clearCart);
  const [mounted, setMounted] = useState(false);
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethodName>("Archive Balance");
  const [currency, setCurrency] = useState<SupportedCurrency>("USD");
  const [provider, setProvider] = useState<PaymentProviderName | "">("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [providerStepUnlocked, setProviderStepUnlocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);

    const saved = window.sessionStorage.getItem(CHECKOUT_DRAFT_KEY);
    if (!saved) {
      return;
    }

    try {
      const draft = JSON.parse(saved) as CheckoutDraft;
      setPaymentMethod(draft.paymentMethod || "Archive Balance");
      setCurrency(draft.currency || "USD");
      setProvider(draft.provider || "");
      setAgreedToTerms(Boolean(draft.agreedToTerms));
      setProviderStepUnlocked(Boolean(draft.providerStepUnlocked));
    } catch {
      window.sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    window.sessionStorage.setItem(
      CHECKOUT_DRAFT_KEY,
      JSON.stringify({
        paymentMethod,
        currency,
        provider,
        agreedToTerms,
        providerStepUnlocked,
      } satisfies CheckoutDraft),
    );
  }, [agreedToTerms, currency, mounted, paymentMethod, provider, providerStepUnlocked]);

  useEffect(() => {
    if (paymentMethod === "Archive Balance") {
      setCurrency("USD");
      setProvider("Internal Wallet");
      setProviderStepUnlocked(false);
      return;
    }

    if (provider === "Internal Wallet") {
      setProvider("");
    }
  }, [paymentMethod, provider]);

  useEffect(() => {
    if (paymentMethod === "Archive Balance") {
      return;
    }

    const activeProvider = paymentProviderOptions.find((option) => option.id === provider);
    if (activeProvider && activeProvider.supportedCurrencies.includes(currency)) {
      return;
    }

    setProvider("");
  }, [currency, paymentMethod, provider]);

  const summary = getCartSummary(mounted ? lines : [], products);
  const checkoutCurrency = paymentMethod === "Archive Balance" ? "USD" : currency;
  const shortfall = Math.max(summary.total - availableBalance, 0);

  const availableProviders = useMemo(
    () =>
      paymentProviderOptions.map((option) => ({
        ...option,
        supported: option.supportedCurrencies.includes(checkoutCurrency),
      })),
    [checkoutCurrency],
  );

  const externalCheckout = paymentMethod !== "Archive Balance";
  const canOpenProviderStep =
    externalCheckout && summary.items.length > 0 && !summary.hasInvalidItems;
  const providerReady =
    paymentMethod === "Archive Balance" || (providerStepUnlocked && provider !== "");
  const canConfirm =
    mounted &&
    !summary.isEmpty &&
    !summary.hasInvalidItems &&
    agreedToTerms &&
    providerReady &&
    (paymentMethod !== "Archive Balance" || shortfall === 0);

  const purchaseBalanceAfter = useMemo(() => {
    if (paymentMethod !== "Archive Balance") {
      return availableBalance;
    }

    return Math.max(availableBalance - summary.total, 0);
  }, [availableBalance, paymentMethod, summary.total]);

  async function handleContinue() {
    if (!canOpenProviderStep) {
      return;
    }

    setProviderStepUnlocked(true);
    setError(null);

    if (!provider) {
      setProvider(currency === "EUR" ? "Stripe Pay" : "OnlinePay");
    }
  }

  async function handleConfirm() {
    if (!canConfirm || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (paymentMethod === "Archive Balance") {
        const response = await fetch("/api/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paymentMethod,
            provider: "Internal Wallet",
            currency: "USD",
            items: lines,
          }),
        });

        const payload = (await response.json()) as CheckoutResult | { error?: string };

        if (!response.ok) {
          throw new Error("error" in payload ? payload.error : "Checkout failed.");
        }

        if (!("ok" in payload)) {
          throw new Error("Unable to resolve checkout result.");
        }

        if (!payload.ok) {
          router.push(`/checkout/declined?order=${payload.orderId}`);
          return;
        }

        clearCart();
        window.sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
        router.push(`/success?order=${payload.orderId}`);
        router.refresh();
        return;
      }

      if (!provider) {
        throw new Error("Select a payment provider to continue.");
      }

      const response = await fetch("/api/checkout/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentMethod,
          provider,
          currency,
          items: lines,
        }),
      });

      const payload = (await response.json()) as
        | {
            redirectPath: string;
          }
        | { error?: string };

      if (!response.ok || !("redirectPath" in payload)) {
        throw new Error(
          "error" in payload ? payload.error : "Unable to initialize secure payment.",
        );
      }

      router.push(payload.redirectPath);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Unable to continue to secure payment.",
      );
      setIsSubmitting(false);
    }
  }

  if (!mounted) {
    return (
      <section className="rounded-[18px] border border-line bg-panel px-5 py-6 shadow-panel sm:px-6">
        <h1 className="display-font text-3xl font-semibold tracking-[-0.05em] text-foreground">
          Complete Your Purchase
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted">
          Restoring your secure checkout session.
        </p>
        <div className="mt-6 grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="h-[520px] animate-pulse rounded-[16px] border border-line bg-panel-strong" />
          <div className="h-[520px] animate-pulse rounded-[16px] border border-line bg-panel-strong" />
        </div>
      </section>
    );
  }

  if (summary.isEmpty) {
    return (
      <section className="rounded-[18px] border border-line bg-panel px-5 py-6 shadow-panel sm:px-6">
        <h1 className="display-font text-3xl font-semibold tracking-[-0.05em] text-foreground">
          Complete Your Purchase
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted">
          Your cart is empty. Discover archive collectibles in the marketplace.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link href="/marketplace">Return to marketplace</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.88fr_1.12fr]">
        <section className="rounded-[18px] border border-line bg-panel px-5 py-6 shadow-panel sm:px-6">
          <h1 className="display-font text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
            Complete Your Purchase
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
            Confirm your order and choose a secure payment method.
          </p>

          <div className="mt-6 rounded-[14px] border border-line bg-panel-strong p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-muted">
                  Archive Balance
                </div>
                <div className="mt-2 text-4xl font-semibold tracking-[-0.05em] text-foreground">
                  {formatUsd(availableBalance)}
                </div>
              </div>
              <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                Connected
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-muted">
              Use your archive wallet for instant settlement, or continue into a
              dedicated secure payment environment.
            </p>
            {paymentMethod === "Archive Balance" && shortfall > 0 ? (
              <div className="mt-4 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Add funds to complete this purchase. You need {formatUsd(shortfall)} more.{" "}
                <Link className="font-medium text-[var(--accent)]" href="/dashboard/deposit">
                  Fund balance
                </Link>
              </div>
            ) : null}
          </div>

          <div className="mt-6">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted">
              Payment Source
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {checkoutPaymentOptions.map((option) => (
                <SelectorCard
                  key={option.id}
                  active={paymentMethod === option.id}
                  label={option.label}
                  sublabel={option.sublabel}
                  onClick={() => {
                    setPaymentMethod(option.id);
                    setProviderStepUnlocked(false);
                    setError(null);
                  }}
                />
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted">
              Currency
            </div>
            {paymentMethod === "Archive Balance" ? (
              <div className="mt-3 rounded-[14px] border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-4">
                <div className="text-sm font-semibold text-foreground">USD</div>
                <div className="mt-1 text-sm leading-6 text-muted">
                  Archive balance payments are settled in USD only.
                </div>
              </div>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(["USD", "EUR"] as SupportedCurrency[]).map((option) => (
                  <SelectorCard
                    key={option}
                    active={currency === option}
                    label={option}
                    sublabel={
                      option === "USD"
                        ? "Pay in US dollars through all supported providers"
                        : "Pay in euros with provider-aware availability"
                    }
                    onClick={() => {
                      setCurrency(option);
                      setProviderStepUnlocked(false);
                      setProvider("");
                      setError(null);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {externalCheckout && providerStepUnlocked ? (
            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-[0.24em] text-muted">
                Payment Provider
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {availableProviders.map((option) => (
                  <ProviderCard
                    key={option.id}
                    active={provider === option.id}
                    disabled={!option.supported}
                    label={option.label}
                    speedLabel={option.speedLabel}
                    secureLabel={option.secureLabel}
                    onClick={() => setProvider(option.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6">
            <Button
              className="w-full"
              disabled={
                paymentMethod === "Archive Balance" ||
                !canOpenProviderStep ||
                isSubmitting ||
                providerStepUnlocked
              }
              onClick={handleContinue}
              type="button"
              variant={externalCheckout ? "default" : "secondary"}
            >
              {externalCheckout
                ? providerStepUnlocked
                  ? "Payment Route Ready"
                  : "Continue to Payment Providers"
                : "Archive Balance Selected"}
            </Button>
          </div>
        </section>

        <section className="rounded-[18px] border border-line bg-panel px-5 py-6 shadow-panel sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold text-foreground">Order Summary</h2>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-panel-strong px-3 py-1 text-xs font-medium text-muted">
              <ShieldCheck className="size-3.5 text-[var(--accent)]" />
              Secure checkout
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {summary.items.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-4 rounded-[14px] border border-line bg-panel-strong px-4 py-3"
              >
                {item.product ? (
                  <div className="w-14 rounded-[12px] border border-line bg-panel p-1.5">
                    <CardArtwork
                      card={item.product}
                      className="aspect-square w-full"
                      compact
                    />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {item.product?.title ?? "Unavailable"}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    Qty {item.quantity} · {item.deliveryType === "digital" ? "Digital" : "Physical"}
                  </div>
                </div>
                <div className="text-sm font-medium text-foreground">
                  {formatCurrency(item.lineTotal, checkoutCurrency)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-3 border-t border-line pt-6 text-sm">
            <SummaryRow
              label="Subtotal"
              value={formatCurrency(summary.subtotal, checkoutCurrency)}
            />
            <SummaryRow
              label="Shipping"
              value={formatCurrency(summary.shipping, checkoutCurrency)}
            />
            <SummaryRow
              label="Total"
              strong
              value={formatCurrency(summary.total, checkoutCurrency)}
            />
          </div>

          <div className="mt-5 rounded-[14px] border border-line bg-panel-strong px-4 py-4 text-sm">
            <SummaryRow
              label="Payment Route"
              value={
                paymentMethod === "Archive Balance"
                  ? "Archive Balance · Internal Wallet"
                  : providerStepUnlocked && provider
                    ? composePaymentLabel(paymentMethod, provider)
                    : "Select source, currency, and provider"
              }
            />
            <div className="mt-3 border-t border-line pt-3">
              <SummaryRow label="Currency" value={checkoutCurrency} />
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <SummaryRow
                label="Balance After Purchase"
                value={formatUsd(purchaseBalanceAfter)}
              />
            </div>
          </div>

          <div className="mt-5 rounded-[14px] border border-line bg-panel-strong px-4 py-4 text-sm text-muted">
            <label className="flex items-start gap-3">
              <input
                checked={agreedToTerms}
                className="mt-1 size-4 rounded border-line"
                onChange={(event) => setAgreedToTerms(event.target.checked)}
                type="checkbox"
              />
              <span className="leading-7">
                I agree to the{" "}
                <Link className="font-medium text-[var(--accent)]" href="/terms">
                  Terms of Service
                </Link>
                ,{" "}
                <Link className="font-medium text-[var(--accent)]" href="/refund-policy">
                  Refund Policy
                </Link>
                , and digital delivery conditions.
              </span>
            </label>
          </div>

          <div className="mt-5 rounded-[14px] border border-line bg-panel-strong px-4 py-4 text-sm leading-7 text-muted">
            {GLOBAL_COLLECTIBLE_DISCLAIMER}
          </div>

          {summary.hasInvalidItems ? (
            <p className="mt-4 text-sm leading-6 text-amber-600">
              Your cart changed. Return to cart and resolve stock issues before payment.
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 text-sm leading-6 text-rose-600">{error}</p>
          ) : null}

          <div className="mt-6 space-y-3">
            <Button
              className="w-full"
              disabled={!canConfirm || isSubmitting}
              onClick={handleConfirm}
              type="button"
            >
              {isSubmitting
                ? "Preparing secure payment..."
                : paymentMethod === "Archive Balance"
                  ? "Confirm Purchase"
                  : "Continue to Secure Payment"}
            </Button>
            <Button asChild className="w-full" variant="secondary">
              <Link href="/cart">Back to cart</Link>
            </Button>
          </div>
        </section>
      </div>
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
      className={`rounded-[14px] border px-4 py-4 text-left transition ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : "border-line bg-panel-strong hover:bg-[var(--foreground-soft)]"
      }`}
      onClick={onClick}
      type="button"
    >
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
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  speedLabel: string;
  secureLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-[14px] border px-4 py-4 text-left transition ${
        active && !disabled
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : disabled
            ? "border-line bg-panel-strong opacity-60"
            : "border-line bg-panel-strong hover:bg-[var(--foreground-soft)]"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-medium text-[var(--accent)]">
          <LockKeyhole className="size-3" />
          Secure
        </div>
      </div>
      <div className="mt-3 text-sm text-muted">{speedLabel}</div>
      <div className="mt-1 text-sm text-muted">
        {disabled ? `${label} supports USD only.` : secureLabel}
      </div>
    </button>
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
        strong ? "text-lg font-semibold text-foreground" : "text-muted"
      }`}
    >
      <span>{label}</span>
      <span className={strong ? "" : "font-medium text-foreground"}>{value}</span>
    </div>
  );
}
