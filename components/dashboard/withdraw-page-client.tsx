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
  calculateWithdrawalPayout,
  getPayoutTierProgress,
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
  pending: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  approved: "border-violet-300/25 bg-violet-500/12 text-violet-100",
  processing: "border-sky-300/25 bg-sky-400/10 text-sky-100",
  completed: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
  declined: "border-rose-300/25 bg-rose-400/10 text-rose-100",
};

const syncToneByValue: Record<TelegramSyncStatus, string> = {
  pending: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  synced: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
  error: "border-rose-300/25 bg-rose-400/10 text-rose-100",
  stale: "border-sky-300/25 bg-sky-400/10 text-sky-100",
};

function formatSyncLabel(request: WithdrawalRecord) {
  if (request.telegramSyncStatus === "synced") {
    return request.telegramSyncedAt
      ? `Status updated ${formatDisplayDateTime(request.telegramSyncedAt)}`
      : "Status updated by ReboHrome";
  }

  if (request.telegramSyncStatus === "error") {
    return "Status update delayed";
  }

  if (request.telegramSyncStatus === "stale") {
    return "Status refresh needed";
  }

  return "Awaiting platform update";
}

function maskWallet(value: string | null) {
  const text = String(value || "").trim();
  if (!text) {
    return "Missing";
  }
  if (text.length <= 14) {
    return text;
  }
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function formatUserFacingAdminNote(value: string | null) {
  const text = String(value || "").trim();
  if (!text) {
    return "No platform notes yet.";
  }

  if (/telegram action/i.test(text)) {
    const action = text.split(":").pop()?.trim();
    return action
      ? `Withdrawal status updated: ${action.charAt(0).toUpperCase()}${action.slice(1)}`
      : "Withdrawal status updated by ReboHrome.";
  }

  return text;
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
  const walletIsValid = /^0x[a-fA-F0-9]{40}$/.test(wallet.trim());
  const canWithdraw = Boolean(walletIsValid && telegramId && telegramUsername);
  const numericAmount = Number(amount || 0);
  const payoutPreview = calculateWithdrawalPayout({
    requestedAmount: Number.isFinite(numericAmount) ? numericAmount : 0,
    totalDepositedUsd: balance?.totalDeposited ?? 0,
  });
  const tierProgress = getPayoutTierProgress(balance?.totalDeposited ?? 0);

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
      if (!/^0x[a-fA-F0-9]{40}$/.test(wallet.trim())) {
        throw new Error("Please enter a valid USDT BEP20 wallet address.");
      }

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
          requestedAmount: numericAmount,
          basePayoutPercent: payoutPreview.basePayoutPercent,
          bonusPayoutPercent: payoutPreview.bonusPayoutPercent,
          finalPayoutPercent: payoutPreview.finalPayoutPercent,
          payoutAmount: payoutPreview.payoutAmount,
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
          statusUpdatedBy: null,
          statusUpdatedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          payoutProvider: null,
          payoutCurrency: "USDT",
          payoutNetwork: "BSC",
          payoutAddress: wallet.trim(),
          xrocketWithdrawalId: null,
          xrocketStatus: null,
          xrocketRawResponse: null,
          xrocketSentAt: null,
          xrocketConfirmedAt: null,
          payoutTxHash: null,
          payoutError: null,
          payoutAttempts: 0,
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
    <div className="space-y-8">
      <CinematicLoadingOverlay
        description="Your payout request is being secured, queued for review, and linked to your archive activity."
        open={isSubmitting}
        title="Submitting Withdrawal"
      />
      <div className="flex justify-end">
        <LiveRefreshControl label="Refresh withdrawal status" />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.25fr)_420px]">
        <section className="rounded-[34px] border border-line bg-panel p-6 shadow-panel sm:p-8">
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
            <div className="mt-8 rounded-[28px] border border-amber-300/20 bg-amber-400/10 p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-amber-100">
                  <ShieldAlert className="size-5" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-foreground">
                    Complete your settings before withdrawing.
                  </div>
                  <p className="mt-2 text-sm leading-7 text-muted">
                    Verified account details and USDT BEP20 wallet details must
                    be present in your profile before a withdrawal request can be created.
                  </p>
                  <div className="mt-5">
                    <Link
                      className="inline-flex rounded-2xl bg-[linear-gradient(135deg,#a78bfa,#6d4df2)] px-4 py-3 text-sm font-medium text-white shadow-[0_14px_34px_rgba(139,92,246,0.28)] transition hover:translate-y-[-1px]"
                      href="/dashboard/settings"
                    >
                      Go to settings
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-[30px] border border-line bg-panel-strong p-6 sm:p-7">
              <div className="grid gap-5 lg:grid-cols-2">
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

              <div className="mt-5 rounded-[24px] border border-line bg-panel px-4 py-4 text-sm text-muted">
                Verified collector ID: <span className="font-medium text-foreground">{telegramId}</span>
              </div>

              <div className="mt-5 rounded-[26px] border border-violet-300/16 bg-[linear-gradient(135deg,rgba(139,92,246,0.12),rgba(255,255,255,0.035))] p-5">
                <div className="text-sm font-semibold text-foreground">Payout preview</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <SummaryRow label="Requested amount" value={formatUsd(Number.isFinite(numericAmount) ? numericAmount : 0)} />
                  <SummaryRow label="Base percent" value={`${payoutPreview.basePayoutPercent}%`} />
                  <SummaryRow label="User bonus" value={`+${payoutPreview.bonusPayoutPercent}%`} />
                  <SummaryRow label="Final percent" value={`${payoutPreview.finalPayoutPercent}%`} />
                </div>
                <div className="mt-3 rounded-[22px] border border-emerald-300/20 bg-emerald-400/10 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-emerald-100/80">
                    Estimated payout
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-emerald-100">
                    {formatUsd(payoutPreview.payoutAmount)}
                  </div>
                </div>
              </div>

              {error ? (
                <div className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              ) : null}

              {success ? (
                <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                  Withdrawal request created: <span className="font-semibold">{success}</span>
                </div>
              ) : null}

              <button
                className="mt-6 inline-flex w-full items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#a78bfa,#6d4df2)] px-5 py-4 text-sm font-medium text-white shadow-[0_18px_44px_rgba(139,92,246,0.28)] transition hover:translate-y-[-1px] disabled:opacity-50"
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
              <SummaryRow
                label="Tier progress"
                value={`${formatUsd(balance?.totalDeposited ?? 0)} / ${formatUsd(tierProgress.nextThreshold)}`}
              />
              <SummaryRow
                label="Current bonus"
                value={`+${tierProgress.currentBonus}%`}
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
              <SummaryRow label="Verified username" value={telegramUsername || "Missing"} />
              <SummaryRow label="Verified ID" value={telegramId || "Missing"} />
              <SummaryRow label="USDT BEP20 Wallet" value={maskWallet(walletAddress)} />
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
                    {formatUsd(request.payoutAmount ?? request.amount)}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
                  <SummaryRow label="Requested amount" value={formatUsd(request.requestedAmount ?? request.amount)} />
                  <SummaryRow label="Final payout" value={formatUsd(request.payoutAmount ?? request.amount)} />
                  <SummaryRow label="Final percent" value={`${request.finalPayoutPercent ?? 60}%`} />
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
                  {formatUserFacingAdminNote(request.adminNote)}
                </div>

                {request.telegramLastError ? (
                  <div className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-3 py-3 text-xs text-rose-100">
                    Platform status update delayed: {request.telegramLastError}
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
