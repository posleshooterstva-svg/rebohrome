"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { CinematicLoadingOverlay } from "@/components/rebohrome/cinematic-loading-overlay";
import { LiveRefreshControl } from "@/components/rebohrome/live-refresh-control";
import { TrustBlock } from "@/components/rebohrome/trust-block";
import { WITHDRAWAL_POLICY_SUMMARY } from "@/lib/legal-content";
import {
  formatDisplayDateTime,
  formatUsd,
  type BalanceRecord,
  type TelegramSyncStatus,
  type WithdrawalRecord,
  type WithdrawalStatus,
} from "@/lib/rebohrome-data";
import { useAccountExperienceStore } from "@/lib/stores/account-experience-store";

type WithdrawPageClientProps = {
  userId: string;
  balance: BalanceRecord | null;
  walletAddress: string | null;
  telegramId: string | null;
  telegramUsername: string;
  recentWithdrawals: WithdrawalRecord[];
};

const statusLabelByValue: Record<WithdrawalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  processing: "Processing",
  completed: "Completed",
  declined: "Declined",
};

const statusToneByValue: Record<WithdrawalStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-violet-200 bg-violet-50 text-violet-700",
  processing: "border-sky-200 bg-sky-50 text-sky-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  declined: "border-rose-200 bg-rose-50 text-rose-700",
};

const syncToneByValue: Record<TelegramSyncStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  synced: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-rose-200 bg-rose-50 text-rose-700",
  stale: "border-sky-200 bg-sky-50 text-sky-700",
};

function formatSyncLabel(request: WithdrawalRecord) {
  if (request.telegramSyncStatus === "synced") {
    return request.telegramSyncedAt
      ? `Telegram synced ${formatDisplayDateTime(request.telegramSyncedAt)}`
      : "Telegram synced";
  }

  if (request.telegramSyncStatus === "error") {
    return "Telegram sync error";
  }

  if (request.telegramSyncStatus === "stale") {
    return "Telegram sync stale";
  }

  return "Telegram sync pending";
}

