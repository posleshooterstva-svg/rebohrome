"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowRightLeft,
  ArrowUpCircle,
  CheckCircle2,
  Clock3,
  CreditCard,
  DollarSign,
  Hash,
  Package,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ReceiptIconKey =
  | "receipt"
  | "transaction"
  | "items"
  | "paid"
  | "credited"
  | "exchange-rate"
  | "payment"
  | "provider"
  | "reference"
  | "wallet"
  | "timestamp"
  | "status";

export type PaymentSuccessRow = {
  label: string;
  value: string;
  icon: ReceiptIconKey;
  tone?: "default" | "accent" | "success";
};

type PaymentSuccessModalProps = {
  open?: boolean;
  overlay?: boolean;
  title: string;
  subtitle: string;
  statusLabel?: string;
  rows: PaymentSuccessRow[];
  supportTitle?: string;
  supportDescription?: string;
  downloadLabel?: string;
  onDownload?: () => void;
  continueLabel: string;
  continueHref?: string;
  onContinue?: () => void;
  closeHref?: string;
  onClose?: () => void;
  helpHref?: string;
  helpLabel?: string;
};

const iconClassName = "size-[18px] text-[var(--accent)]/76";

function ReceiptIcon({ icon }: { icon: ReceiptIconKey }) {
  switch (icon) {
    case "receipt":
      return <ReceiptText className={iconClassName} />;
    case "transaction":
      return <ArrowRightLeft className={iconClassName} />;
    case "items":
      return <Package className={iconClassName} />;
    case "paid":
      return <DollarSign className={iconClassName} />;
    case "credited":
      return <ArrowUpCircle className={iconClassName} />;
    case "exchange-rate":
      return <RefreshCw className={iconClassName} />;
    case "payment":
      return <CreditCard className={iconClassName} />;
    case "provider":
      return <ShieldCheck className={iconClassName} />;
    case "reference":
      return <Hash className={iconClassName} />;
    case "wallet":
      return <Wallet className={iconClassName} />;
    case "timestamp":
      return <Clock3 className={iconClassName} />;
    case "status":
      return <CheckCircle2 className={iconClassName} />;
    default:
      return <ReceiptText className={iconClassName} />;
  }
}

