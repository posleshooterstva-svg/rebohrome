"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  CreditCard,
  LogOut,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { formatUsd, type HeaderAccount } from "@/lib/rebohrome-data";

type ProfileMenuProps = {
  account: HeaderAccount;
};

const quickLinks = [
  { href: "/dashboard/collection", label: "My Collection" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/transactions", label: "Transactions" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function ProfileMenu({ account }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div className="relative z-[130] isolate" ref={shellRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-[10px] border border-line bg-white px-2.5 py-2 text-sm text-foreground shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-[var(--line-strong)] hover:bg-[var(--background-soft)]"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <div className="flex size-8 items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,rgba(153,141,255,0.85),rgba(86,112,255,0.62))] text-white">
          {account.user.username.slice(0, 1).toUpperCase()}
        </div>
        <span className="hidden text-left sm:block">
          <span className="block text-xs text-muted">Archive User</span>
          <span className="block font-medium text-foreground">
            {formatUsd(account.balance.available)}
          </span>
        </span>
        <ChevronDown className="size-4 text-muted" />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute right-0 z-[140] mt-3 w-[332px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[16px] border border-line bg-[rgba(255,255,255,0.98)] p-3 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur"
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            role="menu"
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="rounded-[14px] border border-line bg-[linear-gradient(180deg,#ffffff_0%,#fafbfd_100%)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-foreground">
                      {account.user.username}
                    </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-1 text-[11px] font-medium text-[var(--accent)]">
                    <ShieldCheck className="size-3" />
                    Verified
                  </span>
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    {account.user.telegramUsername}
                  </div>
                </div>
                {account.user.role === "admin" ? (
                  <span className="rounded-full bg-sky-100 px-2 py-1 text-[11px] font-medium text-sky-700">
                    Admin
                  </span>
                ) : null}
              </div>

              <div className="mt-4 rounded-[12px] border border-line bg-[var(--background-soft)] px-4 py-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Current Balance
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
                  {formatUsd(account.balance.available)}
                </div>
                <div className="mt-2 text-sm text-cyan-600">
                  Synced with your archive wallet
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-foreground px-4 py-3 text-sm font-medium text-white transition hover:opacity-92"
                  href="/dashboard/deposit"
                  onClick={() => setOpen(false)}
                >
                  <CreditCard className="size-4" />
                  Deposit Funds
                </Link>
                <Link
                  className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-line bg-white px-4 py-3 text-sm font-medium text-foreground transition hover:bg-[var(--background-strong)]"
                  href="/withdraw"
                  onClick={() => setOpen(false)}
                >
                  <Wallet className="size-4" />
                  Withdraw
                </Link>
              </div>
            </div>

            <div className="mt-3 rounded-[14px] border border-line bg-white p-2">
              {quickLinks.map((item) => (
                <Link
                  key={item.href}
                  className="flex items-center justify-between rounded-[10px] px-3 py-3 text-sm text-muted transition hover:bg-[var(--background-soft)] hover:text-foreground"
                  href={item.href}
                  onClick={() => setOpen(false)}
                >
                  <span>{item.label}</span>
                  <Sparkles className="size-4" />
                </Link>
              ))}

              {account.user.role === "admin" ? (
                <Link
                  className="flex items-center justify-between rounded-[10px] px-3 py-3 text-sm text-muted transition hover:bg-[var(--background-soft)] hover:text-foreground"
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
                  className="mt-1 flex w-full items-center justify-between rounded-[10px] px-3 py-3 text-sm text-muted transition hover:bg-[var(--background-soft)] hover:text-foreground"
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