export function WithdrawPageClient({
  userId,
  balance,
  walletAddress,
  telegramId,
  telegramUsername,
  recentWithdrawals,
}: WithdrawPageClientProps) {
  const primeAccount = useAccountExperienceStore((state) => state.primeAccount);
  const applyWithdrawalRequest = useAccountExperienceStore(
    (state) => state.applyWithdrawalRequest,
  );
  const liveAccount = useAccountExperienceStore((state) => state.accounts[userId]);
  const [amount, setAmount] = useState("");
  const [wallet, setWallet] = useState(walletAddress ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [optimisticWithdrawals, setOptimisticWithdrawals] = useState(recentWithdrawals);
  const canWithdraw = Boolean(walletAddress && telegramId && telegramUsername);

  useEffect(() => {
    primeAccount(
      userId,
      {
        available: balance?.available ?? 0,
        pendingWithdrawal: balance?.pendingWithdrawal ?? 0,
        totalDeposited: balance?.totalDeposited ?? 0,
        totalSpent: balance?.totalSpent ?? 0,
        totalWithdrawn: balance?.totalWithdrawn ?? 0,
      },
      [],
    );
  }, [balance, primeAccount, userId]);

  useEffect(() => {
    setOptimisticWithdrawals(recentWithdrawals);
  }, [recentWithdrawals]);

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/withdraw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Number(amount),
          walletAddress: wallet,
        }),
      });

      const payload = (await response.json()) as { requestId?: string; error?: string };

      if (!response.ok || !payload.requestId) {
        throw new Error(payload.error || "Unable to create withdrawal request.");
      }

      const numericAmount = Number(amount);
      const requestId = payload.requestId;
      applyWithdrawalRequest(userId, {
        requestId,
        amount: numericAmount,
        summary: `${requestId} · Awaiting manual review`,
      });
      setOptimisticWithdrawals((current) => [
        {
          id: requestId,
          userId,
          amount: numericAmount,
          walletAddress: wallet,
          telegramId: telegramId ?? "",
          status: "pending",
          sourceDepositId: null,
          sourceCardMasked: null,
          sourceCardholderName: null,
          adminNote: null,
          telegramChatId: null,
          telegramMessageId: null,
          telegramSyncStatus: "pending",
          telegramSyncedAt: null,
          telegramLastError: null,
          lastActionSource: "dashboard",
          lastUpdatedByAdminId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...current,
      ]);
      setSuccess(requestId);
      setAmount("");
    } catch (withdrawError) {
      setError(
        withdrawError instanceof Error
          ? withdrawError.message
          : "Unable to create withdrawal request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <CinematicLoadingOverlay
        description="Your payout request is being secured, queued for review, and linked to your archive activity."
        open={isSubmitting}
        title="Submitting Withdrawal"
      />
      <div className="flex justify-end">
        <LiveRefreshControl label="Refresh withdrawal status" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <section className="rounded-[34px] border border-line bg-panel p-6 shadow-panel sm:p-7">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
            Withdrawal
          </p>
          <h2 className="mt-4 display-font text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
            Create Withdrawal Request
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
            Submit a manual withdrawal request for review. Minimum withdrawal amount is $500.
          </p>

          {!canWithdraw ? (
            <div className="mt-8 rounded-[28px] border border-amber-200/70 bg-amber-50/90 p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-white/70 text-amber-600">
                  <ShieldAlert className="size-5" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-foreground">
                    Complete your settings before withdrawing.
                  </div>
                  <p className="mt-2 text-sm leading-7 text-muted">
                    Telegram ID, Telegram username, and USDT BEP20 wallet details must
                    be present in your profile before a withdrawal request can be created.
                  </p>
                  <div className="mt-5">
                    <Link
                      className="inline-flex rounded-2xl bg-[linear-gradient(135deg,#111827,#7266ff)] px-4 py-3 text-sm font-medium text-white transition hover:translate-y-[-1px]"
                      href="/dashboard/settings"
                    >
                      Go to settings
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-[30px] border border-line bg-panel-strong p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Withdrawal Amount"
                  onChange={setAmount}
                  placeholder="500"
                  value={amount}
                />
                <Field
                  label="Telegram Username"
                  onChange={() => undefined}
                  placeholder="@collector"
                  readOnly
                  value={telegramUsername}
                />
                <div className="sm:col-span-2">
                  <Field
                    label="USDT BEP20 Wallet"
                    onChange={setWallet}
                    placeholder="0x..."
                    value={wallet}
                  />
                </div>
              </div>

              <div className="mt-4 rounded-[24px] border border-line bg-panel px-4 py-4 text-sm text-muted">
                Telegram ID: <span className="font-medium text-foreground">{telegramId}</span>
              </div>

              {error ? (
                <div className="mt-5 rounded-2xl border border-rose-200/60 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              {success ? (
                <div className="mt-5 rounded-2xl border border-emerald-200/60 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700">
                  Withdrawal request created: <span className="font-semibold">{success}</span>
                </div>
              ) : null}

              <button
                className="mt-6 inline-flex w-full items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#111827,#7266ff)] px-5 py-4 text-sm font-medium text-white transition hover:translate-y-[-1px] disabled:opacity-50"
                disabled={isSubmitting}
                onClick={handleSubmit}
                type="button"
              >
                Submit Request
              </button>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="rounded-[34px] border border-line bg-panel p-6 shadow-panel">
            <div className="text-lg font-semibold text-foreground">Withdrawal Summary</div>
            <div className="mt-5 space-y-3">
              <SummaryRow
                label="Available balance"
                value={formatUsd(liveAccount?.balance.available ?? balance?.available ?? 0)}
              />
              <SummaryRow
                label="Pending withdrawals"
                value={formatUsd(
                  liveAccount?.balance.pendingWithdrawal ?? balance?.pendingWithdrawal ?? 0,
                )}
              />
              <SummaryRow
                label="Total withdrawn"
                value={formatUsd(liveAccount?.balance.totalWithdrawn ?? balance?.totalWithdrawn ?? 0)}
              />
            </div>
          </section>

          <section className="rounded-[34px] border border-line bg-panel p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold text-foreground">Payout Settings</div>
              <Link
                className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)]"
                href="/dashboard/settings"
              >
                Update
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
            <div className="mt-5 space-y-3">
              <SummaryRow label="Telegram Username" value={telegramUsername || "Missing"} />
              <SummaryRow label="Telegram ID" value={telegramId || "Missing"} />
              <SummaryRow label="USDT BEP20 Wallet" value={walletAddress || "Missing"} />
            </div>
          </section>

          <section className="rounded-[34px] border border-line bg-panel p-6 shadow-panel">
            <div className="text-lg font-semibold text-foreground">Withdrawal Rules</div>
            <div className="mt-5 space-y-3 text-sm leading-7 text-muted">
              {WITHDRAWAL_POLICY_SUMMARY.map((item) => (
                <div
                  key={item}
                  className="rounded-[22px] border border-line bg-panel-strong px-4 py-4"
                >
                  {item}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <section className="rounded-[34px] border border-line bg-panel p-6 shadow-panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-lg font-semibold text-foreground">Withdrawal History</div>
            <p className="mt-1 text-sm text-muted">
              Follow approval, processing, and completion updates as admin actions land.
            </p>
          </div>
          <LiveRefreshControl label="Refresh history" />
        </div>

        <div className="mt-5 space-y-3">
          {optimisticWithdrawals.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-line bg-panel-strong px-4 py-6 text-sm text-muted">
              No withdrawal requests yet.
            </div>
          ) : (
            optimisticWithdrawals.map((request) => (
              <div
                key={request.id}
                className="rounded-[24px] border border-line bg-panel-strong px-4 py-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-sm font-semibold text-foreground">{request.id}</div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusToneByValue[request.status]}`}
                      >
                        {statusLabelByValue[request.status]}
                      </span>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${syncToneByValue[request.telegramSyncStatus]}`}
                      >
                        {formatSyncLabel(request)}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-muted">{request.walletAddress}</div>
                  </div>

                  <div className="text-sm font-medium text-foreground">
                    {formatUsd(request.amount)}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
                  <SummaryRow label="Requested" value={formatDisplayDateTime(request.createdAt)} />
                  <SummaryRow label="Last updated" value={formatDisplayDateTime(request.updatedAt)} />
                  <SummaryRow
                    label="Funding trail"
                    value={`${request.sourceDepositId ?? "No deposit"} / ${
                      request.sourceCardMasked ?? "No card"
                    }`}
                  />
                </div>

                <div className="mt-4 rounded-2xl border border-line bg-panel px-3 py-3 text-xs leading-6 text-muted">
                  {request.adminNote || "No admin notes yet."}
                </div>

                {request.telegramLastError ? (
                  <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700">
                    Telegram sync error: {request.telegramLastError}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <TrustBlock />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-foreground">{label}</span>
      <input
        className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        value={value}
      />
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[22px] border border-line bg-panel-strong px-4 py-4 text-sm">
      <span className="text-muted">{label}</span>
      <span className="break-all text-right font-semibold text-foreground">{value}</span>
    </div>
  );
}