function ContinueAction({
  href,
  label,
  onClick,
}: {
  href?: string;
  label: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span>{label}</span>
      <ArrowRight className="size-[18px]" />
    </>
  );

  if (href) {
    return (
      <Link
        className="inline-flex min-h-[62px] items-center justify-center gap-3 rounded-[18px] bg-[linear-gradient(135deg,#8b7cff_0%,#9e90ff_55%,#8a79ff_100%)] px-6 py-4 text-base font-medium text-white shadow-[0_20px_48px_rgba(139,124,255,0.34)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_52px_rgba(139,124,255,0.38)]"
        href={href}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      className="inline-flex min-h-[62px] items-center justify-center gap-3 rounded-[18px] bg-[linear-gradient(135deg,#8b7cff_0%,#9e90ff_55%,#8a79ff_100%)] px-6 py-4 text-base font-medium text-white shadow-[0_20px_48px_rgba(139,124,255,0.34)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_52px_rgba(139,124,255,0.38)]"
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  );
}

export function PaymentSuccessModal({
  open = true,
  overlay = true,
  title,
  subtitle,
  statusLabel = "Payment Successful",
  rows,
  supportTitle = "Your funds are secure and ready to use.",
  supportDescription = "Explore the marketplace and discover rare digital collectibles.",
  downloadLabel = "Download Receipt",
  onDownload,
  continueLabel,
  continueHref,
  onContinue,
  closeHref,
  onClose,
  helpHref = "/contact",
  helpLabel = "Contact Support",
}: PaymentSuccessModalProps) {
  if (!open) {
    return null;
  }

  const shellClassName = overlay
    ? "fixed inset-0 z-[260] flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.92),rgba(244,246,252,0.96)_48%,rgba(240,242,248,0.98)_100%)] px-4 py-6 backdrop-blur-2xl"
    : "flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.92),rgba(244,246,252,0.96)_48%,rgba(240,242,248,0.98)_100%)] px-4 py-8";

  return (
    <div className={shellClassName}>
      <motion.section
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        className="relative w-full max-w-[920px] overflow-hidden rounded-[36px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(250,251,255,0.96)_100%)] px-6 py-7 text-[#1c2230] shadow-[0_36px_120px_rgba(147,155,196,0.22)] sm:px-8 sm:py-8 lg:px-12 lg:py-10"
        initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(182,172,255,0.12),transparent_34%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.9),transparent_26%)]" />
        <div className="pointer-events-none absolute left-1/2 top-[-18%] h-[540px] w-[540px] -translate-x-1/2 rounded-full border border-[rgba(216,220,234,0.54)] opacity-65" />
        <div className="pointer-events-none absolute left-1/2 top-[4%] h-[320px] w-[320px] -translate-x-1/2 rounded-full border border-[rgba(226,229,239,0.58)] opacity-65" />
        <div className="pointer-events-none absolute left-1/2 top-[12%] h-[190px] w-[190px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.96),rgba(241,238,255,0.88)_52%,rgba(255,255,255,0)_78%)]" />

        {onClose ? (
          <button
            className="absolute right-5 top-5 inline-flex size-12 items-center justify-center rounded-full border border-white/80 bg-white/88 text-[#8a8fa2] shadow-[0_14px_34px_rgba(146,154,188,0.12)] transition hover:text-[#4b5568]"
            onClick={onClose}
            type="button"
          >
            <X className="size-6" />
          </button>
        ) : closeHref ? (
          <Link
            aria-label="Close"
            className="absolute right-5 top-5 inline-flex size-12 items-center justify-center rounded-full border border-white/80 bg-white/88 text-[#8a8fa2] shadow-[0_14px_34px_rgba(146,154,188,0.12)] transition hover:text-[#4b5568]"
            href={closeHref}
          >
            <X className="size-6" />
          </Link>
        ) : null}

        <div className="relative mx-auto max-w-[760px]">
          <div className="flex justify-center">
            <motion.div
              animate={{ opacity: [0.9, 1, 0.9], scale: [0.985, 1, 0.985] }}
              className="relative flex size-[168px] items-center justify-center rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.96),rgba(241,238,255,0.94)_54%,rgba(255,255,255,0)_82%)]"
              transition={{ duration: 4.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            >
              <div className="absolute inset-[14px] rounded-full border border-[rgba(219,223,236,0.52)]" />
              <div className="absolute inset-[34px] rounded-full border border-[rgba(232,235,244,0.78)]" />
              <div className="flex size-[94px] items-center justify-center rounded-full bg-[radial-gradient(circle_at_center,rgba(148,133,255,0.28),rgba(255,255,255,0)_72%)] text-[var(--accent)] shadow-[0_0_46px_rgba(139,124,255,0.18)]">
                <ShieldCheck className="size-10 stroke-[1.65]" />
              </div>
            </motion.div>
          </div>

          <div className="mt-2 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(182,172,255,0.36)] bg-[rgba(245,243,255,0.92)] px-4 py-2 text-[12px] font-medium uppercase tracking-[0.2em] text-[var(--accent)]">
              <CheckCircle2 className="size-4 stroke-[1.8]" />
              {statusLabel}
            </div>
          </div>

          <div className="mt-6 text-center">
            <h1 className="text-[34px] font-semibold tracking-[-0.05em] text-[#1f2937] sm:text-[42px]">
              {title}
            </h1>
            <p className="mx-auto mt-4 max-w-[520px] text-[18px] leading-8 text-[#7b8193]">
              {subtitle}
            </p>
          </div>

          <div className="mt-9 rounded-[28px] border border-[rgba(232,235,244,0.92)] bg-[rgba(255,255,255,0.9)] px-5 py-4 shadow-[0_18px_44px_rgba(188,195,222,0.12)] sm:px-7 sm:py-5">
            <div className="divide-y divide-[rgba(232,235,244,0.9)]">
              {rows.map((row) => (
                <div
                  key={`${row.label}:${row.value}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-4 first:pt-1 last:pb-1"
                >
                  <div className="flex items-center gap-3 text-[15px] font-medium text-[#7b8193]">
                    <span className="inline-flex size-8 items-center justify-center rounded-full bg-[rgba(244,242,255,0.76)]">
                      <ReceiptIcon icon={row.icon} />
                    </span>
                    <span>{row.label}</span>
                  </div>
                  <div
                    className={cn(
                      "text-right text-[15px] font-medium text-[#2a3347]",
                      row.tone === "accent" && "text-[var(--accent)]",
                      row.tone === "success" && "text-[#2ecc71]",
                    )}
                  >
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-4 rounded-[26px] border border-[rgba(232,235,244,0.88)] bg-[rgba(255,255,255,0.92)] px-5 py-5 shadow-[0_14px_36px_rgba(188,195,222,0.12)] sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-[radial-gradient(circle_at_center,rgba(160,147,255,0.24),rgba(255,255,255,0.92)_72%)] text-[var(--accent)] shadow-[0_10px_24px_rgba(160,147,255,0.16)]">
              <ShieldCheck className="size-7 stroke-[1.8]" />
            </div>
            <div>
              <div className="text-[20px] font-medium tracking-[-0.03em] text-[#1f2937]">
                {supportTitle}
              </div>
              <div className="mt-2 text-[16px] leading-7 text-[#7b8193]">
                {supportDescription}
              </div>
            </div>
            <div className="hidden justify-self-end rounded-[18px] bg-[radial-gradient(circle_at_center,rgba(182,172,255,0.16),rgba(255,255,255,0)_72%)] p-3 sm:block">
              <Wallet className="size-10 text-[var(--accent)]/30" />
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <button
              className="inline-flex min-h-[62px] items-center justify-center gap-3 rounded-[18px] border border-[rgba(226,230,240,0.96)] bg-white px-6 py-4 text-base font-medium text-[#242b3a] shadow-[0_12px_30px_rgba(188,195,222,0.1)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(188,195,222,0.14)]"
              onClick={onDownload}
              type="button"
            >
              <ArrowDownIcon />
              {downloadLabel}
            </button>
            <ContinueAction
              href={continueHref}
              label={continueLabel}
              onClick={onContinue}
            />
          </div>

          <div className="mt-7 text-center text-[15px] text-[#8b92a5]">
            Need help?{" "}
            <Link className="font-medium text-[var(--accent)]" href={helpHref}>
              {helpLabel}
            </Link>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

function ArrowDownIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-[18px] text-[var(--accent)]"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
