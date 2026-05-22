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
    ? "fixed inset-0 z-[260] flex min-h-dvh items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.92),rgba(244,246,252,0.96)_48%,rgba(240,242,248,0.98)_100%)] px-3 py-4 backdrop-blur-2xl sm:px-4 sm:py-6"
    : "flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.92),rgba(244,246,252,0.96)_48%,rgba(240,242,248,0.98)_100%)] px-3 py-4 sm:px-4 sm:py-6";

  return (
    <div className={shellClassName}>
      <motion.section
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        className="relative flex w-full max-w-[840px] max-h-[calc(100dvh-48px)] flex-col overflow-hidden rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(250,251,255,0.96)_100%)] px-5 py-5 text-[#1c2230] shadow-[0_36px_120px_rgba(147,155,196,0.22)] sm:px-7 sm:py-6 lg:px-10 lg:py-7"
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

        <div className="relative mx-auto flex w-full max-w-[760px] min-h-0 flex-1 flex-col">
          <div className="flex justify-center">
            <motion.div
              animate={{ opacity: [0.9, 1, 0.9], scale: [0.985, 1, 0.985] }}
              className="relative flex size-[120px] items-center justify-center rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.96),rgba(241,238,255,0.94)_54%,rgba(255,255,255,0)_82%)] sm:size-[136px] lg:size-[148px]"
              transition={{ duration: 4.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            >
              <div className="absolute inset-[12px] rounded-full border border-[rgba(219,223,236,0.52)] sm:inset-[14px]" />
              <div className="absolute inset-[28px] rounded-full border border-[rgba(232,235,244,0.78)] sm:inset-[32px]" />
              <div className="flex size-[74px] items-center justify-center rounded-full bg-[radial-gradient(circle_at_center,rgba(148,133,255,0.28),rgba(255,255,255,0)_72%)] text-[var(--accent)] shadow-[0_0_46px_rgba(139,124,255,0.18)] sm:size-[84px] lg:size-[92px]">
                <ShieldCheck className="size-8 stroke-[1.65] sm:size-9" />
              </div>
            </motion.div>
          </div>

          <div className="mt-1.5 flex justify-center sm:mt-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(182,172,255,0.36)] bg-[rgba(245,243,255,0.92)] px-4 py-2 text-[12px] font-medium uppercase tracking-[0.2em] text-[var(--accent)]">
              <CheckCircle2 className="size-4 stroke-[1.8]" />
              {statusLabel}
            </div>
          </div>

          <div className="mt-4 text-center sm:mt-5">
            <h1 className="text-[28px] font-semibold tracking-[-0.05em] text-[#1f2937] sm:text-[34px] lg:text-[40px]">
              {title}
            </h1>
            <p className="mx-auto mt-3 max-w-[520px] text-[15px] leading-7 text-[#7b8193] sm:text-[16px] sm:leading-7 lg:text-[18px] lg:leading-8">
              {subtitle}
            </p>
          </div>

          <div className="mt-6 min-h-0 rounded-[24px] border border-[rgba(232,235,244,0.92)] bg-[rgba(255,255,255,0.9)] px-4 py-3 shadow-[0_18px_44px_rgba(188,195,222,0.12)] sm:px-5 sm:py-4 lg:mt-7 lg:px-6 lg:py-4">
            <div className="max-h-[28dvh] overflow-y-auto pr-1 sm:max-h-[30dvh] lg:max-h-[34dvh]">
              <div className="divide-y divide-[rgba(232,235,244,0.9)]">
              {rows.map((row) => (
                <div
                  key={`${row.label}:${row.value}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-1 last:pb-1 sm:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-2.5 text-[13px] font-medium text-[#7b8193] sm:gap-3 sm:text-[14px]">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[rgba(244,242,255,0.76)] sm:size-8">
                      <ReceiptIcon icon={row.icon} />
                    </span>
                    <span className="truncate">{row.label}</span>
                  </div>
                  <div
                    className={cn(
                      "min-w-0 text-right text-[13px] font-medium text-[#2a3347] sm:text-[14px]",
                      row.tone === "accent" && "text-[var(--accent)]",
                      row.tone === "success" && "text-[#2ecc71]",
                    )}
                  >
                    <span className="break-words">{row.value}</span>
                  </div>
                </div>
              ))}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 rounded-[22px] border border-[rgba(232,235,244,0.88)] bg-[rgba(255,255,255,0.92)] px-4 py-4 shadow-[0_14px_36px_rgba(188,195,222,0.12)] sm:grid-cols-[auto_1fr_auto] sm:items-center sm:px-5 sm:py-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-[radial-gradient(circle_at_center,rgba(160,147,255,0.24),rgba(255,255,255,0.92)_72%)] text-[var(--accent)] shadow-[0_10px_24px_rgba(160,147,255,0.16)] sm:size-14">
              <ShieldCheck className="size-6 stroke-[1.8] sm:size-7" />
            </div>
            <div>
              <div className="text-[17px] font-medium tracking-[-0.03em] text-[#1f2937] sm:text-[18px] lg:text-[20px]">
                {supportTitle}
              </div>
              <div className="mt-1.5 text-[14px] leading-6 text-[#7b8193] sm:text-[15px] sm:leading-6 lg:text-[16px] lg:leading-7">
                {supportDescription}
              </div>
            </div>
            <div className="hidden justify-self-end rounded-[18px] bg-[radial-gradient(circle_at_center,rgba(182,172,255,0.16),rgba(255,255,255,0)_72%)] p-3 sm:block">
              <Wallet className="size-10 text-[var(--accent)]/30" />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 sm:gap-4">
            <button
              className="inline-flex min-h-[56px] items-center justify-center gap-3 rounded-[16px] border border-[rgba(226,230,240,0.96)] bg-white px-5 py-3.5 text-sm font-medium text-[#242b3a] shadow-[0_12px_30px_rgba(188,195,222,0.1)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(188,195,222,0.14)] sm:min-h-[58px] sm:text-[15px]"
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
