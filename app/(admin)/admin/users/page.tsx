import type { ReactNode } from "react";
import {
  sendWithdrawalViaXRocketAction,
  retryWithdrawalTelegramSyncAction,
  updateWithdrawalStatusAction,
} from "@/app/actions/marketplace";
import { AdminUsersManager } from "@/components/admin/admin-users-manager";
import { LiveRefreshControl } from "@/components/rebohrome/live-refresh-control";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import {
  getAdminUsers,
  getAdminWithdrawalRequests,
  getPaymentReconciliationStatus,
  trackUsersPageVisit,
} from "@/lib/db/repository";
import {
  formatDisplayDateTime,
  formatUsd,
  type TelegramSyncStatus,
  type WithdrawalActionSource,
  type WithdrawalStatus,
} from "@/lib/rebohrome-data";
import { getRequestMeta, requireAdminSession } from "@/lib/session";

type AdminUsersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

const statusOptionsByCurrent: Record<WithdrawalStatus, WithdrawalStatus[]> = {
  pending: ["pending", "approved", "declined"],
  approved: ["approved", "processing"],
  processing: ["processing", "completed"],
  completed: ["completed"],
  declined: ["declined"],
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

function formatSourceLabel(source: WithdrawalActionSource) {
  switch (source) {
    case "dashboard":
      return "Dashboard";
    case "telegram":
      return "Telegram";
    case "telegram-unauthorized":
      return "Unauthorized Telegram";
    case "system":
      return "System";
    default:
      return source;
  }
}

function formatActionLabel(value: string) {
  return value
    .replace(/^telegram-/, "")
    .replace(/unauthorized-/g, "Unauthorized ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  const session = await requireAdminSession("/");
  const params = await searchParams;
  const meta = await getRequestMeta("/admin/users");
  const [users, withdrawals, reconciliationStatus] = await Promise.all([
    getAdminUsers(),
    getAdminWithdrawalRequests(),
    getPaymentReconciliationStatus(),
  ]);

  await trackUsersPageVisit({
    eventType: "users_page_visit",
    userId: session.user.id,
    username: session.user.username,
    telegramUsername: session.user.telegramUsername,
    role: session.user.role,
    ipAddress: meta.ipAddress,
    country: meta.country,
    userAgent: meta.userAgent,
    language: meta.language,
    route: meta.route,
    timestamp: meta.timestamp,
  });

  return (
    <AdminShell
      active="users"
      title="Users & Withdrawals"
      description="Manage collector identities, review payout requests, and keep Telegram operations synchronized with your admin control layer."
    >
      {params.withdrawalUpdated === "1" ? (
        <Banner tone="emerald">
          Withdrawal request updated successfully.
        </Banner>
      ) : null}

      {params.telegramSynced === "1" ? (
        <Banner tone="sky">
          Telegram sync retried successfully.
        </Banner>
      ) : null}

      <AdminUsersManager
        initialReconciliationStatus={reconciliationStatus}
        initialUsers={users}
      />

      <section className="mt-6 rounded-[28px] border border-line bg-panel-strong p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-lg font-semibold text-foreground">Withdrawal Requests</div>
            <p className="mt-1 text-sm text-muted">
              Status changes from dashboard or Telegram are tracked in one audit timeline.
            </p>
          </div>
          <LiveRefreshControl label="Refresh withdrawal feed" />
        </div>

        <div className="mt-5 space-y-4">
          {withdrawals.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-line bg-panel px-4 py-6 text-sm text-muted">
              No withdrawal requests yet.
            </div>
          ) : (
            withdrawals.map((entry) => {
              const request = entry.request;
              const selectableStatuses = statusOptionsByCurrent[request.status];
              const syncLabel =
                request.telegramSyncStatus === "synced"
                  ? request.telegramSyncedAt
                    ? `Synced ${formatDisplayDateTime(request.telegramSyncedAt)}`
                    : "Synced"
                  : request.telegramSyncStatus === "error"
                    ? "Sync error"
                    : request.telegramSyncStatus === "stale"
                      ? "Sync stale"
                      : "Sync pending";
              const canSendXRocket =
                request.status === "approved" && !request.xrocketWithdrawalId;

              return (
                <div
                  key={request.id}
                  data-withdrawal-id={request.id}
                  className="rounded-[26px] border border-line bg-panel px-5 py-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-lg font-semibold text-foreground">
                          {request.id}
                        </div>
                        <StatusBadge status={request.status} />
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${syncToneByValue[request.telegramSyncStatus]}`}
                        >
                          {syncLabel}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-muted">
                        {entry.username} / {entry.telegramUsername}
                      </div>
                    </div>

                    <div className="grid gap-3 text-sm text-muted sm:grid-cols-2 lg:min-w-[320px]">
                      <InfoBlock label="Requested" value={formatUsd(request.requestedAmount)} />
                      <InfoBlock label="Final payout" value={formatUsd(request.payoutAmount)} />
                      <InfoBlock
                        label="Created"
                        value={formatDisplayDateTime(request.createdAt)}
                      />
                      <InfoBlock
                        label="Payout formula"
                        value={`${request.basePayoutPercent}% + ${request.bonusPayoutPercent}% = ${request.finalPayoutPercent}%`}
                      />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 lg:grid-cols-4">
                    <InfoBlock label="Wallet" value={request.walletAddress} />
                    <InfoBlock
                      label="Funding Trail"
                      value={`${request.sourceDepositId ?? "No deposit"} / ${
                        request.sourceCardMasked ?? "No card"
                      }`}
                    />
                    <InfoBlock
                      label="Cardholder"
                      value={request.sourceCardholderName ?? "Unavailable"}
                    />
                    <InfoBlock
                      label="Balance Snapshot"
                      value={`Available ${formatUsd(entry.balance.available)} / Pending ${formatUsd(
                        entry.balance.pendingWithdrawal,
                      )}`}
                    />
                  </div>

                  <div className="mt-5 grid gap-3 rounded-[24px] border border-line bg-panel-strong p-4 lg:grid-cols-4">
                    <InfoBlock
                      label="xRocket status"
                      value={request.xrocketStatus ?? "Not sent"}
                    />
                    <InfoBlock
                      label="Provider payout"
                      value={`${request.payoutCurrency ?? "USDT"} / ${request.payoutNetwork ?? "BEP20"}`}
                    />
                    <InfoBlock
                      label="xRocket ID"
                      value={request.xrocketWithdrawalId ?? "Not assigned"}
                    />
                    <InfoBlock
                      label="Tx hash"
                      value={request.payoutTxHash ?? "Not confirmed"}
                    />
                    {request.payoutError ? (
                      <div className="lg:col-span-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                        {request.payoutError}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_auto]">
                    <form
                      action={updateWithdrawalStatusAction}
                      className="grid gap-3 rounded-[24px] border border-line bg-panel-strong p-4 md:grid-cols-[1.2fr_0.6fr_auto]"
                    >
                      <input name="withdrawalId" type="hidden" value={request.id} />
                      <input
                        className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                        defaultValue={request.adminNote ?? ""}
                        name="adminNote"
                        placeholder="Admin note or rejection reason"
                      />
                      <select
                        className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                        defaultValue={request.status}
                        name="status"
                      >
                        {selectableStatuses.map((status) => (
                          <option key={status} value={status}>
                            {statusLabelByValue[status]}
                          </option>
                        ))}
                      </select>
                      <button
                        className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground transition hover:bg-[var(--foreground-soft)]"
                        type="submit"
                      >
                        Save update
                      </button>
                    </form>

                    <form action={retryWithdrawalTelegramSyncAction}>
                      <input name="withdrawalId" type="hidden" value={request.id} />
                      <button
                        className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground transition hover:bg-[var(--foreground-soft)] xl:w-auto"
                        type="submit"
                      >
                        Retry sync
                      </button>
                    </form>
                  </div>

                  <form
                    action={sendWithdrawalViaXRocketAction}
                    className="mt-4 grid gap-3 rounded-[24px] border border-amber-300/20 bg-amber-500/10 p-4 md:grid-cols-[1fr_0.8fr_auto]"
                  >
                    <input name="withdrawalId" type="hidden" value={request.id} />
                    <div className="text-sm text-amber-50">
                      <div className="font-semibold">Send via xRocket</div>
                      <div className="mt-1 text-amber-100/80">
                        Final payout: {formatUsd(request.payoutAmount)} USDT to{" "}
                        {request.walletAddress.slice(0, 6)}...{request.walletAddress.slice(-4)}
                      </div>
                    </div>
                    <input
                      className="rounded-2xl border border-amber-300/20 bg-panel px-4 py-3 text-sm text-foreground outline-none"
                      disabled={!canSendXRocket}
                      name="confirmation"
                      placeholder="Type SEND XROCKET"
                    />
                    <button
                      className="rounded-2xl border border-amber-300/30 bg-amber-400/20 px-4 py-3 text-sm font-semibold text-amber-50 transition hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canSendXRocket}
                      type="submit"
                    >
                      Send via xRocket
                    </button>
                  </form>

                  <div className="mt-5 rounded-[24px] border border-line bg-panel-strong p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-semibold text-foreground">
                        Status Timeline
                      </div>
                      <div className="text-xs text-muted">
                        Last action source: {formatSourceLabel(request.lastActionSource)}
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {entry.history.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-line bg-panel px-4 py-4 text-sm text-muted">
                          No audit events recorded yet.
                        </div>
                      ) : (
                        entry.history.map((history) => (
                          <div
                            key={history.id}
                            className="grid gap-3 rounded-[20px] border border-line bg-panel px-4 py-4 text-sm md:grid-cols-[1.1fr_1fr_1.2fr]"
                          >
                            <div>
                              <div className="font-medium text-foreground">
                                {formatActionLabel(history.actionType)}
                              </div>
                              <div className="mt-1 text-xs text-muted">
                                {history.previousStatus
                                  ? `${statusLabelByValue[history.previousStatus]} -> `
                                  : ""}
                                {statusLabelByValue[history.nextStatus]}
                              </div>
                            </div>
                            <div className="text-muted">
                              <div>{history.adminUsername ?? "System"}</div>
                              <div className="mt-1 text-xs">
                                {history.adminTelegramUsername ??
                                  formatSourceLabel(history.source)}
                              </div>
                            </div>
                            <div className="text-muted">
                              <div>{formatDisplayDateTime(history.createdAt)}</div>
                              <div className="mt-1 text-xs">
                                {history.note || "No note added."}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {request.telegramLastError ? (
                      <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        Telegram sync error: {request.telegramLastError}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </AdminShell>
  );
}

function Banner({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "emerald" | "sky";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-300/50 bg-emerald-100/70 text-emerald-700"
      : "border-sky-300/50 bg-sky-100/70 text-sky-700";

  return (
    <div className={`mb-6 rounded-[20px] border px-4 py-3 text-sm ${toneClass}`}>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: WithdrawalStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusToneByValue[status]}`}
    >
      {statusLabelByValue[status]}
    </span>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-line bg-panel-strong px-4 py-4">
      <div className="text-xs uppercase tracking-[0.24em] text-muted">{label}</div>
      <div className="mt-2 break-all text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
