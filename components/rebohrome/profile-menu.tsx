"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ChevronDown,
  CreditCard,
  HelpCircle,
  LogOut,
  ReceiptText,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { formatUsd, type HeaderAccount } from "@/lib/rebohrome-data";
import { useAccountExperienceStore } from "@/lib/stores/account-experience-store";

type ProfileMenuProps = {
  account: HeaderAccount;
};

const quickLinks = [
  { href: "/dashboard/collection", label: "Collection", icon: Archive },
  { href: "/dashboard/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/dashboard/deposit", label: "Deposit", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/faq", label: "FAQ", icon: HelpCircle },
];

export function AccountFloatingProfile({ account }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const primeAccount = useAccountExperienceStore((state) => state.primeAccount);
  const liveAccount = useAccountExperienceStore(
    (state) => state.accounts[account.user.id],
  );

  useEffect(() => {
    primeAccount(
      account.user.id,
      {
        available: account.balance.available,
        pendingWithdrawal: account.balance.pendingWithdrawal,
        totalDeposited: account.balance.totalDeposited,
        totalSpent: account.balance.totalSpent,
        totalWithdrawn: account.balance.totalWithdrawn,
      },
      [],
    );
  }, [account, primeAccount]);

  useEffect(() => {
    function handlePointer(event: MouseEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const balanceLabel = formatUsd(
    liveAccount?.balance.available ?? account.balance.available,
  );
  const displayName = account.user.username || "Archive User";
  const avatarLetter = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="relative z-[130] isolate" ref={shellRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="group flex h-11 items-center gap-2.5 rounded-[16px] border border-white/[0.09] bg-[rgba(12,13,28,0.62)] px-2.5 pr-2 text-sm text-foreground shadow-[0_14px_38px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl transition duration-200 hover:-translate-y-0.5 hover:border-violet-200/28 hover:bg-[rgba(18,18,38,0.74)] hover:shadow-[0_18px_48px_rgba(0,0,0,0.28),0_0_26px_rgba(139,92,246,0.11)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/40 sm:h-12 sm:min-w-[156px] sm:pr-3"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <div className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_20%,rgba(236,233,255,0.92),rgba(135,113,255,0.72)_48%,rgba(69,56,164,0.84))] text-sm font-semibold text-white shadow-[0_8px_20px_rgba(109,77,242,0.24)] ring-1 ring-white/12 sm:size-9">
          {avatarLetter}
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.7)]" />
        </div>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[118px] truncate text-[12px] font-medium leading-4 text-foreground/82">
            {displayName}
          </span>
          <span className="block text-[13px] font-semibold leading-4 tracking-[-0.02em] text-foreground">
            {balanceLabel}
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted transition duration-200 group-hover:text-foreground/85 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute right-0 z-[140] mt-3 w-[286px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[20px] border border-white/[0.09] bg-[rgba(8,9,20,0.82)] p-2.5 shadow-[0_24px_72px_rgba(0,0,0,0.38),0_0_34px_rgba(124,58,237,0.1),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-2xl"
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            role="menu"
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="rounded-[16px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(26,24,48,0.72)_0%,rgba(12,13,28,0.72)_100%)] p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_20%,rgba(236,233,255,0.92),rgba(135,113,255,0.72)_48%,rgba(69,56,164,0.84))] text-base font-semibold text-white shadow-[0_10px_26px_rgba(109,77,242,0.22)] ring-1 ring-white/12">
                  {avatarLetter}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {displayName}
                    </span>
                    <ShieldCheck className="size-3.5 shrink-0 text-emerald-300" />
                  </div>
                  <div className="mt-0.5 truncate text-lg font-semibold tracking-[-0.04em] text-foreground">
                    {balanceLabel}
                  </div>
                </div>
              </div>
              {account.user.role === "admin" ? (
                <div className="mt-3 inline-flex rounded-full border border-sky-300/16 bg-sky-300/8 px-2.5 py-1 text-[11px] font-medium text-sky-100">
                  Administrator
                </div>
              ) : null}
            </div>

            <div className="mt-2 rounded-[16px] border border-white/[0.07] bg-[rgba(12,13,28,0.58)] p-1.5">
              {quickLinks.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    className="group/menu flex items-center justify-between rounded-[12px] px-3 py-2.5 text-sm text-muted transition hover:bg-white/[0.055] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/30"
                    href={item.href}
                    key={item.href}
                    onClick={() => setOpen(false)}
                  >
                    <span>{item.label}</span>
                    <Icon className="size-4 opacity-70 transition group-hover/menu:opacity-100" />
                  </Link>
                );
              })}

              {account.user.role === "admin" ? (
                <Link
                  className="flex items-center justify-between rounded-[12px] px-3 py-2.5 text-sm text-muted transition hover:bg-white/[0.055] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/30"
                  href="/admin"
                  onClick={() => setOpen(false)}
                >
                  <span>Admin Panel</span>
                  <ShieldCheck className="size-4" />
                </Link>
              ) : null}

              <form action={logoutAction}>
                <input name="redirectTo" type="hidden" value="/" />
                <button
                  className="mt-1 flex w-full items-center justify-between rounded-[12px] px-3 py-2.5 text-sm text-muted transition hover:bg-rose-500/10 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/30"
                  type="submit"
                >
                  <span>Logout</span>
                  <LogOut className="size-4" />
                </button>
              </form>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function ProfileMenu(props: ProfileMenuProps) {
  return <AccountFloatingProfile {...props} />;
}
