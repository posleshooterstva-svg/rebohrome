"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  createAdminUserInlineAction,
  deleteAdminUserInlineAction,
  reconcileTransVoucherPaymentsInlineAction,
  updateAdminUserInlineAction,
} from "@/app/actions/marketplace";
import { Button } from "@/components/ui/button";
import {
  formatDisplayDateTime,
  formatUsd,
  getEffectivePayoutBonusPercent,
  getPayoutBonusPercent,
  getPayoutTierProgress,
  isKycVerified,
  type BalanceRecord,
  type PaymentGateAccessRecord,
  type PaymentReconciliationStatus,
  type UserKycProfileRecord,
  type UserRecord,
} from "@/lib/rebohrome-data";
import { cn } from "@/lib/utils";

type AdminUserEntry = {
  user: UserRecord;
  balance: BalanceRecord;
  kycProfile?: UserKycProfileRecord | null;
  paymentGateAccess?: PaymentGateAccessRecord[];
};

type AdminUsersManagerProps = {
  initialUsers: AdminUserEntry[];
  initialReconciliationStatus: PaymentReconciliationStatus;
};

function isKycDeclinedStatus(status: UserRecord["kycStatus"]) {
  return ["declined", "manual_declined", "manual_rejected"].includes(status);
}

function isKycPendingStatus(status: UserRecord["kycStatus"]) {
  return ["session_created", "submitted", "review"].includes(status);
}

function getKycVerificationSource(user: UserRecord) {
  if (user.kycManualOverride && user.kycStatus === "manual_approved") {
    return "Manual admin";
  }

  if (user.kycStatus === "approved" && user.veriffDecision === "approved") {
    return "Veriff decision";
  }

  if (user.kycVerified && !isKycVerified(user)) {
    return "Inconsistent / needs review";
  }

  return "Not verified";
}

type UserDraft = {
  name: string;
  role: UserRecord["role"];
  status: UserRecord["status"];
  telegramUsername: string;
  telegramId: string;
  verified: boolean;
};

type AccountDataDraft = {
  availableBalance: string;
  pendingWithdrawal: string;
  totalDeposited: string;
  totalSpent: string;
  totalWithdrawn: string;
  payoutBonusOverrideEnabled: boolean;
  payoutBonusPercent: string;
  telegramUsername: string;
  telegramId: string;
  telegramChatId: string;
  telegramVerified: boolean;
  telegramVerifiedAt: string;
  gate2FirstName: string;
  gate2LastName: string;
  gate2Phone: string;
  email: string;
  role: UserRecord["role"];
  status: UserRecord["status"];
  verificationStatus: boolean;
  requirePasswordReset: boolean;
  reason: string;
  resetConfirmation: string;
};

type CreateUserDraft = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: "collector" | "administrator";
  status: "active" | "under_review" | "frozen" | "blocked";
  telegramUsername: string;
  initialBalance: string;
  adminNote: string;
  requirePasswordReset: boolean;
  telegramVerified: boolean;
};

type ToastState =
  | {
      tone: "success" | "error";
      message: string;
    }
  | null;

const emptyCreateDraft: CreateUserDraft = {
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "collector",
  status: "active",
  telegramUsername: "",
  initialBalance: "0",
  adminNote: "",
  requirePasswordReset: false,
  telegramVerified: false,
};

const statusOptions: Array<Exclude<UserRecord["status"], "suspended">> = [
  "active",
  "under_review",
  "frozen",
  "blocked",
];

function createDraft(entry: AdminUserEntry): UserDraft {
  return {
    name: entry.user.name,
    role: entry.user.role,
    status: normalizeVisibleStatus(entry.user.status),
    telegramUsername: entry.user.telegramUsername,
    telegramId: entry.user.telegramId ?? "",
    verified: entry.user.telegramVerified,
  };
}

function toDateTimeLocal(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function createAccountDataDraft(entry: AdminUserEntry): AccountDataDraft {
  return {
    availableBalance: String(entry.balance.available ?? 0),
    pendingWithdrawal: String(entry.balance.pendingWithdrawal ?? 0),
    totalDeposited: String(entry.balance.totalDeposited ?? 0),
    totalSpent: String(entry.balance.totalSpent ?? 0),
    totalWithdrawn: String(entry.balance.totalWithdrawn ?? 0),
    payoutBonusOverrideEnabled: entry.balance.payoutBonusOverrideEnabled,
    payoutBonusPercent: String(
      entry.balance.payoutBonusPercent ??
        getPayoutBonusPercent(entry.balance.totalDeposited),
    ),
    telegramUsername: entry.user.telegramUsername,
    telegramId: entry.user.telegramId ?? "",
    telegramChatId: entry.user.telegramChatId ?? "",
    telegramVerified: entry.user.telegramVerified,
    telegramVerifiedAt: toDateTimeLocal(entry.user.telegramVerifiedAt),
    gate2FirstName: entry.user.gate2FirstName ?? "",
    gate2LastName: entry.user.gate2LastName ?? "",
    gate2Phone: entry.user.gate2Phone ?? entry.user.paymentPhone ?? "",
    email: entry.user.email,
    role: entry.user.role,
    status: normalizeVisibleStatus(entry.user.status),
    verificationStatus: entry.user.verified,
    requirePasswordReset: entry.user.requirePasswordReset,
    reason: "",
    resetConfirmation: "",
  };
}

function normalizeAccountDraft(draft: AccountDataDraft) {
  return JSON.stringify({
    ...draft,
    availableBalance: Number(draft.availableBalance || 0),
    pendingWithdrawal: Number(draft.pendingWithdrawal || 0),
    totalDeposited: Number(draft.totalDeposited || 0),
    totalSpent: Number(draft.totalSpent || 0),
    totalWithdrawn: Number(draft.totalWithdrawn || 0),
    payoutBonusPercent: Number(draft.payoutBonusPercent || 0),
    telegramUsername: draft.telegramUsername.trim(),
    telegramId: draft.telegramId.trim(),
    telegramChatId: draft.telegramChatId.trim(),
    gate2FirstName: draft.gate2FirstName.trim(),
    gate2LastName: draft.gate2LastName.trim(),
    gate2Phone: draft.gate2Phone.trim(),
    email: draft.email.trim().toLowerCase(),
    reason: "",
    resetConfirmation: "",
  });
}

function hasFinancialDraftChanges(entry: AdminUserEntry, draft: AccountDataDraft) {
  const baseline = createAccountDataDraft(entry);
  return [
    "availableBalance",
    "pendingWithdrawal",
    "totalDeposited",
    "totalSpent",
    "totalWithdrawn",
    "payoutBonusOverrideEnabled",
    "payoutBonusPercent",
  ].some((key) => {
    const typedKey = key as keyof AccountDataDraft;
    return baseline[typedKey] !== draft[typedKey];
  });
}

function normalizeVisibleStatus(status: UserRecord["status"]) {
  return status === "suspended" ? "blocked" : status;
}

function normalizeDraft(draft: UserDraft) {
  return JSON.stringify({
    ...draft,
    name: draft.name.trim(),
    telegramUsername: draft.telegramUsername.trim(),
    telegramId: draft.telegramId.trim(),
  });
}

function getRoleLabel(role: UserRecord["role"] | CreateUserDraft["role"]) {
  if (role === "admin" || role === "administrator") {
    return "Administrator";
  }

  return "Collector";
}

function getStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function AdminUsersManager({
  initialReconciliationStatus,
  initialUsers,
}: AdminUsersManagerProps) {
  const [users, setUsers] = useState(initialUsers);
  const [reconciliationStatus, setReconciliationStatus] = useState(
    initialReconciliationStatus,
  );
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRecord["role"]>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | UserRecord["status"]>("all");
  const [verifiedFilter, setVerifiedFilter] = useState<"all" | "verified" | "unverified">("all");
  const [kycFilter, setKycFilter] = useState<
    "all" | "verified" | "unverified" | "pending" | "declined" | "not_started"
  >("all");
  const [deletedFilter, setDeletedFilter] = useState<"active" | "deleted" | "all">("active");
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState<AdminUserEntry | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [isReconciling, startReconcileTransition] = useTransition();
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return users.filter((entry) => {
      const status = normalizeVisibleStatus(entry.user.status);
      const queryMatch =
        !normalizedQuery ||
        entry.user.username.toLowerCase().includes(normalizedQuery) ||
        entry.user.name.toLowerCase().includes(normalizedQuery) ||
        entry.user.email.toLowerCase().includes(normalizedQuery) ||
        entry.user.telegramUsername.toLowerCase().includes(normalizedQuery);
      const roleMatch = roleFilter === "all" || entry.user.role === roleFilter;
      const statusMatch = statusFilter === "all" || status === statusFilter;
      const deletedMatch =
        deletedFilter === "all" ||
        (deletedFilter === "deleted" ? entry.user.isDeleted : !entry.user.isDeleted);
      const verifiedMatch =
        verifiedFilter === "all" ||
        (verifiedFilter === "verified"
          ? entry.user.telegramVerified
          : !entry.user.telegramVerified);
      const kycVerified = isKycVerified(entry.user);
      const kycPending = isKycPendingStatus(entry.user.kycStatus);
      const kycDeclined = isKycDeclinedStatus(entry.user.kycStatus);
      const kycMatch =
        kycFilter === "all" ||
        (kycFilter === "verified"
          ? kycVerified
          : kycFilter === "unverified"
            ? !kycVerified
            : kycFilter === "pending"
              ? kycPending
              : kycFilter === "declined"
                ? kycDeclined
                : entry.user.kycStatus === "not_started");

      return queryMatch && roleMatch && statusMatch && verifiedMatch && kycMatch && deletedMatch;
    });
  }, [deferredQuery, deletedFilter, kycFilter, roleFilter, statusFilter, users, verifiedFilter]);

  const activeEntry = users.find((entry) => entry.user.id === activeUserId) ?? null;

  function handleSaved(nextEntry: AdminUserEntry) {
    setUsers((current) =>
      current.map((entry) => (entry.user.id === nextEntry.user.id ? nextEntry : entry)),
    );
    setActiveUserId(null);
  }

  function handleUpdated(nextEntry: AdminUserEntry) {
    setUsers((current) =>
      current.map((entry) => (entry.user.id === nextEntry.user.id ? nextEntry : entry)),
    );
  }

  function handleCreated(nextEntry: AdminUserEntry) {
    setUsers((current) => [nextEntry, ...current]);
    setCreateOpen(false);
    setActiveUserId(nextEntry.user.id);
  }

  function handleDeleted(nextEntry: AdminUserEntry) {
    setUsers((current) =>
      current.map((entry) => (entry.user.id === nextEntry.user.id ? nextEntry : entry)),
    );
    setActiveUserId(null);
    setDeleteEntry(null);
  }

  function handleReconcile() {
    if (isReconciling) {
      return;
    }

    startReconcileTransition(async () => {
      const result = await reconcileTransVoucherPaymentsInlineAction();
      if (!result.ok) {
        setToast({ tone: "error", message: result.error });
        return;
      }

      setToast({
        tone: "success",
        message: `${result.message} Succeeded: ${result.summary.succeeded}, failed: ${result.summary.failed}, pending: ${result.summary.pending}.`,
      });
      setReconciliationStatus((current) => ({
        ...current,
        lastRunAt: result.summary.lastRunAt,
        pendingTransactions: result.summary.pending,
        checkedLastHour: current.checkedLastHour + result.summary.checked,
        succeededByCron: current.succeededByCron + result.summary.succeeded,
        failedByCron: current.failedByCron + result.summary.failed,
        expiredByCron: current.expiredByCron + result.summary.expired,
        lastError: result.summary.lastError,
      }));
    });
  }

  return (
    <>
      <Toast toast={toast} />

      <section className="rounded-[28px] border border-line bg-panel-strong p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-lg font-semibold text-foreground">Collectors</div>
            <p className="mt-1 text-sm text-muted">
              Manage accounts, roles, payment details, verification, and onboarding.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled={isReconciling} onClick={handleReconcile} type="button" variant="secondary">
              {isReconciling ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Manual Status Refresh
            </Button>
            <Button onClick={() => setCreateOpen(true)} type="button">
              <UserPlus className="size-4" />
              Create User
            </Button>
          </div>
        </div>

        <div className="mt-5 rounded-[20px] border border-line bg-panel px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">
                Payment Reconciliation Status
              </div>
              <p className="mt-1 text-sm leading-6 text-muted">
                Automatic Vercel Cron checks TransVoucher payments in the background.
                Manual refresh is only a fallback/debug tool.
              </p>
            </div>
            <Badge tone={reconciliationStatus.lastError ? "rose" : "emerald"}>
              {reconciliationStatus.lastError ? "Last run had errors" : "Automatic"}
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <InlineMeta
              label="Last cron run"
              value={
                reconciliationStatus.lastRunAt
                  ? formatDisplayDateTime(reconciliationStatus.lastRunAt)
                  : "Not yet"
              }
            />
            <InlineMeta label="Pending" value={String(reconciliationStatus.pendingTransactions)} />
            <InlineMeta label="Checked 1h" value={String(reconciliationStatus.checkedLastHour)} />
            <InlineMeta label="Succeeded" value={String(reconciliationStatus.succeededByCron)} />
            <InlineMeta label="Failed" value={String(reconciliationStatus.failedByCron)} />
            <InlineMeta label="Expired" value={String(reconciliationStatus.expiredByCron)} />
          </div>
          {reconciliationStatus.lastError ? (
            <div className="mt-3 rounded-[14px] border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
              Last error: {reconciliationStatus.lastError}
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1.4fr_repeat(5,minmax(0,0.78fr))]">
          <label className="flex items-center gap-3 rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3">
            <Search className="size-4 text-muted" />
            <input
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by username, email, profile name, or Telegram"
              value={query}
            />
          </label>
          <select
            className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none"
            onChange={(event) => setRoleFilter(event.target.value as "all" | UserRecord["role"])}
            value={roleFilter}
          >
            <option value="all">All roles</option>
            <option value="user">Collectors</option>
            <option value="admin">Administrators</option>
          </select>
          <select
            className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none"
            onChange={(event) => setStatusFilter(event.target.value as "all" | UserRecord["status"])}
            value={statusFilter}
          >
            <option value="all">All status</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {getStatusLabel(status)}
              </option>
            ))}
          </select>
          <select
            className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none"
            onChange={(event) =>
              setVerifiedFilter(event.target.value as "all" | "verified" | "unverified")
            }
            value={verifiedFilter}
          >
            <option value="all">All verification</option>
            <option value="verified">Telegram verified</option>
            <option value="unverified">Telegram unverified</option>
          </select>
          <select
            className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none"
            onChange={(event) =>
              setKycFilter(
                event.target.value as
                  | "all"
                  | "verified"
                  | "unverified"
                  | "pending"
                  | "declined"
                  | "not_started",
              )
            }
            value={kycFilter}
          >
            <option value="all">All KYC</option>
            <option value="verified">KYC verified</option>
            <option value="unverified">KYC unverified</option>
            <option value="pending">KYC pending</option>
            <option value="declined">KYC declined</option>
            <option value="not_started">KYC not started</option>
          </select>
          <select
            className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none"
            onChange={(event) =>
              setDeletedFilter(event.target.value as "active" | "deleted" | "all")
            }
            value={deletedFilter}
          >
            <option value="active">Active users</option>
            <option value="deleted">Deleted users</option>
            <option value="all">All users</option>
          </select>
        </div>

        <div className="mt-6 space-y-3">
          {filteredUsers.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-line bg-panel px-4 py-8 text-sm text-muted">
              No users match the current filters.
            </div>
          ) : (
            filteredUsers.map((entry) => (
              <UserCard
                entry={entry}
                key={entry.user.id}
                onEdit={() => setActiveUserId(entry.user.id)}
                onDelete={() => setDeleteEntry(entry)}
              />
            ))
          )}
        </div>
      </section>

      <AnimatePresence>
        {createOpen ? (
          <CreateUserDrawer
            key="create-user"
            onClose={() => setCreateOpen(false)}
            onCreated={handleCreated}
            onNotify={setToast}
          />
        ) : null}
        {activeEntry ? (
          <AdminUserDrawer
            key={activeEntry.user.id}
            entry={activeEntry}
            onClose={() => setActiveUserId(null)}
            onNotify={setToast}
            onSaved={handleSaved}
            onUpdated={handleUpdated}
            onDelete={() => setDeleteEntry(activeEntry)}
          />
        ) : null}
        {deleteEntry ? (
          <DeleteUserDialog
            entry={deleteEntry}
            key={`delete-${deleteEntry.user.id}`}
            onClose={() => setDeleteEntry(null)}
            onDeleted={handleDeleted}
            onNotify={setToast}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function Toast({ toast }: { toast: ToastState }) {
  return (
    <AnimatePresence>
      {toast ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "fixed right-5 top-5 z-[220] w-[min(420px,calc(100vw-2rem))] rounded-[16px] border px-4 py-3 text-sm shadow-[0_24px_64px_rgba(15,23,42,0.12)] backdrop-blur",
            toast.tone === "success"
              ? "border-emerald-200 bg-white/96 text-emerald-700"
              : "border-rose-200 bg-white/96 text-rose-700",
          )}
          exit={{ opacity: 0, y: -12 }}
          initial={{ opacity: 0, y: -18 }}
        >
          {toast.message}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function UserCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: AdminUserEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = normalizeVisibleStatus(entry.user.status);

  return (
    <article className="grid gap-4 rounded-[22px] border border-line bg-panel px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">
            {entry.user.username}
          </h3>
          {entry.user.role === "admin" ? (
            <Badge tone="sky">Administrator</Badge>
          ) : (
            <Badge tone="violet">Collector</Badge>
          )}
          {entry.user.telegramVerified ? (
            <Badge tone="emerald">Telegram Verified</Badge>
          ) : (
            <Badge tone="amber">Telegram Pending</Badge>
          )}
          {isKycVerified(entry.user) ? (
            <Badge tone="emerald">KYC Verified</Badge>
          ) : entry.user.kycStatus === "manual_approved" ? (
            <Badge tone="sky">Manual KYC</Badge>
          ) : entry.user.kycVerified ? (
            <Badge tone="rose">KYC Inconsistent</Badge>
          ) : isKycDeclinedStatus(entry.user.kycStatus) ? (
            <Badge tone="rose">KYC Declined</Badge>
          ) : isKycPendingStatus(entry.user.kycStatus) ? (
            <Badge tone="amber">KYC Pending</Badge>
          ) : (
            <Badge tone="violet">KYC Not Started</Badge>
          )}
          {status === "active" ? null : <Badge tone="rose">{getStatusLabel(status)}</Badge>}
          {entry.user.isDeleted ? <Badge tone="rose">Deleted</Badge> : null}
        </div>
        <div className="mt-1 text-sm text-muted">{entry.user.name}</div>
        <div className="mt-2 text-sm text-muted">{entry.user.email}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted">
          <span>{entry.user.telegramUsername}</span>
          <span>-</span>
          <span>{entry.user.telegramChatId ? "Chat linked" : "Chat not linked"}</span>
          {entry.user.requirePasswordReset ? (
            <>
              <span>-</span>
              <span>Password reset required</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 text-sm text-muted sm:grid-cols-2">
        <InlineMeta label="Balance" value={formatUsd(entry.balance.available)} />
        <InlineMeta label="Deposited" value={formatUsd(entry.balance.totalDeposited)} />
        <InlineMeta
          label="Last login"
          value={
            entry.user.lastLoginAt
              ? formatDisplayDateTime(entry.user.lastLoginAt)
              : "No logins yet"
          }
        />
        <InlineMeta label="Registered" value={formatDisplayDateTime(entry.user.createdAt)} />
      </div>

      <div className="flex flex-wrap items-center justify-start gap-3 md:justify-end">
        <Link
          className="inline-flex items-center gap-2 rounded-[14px] border border-line bg-panel px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-[var(--foreground-soft)]"
          href={`/admin/users/${entry.user.id}`}
        >
          <SlidersHorizontal className="size-4" />
          Control Center
        </Link>
        <Button onClick={onEdit} type="button" variant="secondary">
          <PencilLine className="size-4" />
          Edit User
        </Button>
        <Button disabled={entry.user.isDeleted} onClick={onDelete} type="button" variant="destructive">
          <Trash2 className="size-4" />
          Delete User
        </Button>
      </div>
    </article>
  );
}

function CreateUserDrawer({
  onClose,
  onCreated,
  onNotify,
}: {
  onClose: () => void;
  onCreated: (entry: AdminUserEntry) => void;
  onNotify: (toast: ToastState) => void;
}) {
  const [draft, setDraft] = useState<CreateUserDraft>(emptyCreateDraft);
  const [isPending, startTransition] = useTransition();

  function updateField<Key extends keyof CreateUserDraft>(
    key: Key,
    value: CreateUserDraft[Key],
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleSubmit() {
    if (isPending) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("username", draft.username);
      formData.append("email", draft.email);
      formData.append("password", draft.password);
      formData.append("confirmPassword", draft.confirmPassword);
      formData.append("role", draft.role);
      formData.append("status", draft.status);
      formData.append("telegramUsername", draft.telegramUsername);
      formData.append("initialBalance", draft.initialBalance || "0");
      formData.append("adminNote", draft.adminNote);
      formData.append("requirePasswordReset", draft.requirePasswordReset ? "true" : "false");
      formData.append("telegramVerified", draft.telegramVerified ? "true" : "false");

      const result = await createAdminUserInlineAction(formData);

      if (!result.ok) {
        onNotify({ tone: "error", message: result.error });
        return;
      }

      onCreated(result.userEntry);
      onNotify({ tone: "success", message: result.message });
    });
  }

  return (
    <DrawerShell
      eyebrow="Create User"
      onClose={onClose}
      subtitle="Manual onboarding for support, tests, and internal operations."
      title="New account"
    >
      <div className="space-y-5">
        <section className="rounded-[18px] border border-line bg-white p-5">
          <div className="text-sm font-semibold text-foreground">Identity</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Username" onChange={(value) => updateField("username", value)} value={draft.username} />
            <Field label="Email" onChange={(value) => updateField("email", value)} value={draft.email} />
            <Field
              label="Password"
              onChange={(value) => updateField("password", value)}
              type="password"
              value={draft.password}
            />
            <Field
              label="Confirm Password"
              onChange={(value) => updateField("confirmPassword", value)}
              type="password"
              value={draft.confirmPassword}
            />
            <SelectField
              label="Role"
              onChange={(value) => updateField("role", value as CreateUserDraft["role"])}
              options={["collector", "administrator"]}
              value={draft.role}
            />
            <SelectField
              label="Account Status"
              onChange={(value) => updateField("status", value as CreateUserDraft["status"])}
              options={statusOptions}
              value={draft.status}
            />
          </div>
        </section>

        <section className="rounded-[18px] border border-line bg-white p-5">
          <div className="text-sm font-semibold text-foreground">Telegram & balance</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field
              label="Telegram Username"
              onChange={(value) => updateField("telegramUsername", value)}
              placeholder="@username"
              value={draft.telegramUsername}
            />
            <Field
              label="Initial Balance"
              onChange={(value) => updateField("initialBalance", value)}
              type="number"
              value={draft.initialBalance}
            />
          </div>
          <div className="mt-4 grid gap-3">
            <ToggleField
              checked={draft.requirePasswordReset}
              description="Store a first-login reset requirement on the account."
              label="Require password reset on first login"
              onChange={(value) => updateField("requirePasswordReset", value)}
            />
            <ToggleField
              checked={draft.telegramVerified}
              description="Mark Telegram identity as manually verified and log this in admin audit metadata."
              label="Telegram verified manually"
              onChange={(value) => updateField("telegramVerified", value)}
            />
          </div>
        </section>

        <section className="rounded-[18px] border border-line bg-white p-5">
          <Field
            label="Admin Note"
            multiline
            onChange={(value) => updateField("adminNote", value)}
            value={draft.adminNote}
          />
        </section>

        <StickyActions
          isPending={isPending}
          onCancel={onClose}
          onSubmit={handleSubmit}
          submitLabel="Create User"
          workingLabel="Creating..."
        />
      </div>
    </DrawerShell>
  );
}

function AdminUserDrawer({
  entry,
  onClose,
  onDelete,
  onSaved,
  onUpdated,
  onNotify,
}: {
  entry: AdminUserEntry;
  onClose: () => void;
  onDelete: () => void;
  onSaved: (entry: AdminUserEntry) => void;
  onUpdated: (entry: AdminUserEntry) => void;
  onNotify: (toast: ToastState) => void;
}) {
  const [draft, setDraft] = useState<UserDraft>(() => createDraft(entry));
  const [accountDataOpen, setAccountDataOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setDraft(createDraft(entry));
    setAccountDataOpen(false);
  }, [entry]);

  const isDirty = normalizeDraft(draft) !== normalizeDraft(createDraft(entry));
  const tierProgress = getPayoutTierProgress(entry.balance.totalDeposited);
  const payoutBonus = getEffectivePayoutBonusPercent({
    totalDepositedUsd: entry.balance.totalDeposited,
    payoutBonusOverrideEnabled: entry.balance.payoutBonusOverrideEnabled,
    payoutBonusPercent: entry.balance.payoutBonusPercent,
  });

  function updateField<Key extends keyof UserDraft>(key: Key, value: UserDraft[Key]) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleSubmit() {
    if (!isDirty || isPending) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("userId", entry.user.id);
      formData.append("name", draft.name);
      formData.append("role", draft.role);
      formData.append("status", draft.status);
      formData.append("telegramUsername", draft.telegramUsername);
      formData.append("telegramId", draft.telegramId);
      formData.append("verified", draft.verified ? "true" : "false");

      const result = await updateAdminUserInlineAction(formData);

      if (!result.ok) {
        onNotify({ tone: "error", message: result.error });
        return;
      }

      if (!result.userEntry) {
        onNotify({ tone: "error", message: "The updated user response was incomplete." });
        return;
      }

      onSaved(result.userEntry);
      onNotify({ tone: "success", message: result.message });
    });
  }

  return (
    <DrawerShell
      eyebrow="Edit User"
      onClose={onClose}
      subtitle={entry.user.email}
      title={entry.user.username}
    >
      <div className="space-y-5">
        <section className="rounded-[18px] border border-line bg-white p-5">
          <div className="text-sm font-semibold text-foreground">Identity & access</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Profile Name" onChange={(value) => updateField("name", value)} value={draft.name} />
            <ReadOnlyField label="Username" value={entry.user.username} />
            <ReadOnlyField label="Email" value={entry.user.email} />
            <SelectField
              label="Role"
              onChange={(value) => updateField("role", value as UserRecord["role"])}
              options={["user", "admin"]}
              renderOption={(value) => getRoleLabel(value as UserRecord["role"])}
              value={draft.role}
            />
            <SelectField
              label="Status"
              onChange={(value) => updateField("status", value as UserRecord["status"])}
              options={statusOptions}
              renderOption={getStatusLabel}
              value={draft.status}
            />
          </div>
        </section>

        <section className="rounded-[18px] border border-line bg-white p-5">
          <div className="text-sm font-semibold text-foreground">Payment identity</div>
          <div className="mt-4 grid gap-3">
            <Field
              label="Telegram Username"
              onChange={(value) => updateField("telegramUsername", value)}
              value={draft.telegramUsername}
            />
            <Field
              label="Telegram ID"
              onChange={(value) => updateField("telegramId", value)}
              value={draft.telegramId}
            />
          </div>
        </section>

        <KycAccessControl
          entry={entry}
          onNotify={onNotify}
          onSaved={onUpdated}
        />

        <PaymentGateAccessControl
          entry={entry}
          onNotify={onNotify}
          onSaved={onUpdated}
        />

        <section className="rounded-[18px] border border-line bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-foreground">Verification & balance</div>
            <Button onClick={() => setAccountDataOpen(true)} type="button" variant="secondary">
              <SlidersHorizontal className="size-4" />
              Edit Account Data
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            <ToggleField
              checked={draft.verified}
              description="Telegram verification can be reviewed here while bot chat linkage stays read-only."
              label="Telegram verified"
              onChange={(value) => updateField("verified", value)}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <ReadOnlyField
                label="Telegram chat linked"
                value={entry.user.telegramChatId ? "Linked" : "Missing"}
              />
              <ReadOnlyField
                label="Telegram verified at"
                value={
                  entry.user.telegramVerifiedAt
                    ? formatDisplayDateTime(entry.user.telegramVerifiedAt)
                    : "Not verified yet"
                }
              />
              <ReadOnlyField label="Registered" value={formatDisplayDateTime(entry.user.createdAt)} />
              <ReadOnlyField
                label="Last login"
                value={
                  entry.user.lastLoginAt
                    ? formatDisplayDateTime(entry.user.lastLoginAt)
                    : "No logins yet"
                }
              />
              <ReadOnlyField label="Available balance" value={formatUsd(entry.balance.available)} />
              <ReadOnlyField label="Total deposited" value={formatUsd(entry.balance.totalDeposited)} />
              <ReadOnlyField
                label="Deposit bonus %"
                value={`+${payoutBonus}%${entry.balance.payoutBonusOverrideEnabled ? " manual" : ""}`}
              />
              <ReadOnlyField
                label="Next bonus threshold"
                value={formatUsd(tierProgress.nextThreshold)}
              />
              <ReadOnlyField label="Total spent" value={formatUsd(entry.balance.totalSpent)} />
            </div>
          </div>
        </section>

        <section className="rounded-[18px] border border-rose-200 bg-rose-50 p-5">
          <div className="text-sm font-semibold text-rose-700">Danger zone</div>
          <p className="mt-2 text-sm leading-6 text-rose-700/80">
            Soft delete blocks login, removes active sessions, and preserves financial history for audit.
          </p>
          <div className="mt-4">
            <Button disabled={entry.user.isDeleted} onClick={onDelete} type="button" variant="destructive">
              <Trash2 className="size-4" />
              Delete User
            </Button>
          </div>
        </section>

        <StickyActions
          disabled={!isDirty}
          isPending={isPending}
          onCancel={onClose}
          onSubmit={handleSubmit}
          submitLabel="Save Changes"
          workingLabel="Saving..."
        />
      </div>
      <AnimatePresence>
        {accountDataOpen ? (
          <AccountDataDialog
            entry={entry}
            key={`account-data-${entry.user.id}`}
            onClose={() => setAccountDataOpen(false)}
            onSaved={(nextEntry) => {
              setAccountDataOpen(false);
              onSaved(nextEntry);
            }}
            onNotify={onNotify}
          />
        ) : null}
      </AnimatePresence>
    </DrawerShell>
  );
}

function KycAccessControl({
  entry,
  onSaved,
  onNotify,
}: {
  entry: AdminUserEntry;
  onSaved: (entry: AdminUserEntry) => void;
  onNotify: (toast: ToastState) => void;
}) {
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const verified = isKycVerified(entry.user);
  const pendingKyc = isKycPendingStatus(entry.user.kycStatus);
  const inconsistentKyc = entry.user.kycVerified && !verified;
  const verificationSource = getKycVerificationSource(entry.user);

  useEffect(() => {
    if (!pendingKyc || verified) {
      return;
    }

    let active = true;

    async function refreshKycStatus() {
      try {
        const response = await fetch(`/api/admin/users/${entry.user.id}/kyc`, {
          cache: "no-store",
        });
        const result = (await response.json()) as {
          ok?: boolean;
          userEntry?: AdminUserEntry;
        };

        if (!active || !result.ok || !result.userEntry) {
          return;
        }

        const nextUser = result.userEntry.user;
        if (
          nextUser.kycStatus !== entry.user.kycStatus ||
          nextUser.kycVerified !== entry.user.kycVerified ||
          nextUser.veriffDecision !== entry.user.veriffDecision
        ) {
          onSaved(result.userEntry);
        }
      } catch {
      }
    }

    const timer = window.setInterval(refreshKycStatus, 4_000);
    void refreshKycStatus();

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    entry.user.id,
    entry.user.kycStatus,
    entry.user.kycVerified,
    entry.user.veriffDecision,
    onSaved,
    pendingKyc,
    verified,
  ]);

  function updateKyc(action: "approve" | "decline" | "reset" | "sync") {
    if (isPending) {
      return;
    }

    if (action !== "sync" && !reason.trim()) {
      onNotify({
        tone: "error",
        message: "Reason is required for KYC manual changes.",
      });
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/admin/users/${entry.user.id}/kyc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          reason,
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
        message?: string;
        userEntry?: AdminUserEntry;
      };

      if (!result.ok || !result.userEntry) {
        onNotify({
          tone: "error",
          message: result.error ?? "Unable to update KYC status.",
        });
        return;
      }

      setReason("");
      onSaved(result.userEntry);
      onNotify({
        tone: "success",
        message: result.message ?? "KYC status updated.",
      });
    });
  }

  return (
    <section className="rounded-[18px] border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">KYC Verification</div>
          <p className="mt-2 text-sm leading-6 text-muted">
            Manual override for Veriff access to deposits and card payments.
          </p>
        </div>
        <Badge tone={verified ? "emerald" : inconsistentKyc ? "rose" : "amber"}>
          {verified ? "KYC Verified" : inconsistentKyc ? "KYC Inconsistent" : "KYC Required"}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ReadOnlyField label="KYC status" value={entry.user.kycStatus} />
        <ReadOnlyField label="Verified" value={verified ? "Yes" : "No"} />
        <ReadOnlyField label="Verification source" value={verificationSource} />
        <ReadOnlyField label="Provider" value={entry.user.kycProvider ?? "Not started"} />
        <ReadOnlyField
          label="Veriff session ID"
          value={entry.user.veriffSessionId ?? "No session"}
        />
        <ReadOnlyField
          label="Veriff status"
          value={entry.user.veriffStatus ?? "No provider status"}
        />
        <ReadOnlyField
          label="Veriff decision"
          value={entry.user.veriffDecision ?? "No provider decision"}
        />
        <ReadOnlyField
          label="Last Veriff webhook/sync"
          value={
            entry.user.kycLastWebhookAt
              ? formatDisplayDateTime(entry.user.kycLastWebhookAt)
              : "No webhook or sync yet"
          }
        />
        <ReadOnlyField
          label="Verified at"
          value={
            entry.user.kycVerifiedAt
              ? formatDisplayDateTime(entry.user.kycVerifiedAt)
              : "Not verified"
          }
        />
        <ReadOnlyField
          label="Manual override"
          value={entry.user.kycManualOverride ? "Yes" : "No"}
        />
        <ReadOnlyField
          label="Manual reason"
          value={entry.user.kycManualOverrideReason ?? "No manual reason"}
        />
        <ReadOnlyField
          label="Veriff reason"
          value={entry.user.veriffReason ?? "No provider reason"}
        />
      </div>

      <div className="mt-5 rounded-[16px] border border-line bg-panel p-4">
        <div className="text-sm font-semibold text-foreground">KYC profile data</div>
        {entry.kycProfile ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <ReadOnlyField label="First name" value={entry.kycProfile.firstName} />
            <ReadOnlyField label="Last name" value={entry.kycProfile.lastName} />
            <ReadOnlyField label="Date of birth" value={entry.kycProfile.dateOfBirth} />
            <ReadOnlyField
              label="Country of residence"
              value={entry.kycProfile.countryOfResidence}
            />
            <ReadOnlyField
              label="Document country"
              value={entry.kycProfile.documentCountry}
            />
            <ReadOnlyField label="KYC email" value={entry.kycProfile.email} />
            <ReadOnlyField label="Phone" value={entry.kycProfile.phone ?? "Not provided"} />
            <ReadOnlyField
              label="Updated"
              value={formatDisplayDateTime(entry.kycProfile.updatedAt)}
            />
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-muted">
            No KYC profile has been submitted yet.
          </p>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <Field
          label="Reason for KYC manual change"
          multiline
          onChange={setReason}
          placeholder="Support review, Veriff callback issue, compliance review..."
          value={reason}
        />
        <div className="flex flex-wrap gap-3">
          <Button disabled={isPending} onClick={() => updateKyc("approve")} type="button">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            Mark Verified
          </Button>
          <Button disabled={isPending} onClick={() => updateKyc("sync")} type="button" variant="secondary">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Sync Veriff Status
          </Button>
          <Button disabled={isPending} onClick={() => updateKyc("decline")} type="button" variant="destructive">
            Mark Unverified
          </Button>
          <Button disabled={isPending} onClick={() => updateKyc("reset")} type="button" variant="secondary">
            Reset KYC
          </Button>
        </div>
      </div>
    </section>
  );
}

function PaymentGateAccessControl({
  entry,
  onSaved,
  onNotify,
}: {
  entry: AdminUserEntry;
  onSaved: (entry: AdminUserEntry) => void;
  onNotify: (toast: ToastState) => void;
}) {
  const [reason, setReason] = useState("");
  const [pendingGate, setPendingGate] = useState<string | null>(null);
  const gates = entry.paymentGateAccess ?? [];

  function updateGate(gate: PaymentGateAccessRecord, enabled: boolean) {
    if (pendingGate) {
      return;
    }

    if (!reason.trim()) {
      onNotify({
        tone: "error",
        message: "Reason is required for payment gate access changes.",
      });
      return;
    }

    setPendingGate(gate.providerKey);
    fetch(`/api/admin/users/${entry.user.id}/payment-gates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        providerKey: gate.providerKey,
        enabled,
        reason,
      }),
    })
      .then(async (response) => {
        const result = (await response.json()) as {
          ok: boolean;
          error?: string;
          message?: string;
          userEntry?: AdminUserEntry;
        };

        if (!response.ok || !result.ok || !result.userEntry) {
          throw new Error(result.error ?? "Unable to update payment gate access.");
        }

        setReason("");
        onSaved(result.userEntry);
        onNotify({
          tone: "success",
          message: result.message ?? "Payment gate access updated.",
        });
      })
      .catch((error) => {
        onNotify({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to update payment gate access.",
        });
      })
      .finally(() => {
        setPendingGate(null);
      });
  }

  return (
    <section className="rounded-[18px] border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Payment Gates</div>
          <p className="mt-2 text-sm leading-6 text-muted">
            Gate #1 is available by default. Gate #2 is shown to this user only
            after explicit admin approval.
          </p>
        </div>
        <Badge tone={gates.some((gate) => gate.providerKey === "cleffo" && gate.accessEnabled) ? "emerald" : "amber"}>
          Gate #2 {gates.some((gate) => gate.providerKey === "cleffo" && gate.accessEnabled) ? "Enabled" : "Hidden"}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {gates.map((gate) => (
          <div
            className="rounded-[16px] border border-line bg-panel p-4"
            key={gate.providerKey}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {gate.adminName}
                </div>
                <div className="mt-2 text-sm text-muted">
                  Public label: {gate.publicName}
                </div>
              </div>
              <Badge tone={gate.accessEnabled ? "emerald" : "amber"}>
                {gate.accessEnabled ? "Available" : "Hidden"}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 text-xs uppercase tracking-[0.24em] text-muted">
              <span>Currencies: {gate.supportsCurrencies.join(", ") || "None"}</span>
              <span>Min: {gate.minAmount}</span>
              <span>Reason: {gate.reason ?? "Default policy"}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={pendingGate === gate.providerKey || gate.accessEnabled}
                onClick={() => updateGate(gate, true)}
                type="button"
              >
                {pendingGate === gate.providerKey ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Enable
              </Button>
              <Button
                disabled={pendingGate === gate.providerKey || !gate.accessEnabled}
                onClick={() => updateGate(gate, false)}
                type="button"
                variant="destructive"
              >
                Disable
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Field
          label="Reason for gate access change"
          multiline
          onChange={setReason}
          placeholder="Compliance review, payment routing approval, user-specific restriction..."
          value={reason}
        />
      </div>
    </section>
  );
}

function AccountDataDialog({
  entry,
  onClose,
  onSaved,
  onNotify,
}: {
  entry: AdminUserEntry;
  onClose: () => void;
  onSaved: (entry: AdminUserEntry) => void;
  onNotify: (toast: ToastState) => void;
}) {
  const [draft, setDraft] = useState<AccountDataDraft>(() => createAccountDataDraft(entry));
  const [isPending, startTransition] = useTransition();
  const isDirty =
    normalizeAccountDraft(draft) !== normalizeAccountDraft(createAccountDataDraft(entry));
  const financialChanged = hasFinancialDraftChanges(entry, draft);
  const totalDeposited = Number(draft.totalDeposited || 0);
  const tierProgress = getPayoutTierProgress(Number.isFinite(totalDeposited) ? totalDeposited : 0);
  const autoBonus = getPayoutBonusPercent(Number.isFinite(totalDeposited) ? totalDeposited : 0);
  const effectiveBonus = draft.payoutBonusOverrideEnabled
    ? Math.max(0, Math.min(100, Math.floor(Number(draft.payoutBonusPercent || 0))))
    : autoBonus;

  function updateField<Key extends keyof AccountDataDraft>(
    key: Key,
    value: AccountDataDraft[Key],
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetFinancialData() {
    if (draft.resetConfirmation !== "RESET USER BALANCE") {
      onNotify({
        tone: "error",
        message: "Type RESET USER BALANCE before resetting this user's financial data.",
      });
      return;
    }

    setDraft((current) => ({
      ...current,
      availableBalance: "0",
      pendingWithdrawal: "0",
      totalDeposited: "0",
      totalSpent: "0",
      totalWithdrawn: "0",
      payoutBonusOverrideEnabled: false,
      payoutBonusPercent: "0",
    }));
  }

  function recalculatePayoutBonus() {
    setDraft((current) => ({
      ...current,
      payoutBonusOverrideEnabled: false,
      payoutBonusPercent: String(getPayoutBonusPercent(Number(current.totalDeposited || 0))),
    }));
  }

  function handleSave() {
    if (!isDirty || isPending) {
      return;
    }

    if (financialChanged && !draft.reason.trim()) {
      onNotify({
        tone: "error",
        message: "Reason is required when editing financial data.",
      });
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/admin/users/${entry.user.id}/account-data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          availableBalance: draft.availableBalance,
          pendingWithdrawal: draft.pendingWithdrawal,
          totalDeposited: draft.totalDeposited,
          totalSpent: draft.totalSpent,
          totalWithdrawn: draft.totalWithdrawn,
          payoutBonusOverrideEnabled: draft.payoutBonusOverrideEnabled,
          payoutBonusPercent: draft.payoutBonusPercent,
          telegramUsername: draft.telegramUsername,
          telegramId: draft.telegramId,
          telegramChatId: draft.telegramChatId,
          telegramVerified: draft.telegramVerified,
          telegramVerifiedAt: draft.telegramVerifiedAt,
          gate2FirstName: draft.gate2FirstName,
          gate2LastName: draft.gate2LastName,
          gate2Phone: draft.gate2Phone,
          email: draft.email,
          role: draft.role,
          status: draft.status,
          verificationStatus: draft.verificationStatus,
          requirePasswordReset: draft.requirePasswordReset,
          reason: draft.reason,
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
        message?: string;
        userEntry?: AdminUserEntry;
      };

      if (!result.ok || !result.userEntry) {
        onNotify({
          tone: "error",
          message: result.error ?? "Unable to save account data.",
        });
        return;
      }

      onSaved(result.userEntry);
      onNotify({ tone: "success", message: result.message ?? "Account data saved." });
    });
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[240] flex items-center justify-center bg-[rgba(8,11,28,0.62)] px-4 py-6 backdrop-blur"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        animate={{ y: 0, opacity: 1 }}
        className="max-h-[92vh] w-full max-w-[980px] overflow-y-auto rounded-[28px] border border-[rgba(139,124,246,0.22)] bg-[linear-gradient(145deg,rgba(12,18,39,0.98),rgba(23,18,48,0.96))] p-5 text-white shadow-[0_30px_120px_rgba(0,0,0,0.42)]"
        exit={{ y: 18, opacity: 0 }}
        initial={{ y: 20, opacity: 0 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-violet-200">
              Account Data
            </div>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
              {entry.user.username}
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              Edit financial, Telegram, and account source-of-truth fields.
            </p>
          </div>
          <button
            className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Financial Data</div>
                <p className="mt-1 text-sm text-slate-400">
                  Financial edits require a reason and are written to audit + ledger.
                </p>
              </div>
              <Button onClick={recalculatePayoutBonus} type="button" variant="secondary">
                <RefreshCw className="size-4" />
                Recalculate bonus
              </Button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <DarkField
                label="Available balance"
                onChange={(value) => updateField("availableBalance", value)}
                type="number"
                value={draft.availableBalance}
              />
              <DarkField
                label="Total deposited"
                onChange={(value) => updateField("totalDeposited", value)}
                type="number"
                value={draft.totalDeposited}
              />
              <DarkField
                label="Total spent"
                onChange={(value) => updateField("totalSpent", value)}
                type="number"
                value={draft.totalSpent}
              />
              <DarkField
                label="Deposit bonus percent"
                onChange={(value) => updateField("payoutBonusPercent", value)}
                type="number"
                value={draft.payoutBonusPercent}
              />
            </div>

            <div className="mt-4 grid gap-3">
              <DarkToggle
                checked={draft.payoutBonusOverrideEnabled}
                description="When off, bonus is floor(total deposited / 20,000)."
                label="Use manual deposit bonus override"
                onChange={(value) => updateField("payoutBonusOverrideEnabled", value)}
              />
              <div className="grid gap-3 md:grid-cols-3">
                <DarkReadOnly label="Effective bonus" value={`+${effectiveBonus}%`} />
                <DarkReadOnly label="Auto bonus" value={`+${autoBonus}%`} />
                <DarkReadOnly
                  label="Next threshold"
                  value={formatUsd(tierProgress.nextThreshold)}
                />
              </div>
            </div>

            <div className="mt-5 rounded-[18px] border border-rose-300/20 bg-rose-500/10 p-4">
              <div className="text-sm font-semibold text-rose-100">Reset financial data</div>
              <p className="mt-2 text-sm leading-6 text-rose-100/80">
                This only affects {entry.user.username}. Type RESET USER BALANCE, then press reset.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <DarkField
                  label="Confirmation"
                  onChange={(value) => updateField("resetConfirmation", value)}
                  value={draft.resetConfirmation}
                />
                <div className="flex items-end">
                  <Button onClick={resetFinancialData} type="button" variant="destructive">
                    Reset user balance
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <div className="space-y-5">
            <section className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
              <div className="text-sm font-semibold">Telegram Data</div>
              <div className="mt-4 grid gap-3">
                <DarkField
                  label="Telegram username"
                  onChange={(value) => updateField("telegramUsername", value)}
                  value={draft.telegramUsername}
                />
                <DarkField
                  label="Telegram ID"
                  onChange={(value) => updateField("telegramId", value)}
                  value={draft.telegramId}
                />
                <DarkField
                  label="Telegram chat ID"
                  onChange={(value) => updateField("telegramChatId", value)}
                  value={draft.telegramChatId}
                />
                <DarkToggle
                  checked={draft.telegramVerified}
                  description="If enabled without a date, the server sets verified-at to now."
                  label="Telegram verified"
                  onChange={(value) => updateField("telegramVerified", value)}
                />
                <DarkField
                  label="Telegram verified at"
                  onChange={(value) => updateField("telegramVerifiedAt", value)}
                  type="datetime-local"
                  value={draft.telegramVerifiedAt}
                />
              </div>
            </section>

            <section className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
              <div className="text-sm font-semibold">Gate #2 Details</div>
              <p className="mt-1 text-sm text-slate-400">
                Cleffo customer details. Do not use username or Telegram handle here.
              </p>
              <div className="mt-4 grid gap-3">
                <DarkField
                  label="First name"
                  onChange={(value) => updateField("gate2FirstName", value)}
                  value={draft.gate2FirstName}
                />
                <DarkField
                  label="Last name"
                  onChange={(value) => updateField("gate2LastName", value)}
                  value={draft.gate2LastName}
                />
                <DarkField
                  label="Phone"
                  onChange={(value) => updateField("gate2Phone", value)}
                  value={draft.gate2Phone}
                />
                <DarkReadOnly
                  label="Updated"
                  value={
                    entry.user.gate2DetailsUpdatedAt
                      ? formatDisplayDateTime(entry.user.gate2DetailsUpdatedAt)
                      : "Not saved"
                  }
                />
              </div>
            </section>

            <section className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
              <div className="text-sm font-semibold">Account Data</div>
              <div className="mt-4 grid gap-3">
                <DarkField
                  label="Email"
                  onChange={(value) => updateField("email", value)}
                  type="email"
                  value={draft.email}
                />
                <DarkSelect
                  label="Role"
                  onChange={(value) => updateField("role", value as UserRecord["role"])}
                  options={["user", "admin"]}
                  value={draft.role}
                />
                <DarkSelect
                  label="Account status"
                  onChange={(value) => updateField("status", value as UserRecord["status"])}
                  options={statusOptions}
                  value={draft.status}
                />
                <DarkToggle
                  checked={draft.verificationStatus}
                  description="General account verification flag separate from Telegram chat data."
                  label="Account verified"
                  onChange={(value) => updateField("verificationStatus", value)}
                />
                <DarkToggle
                  checked={draft.requirePasswordReset}
                  description="Require the collector to reset password after next login."
                  label="Password reset required"
                  onChange={(value) => updateField("requirePasswordReset", value)}
                />
                <DarkReadOnly
                  label="Registered"
                  value={formatDisplayDateTime(entry.user.createdAt)}
                />
                <DarkReadOnly
                  label="Last login"
                  value={
                    entry.user.lastLoginAt
                      ? formatDisplayDateTime(entry.user.lastLoginAt)
                      : "No logins yet"
                  }
                />
              </div>
            </section>
          </div>
        </div>

        <section className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
          <DarkField
            label={financialChanged ? "Admin reason required" : "Admin reason optional"}
            multiline
            onChange={(value) => updateField("reason", value)}
            placeholder="Manual correction after support review."
            value={draft.reason}
          />
        </section>

        <div className="sticky bottom-0 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-[rgba(14,17,36,0.92)] px-4 py-4 backdrop-blur">
          <div className="text-sm text-slate-400">
            {financialChanged ? "Financial changes will be ledgered." : "Profile-only changes are still audited."}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={onClose} type="button" variant="secondary">
              Cancel
            </Button>
            <Button disabled={!isDirty || isPending} onClick={handleSave} type="button">
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {isPending ? "Saving..." : "Save Account Data"}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DrawerShell({
  children,
  eyebrow,
  onClose,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  eyebrow: string;
  onClose: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[210] bg-[rgba(248,248,251,0.54)] backdrop-blur-[10px]"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.aside
        animate={{ x: 0 }}
        className="absolute inset-y-0 right-0 w-full max-w-[660px] overflow-y-auto border-l border-line bg-[rgba(255,255,255,0.94)] shadow-[0_20px_90px_rgba(15,23,42,0.12)]"
        exit={{ x: 48 }}
        initial={{ x: 60 }}
        onClick={(event) => event.stopPropagation()}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="sticky top-0 z-10 border-b border-line bg-[rgba(255,255,255,0.92)] px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">
                {eyebrow}
              </div>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                {title}
              </h3>
              <div className="mt-2 text-sm text-muted">{subtitle}</div>
            </div>
            <button
              className="rounded-full border border-line bg-white p-2 text-muted transition hover:text-foreground"
              onClick={onClose}
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="p-5">{children}</div>
      </motion.aside>
    </motion.div>
  );
}

function DeleteUserDialog({
  entry,
  onClose,
  onDeleted,
  onNotify,
}: {
  entry: AdminUserEntry;
  onClose: () => void;
  onDeleted: (entry: AdminUserEntry) => void;
  onNotify: (toast: ToastState) => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const canDelete = confirmation === "DELETE USER";

  function handleDelete() {
    if (!canDelete || isPending) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("userId", entry.user.id);
      formData.append("confirmation", confirmation);
      formData.append("reason", reason);

      const result = await deleteAdminUserInlineAction(formData);

      if (!result.ok) {
        onNotify({ tone: "error", message: result.error });
        return;
      }

      onDeleted(result.userEntry);
      onNotify({ tone: "success", message: result.message });
    });
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[230] flex items-center justify-center bg-[rgba(15,23,42,0.48)] px-4 backdrop-blur"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-[520px] rounded-[24px] border border-rose-200 bg-white p-6 shadow-[0_28px_90px_rgba(15,23,42,0.2)]"
        exit={{ y: 18, opacity: 0 }}
        initial={{ y: 20, opacity: 0 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-rose-700">Delete user account?</div>
            <p className="mt-3 text-sm leading-6 text-muted">
              This action will permanently remove active access and related session data,
              while financial history remains preserved for audit.
            </p>
          </div>
          <button className="rounded-full border border-line p-2 text-muted" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 rounded-[18px] border border-line bg-panel-strong px-4 py-4 text-sm">
          <div className="font-semibold text-foreground">{entry.user.username}</div>
          <div className="mt-1 text-muted">{entry.user.email}</div>
          <div className="mt-1 text-muted">{entry.user.telegramUsername}</div>
        </div>

        <Field
          label="Reason"
          multiline
          onChange={setReason}
          placeholder="Support case, duplicate account, internal cleanup..."
          value={reason}
        />

        <div className="mt-4">
          <Field
            label="Type DELETE USER to confirm"
            onChange={setConfirmation}
            value={confirmation}
          />
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button disabled={!canDelete || isPending} onClick={handleDelete} type="button" variant="destructive">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete User
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DarkField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const className =
    "w-full rounded-[14px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-300/50";

  return (
    <label className="space-y-2">
      <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{label}</span>
      {multiline ? (
        <textarea
          className={cn(className, "min-h-24 resize-none")}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      ) : (
        <input
          className={className}
          min={type === "number" ? 0 : undefined}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          step={type === "number" ? "0.01" : undefined}
          type={type}
          value={value}
        />
      )}
    </label>
  );
}

function DarkReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="rounded-[14px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white">
        {value}
      </div>
    </div>
  );
}

function DarkSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{label}</span>
      <select
        className="w-full rounded-[14px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-violet-300/50"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option className="bg-slate-950 text-white" key={option} value={option}>
            {option === "user" || option === "admin" ? getRoleLabel(option) : getStatusLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function DarkToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      className={cn(
        "flex items-start justify-between gap-4 rounded-[16px] border px-4 py-4 text-left transition",
        checked
          ? "border-violet-300/40 bg-violet-500/15"
          : "border-white/10 bg-black/20",
      )}
      onClick={() => onChange(!checked)}
      type="button"
    >
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <ShieldCheck className="size-4 text-violet-200" />
          {label}
        </div>
        <div className="mt-2 text-sm leading-6 text-slate-400">{description}</div>
      </div>
      <div
        className={cn(
          "mt-1 flex size-6 items-center justify-center rounded-full border transition",
          checked
            ? "border-violet-200 bg-violet-500 text-white"
            : "border-white/15 bg-black/20 text-transparent",
        )}
      >
        {checked ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
      </div>
    </button>
  );
}

function StickyActions({
  disabled,
  isPending,
  onCancel,
  onSubmit,
  submitLabel,
  workingLabel,
}: {
  disabled?: boolean;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  workingLabel: string;
}) {
  return (
    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-[rgba(255,255,255,0.92)] px-4 py-4 shadow-[0_-18px_36px_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="text-sm leading-6 text-muted">Changes are written server-side and audited.</div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={onCancel} type="button" variant="secondary">
          Cancel
        </Button>
        <Button disabled={Boolean(disabled) || isPending} onClick={onSubmit} type="button">
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {isPending ? workingLabel : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "emerald" | "sky" | "rose" | "amber" | "violet";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "sky"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : tone === "amber"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-violet-200 bg-violet-50 text-violet-700";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] ${toneClass}`}>
      {children}
    </span>
  );
}

function InlineMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-panel-strong px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const className =
    "w-full rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-[rgba(120,112,241,0.3)]";

  return (
    <label className="space-y-2">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted">{label}</span>
      {multiline ? (
        <textarea
          className={cn(className, "min-h-28 resize-none")}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      ) : (
        <input
          className={className}
          min={type === "number" ? 0 : undefined}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={type}
          value={value}
        />
      )}
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground">
        {value}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  renderOption,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  renderOption?: (value: string) => string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted">{label}</span>
      <select
        className="w-full rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none transition focus:border-[rgba(120,112,241,0.3)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {renderOption ? renderOption(option) : getStatusLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      className={cn(
        "flex items-start justify-between gap-4 rounded-[16px] border px-4 py-4 text-left transition",
        checked
          ? "border-[rgba(120,112,241,0.32)] bg-[rgba(120,112,241,0.08)]"
          : "border-line bg-[var(--background-soft)]",
      )}
      onClick={() => onChange(!checked)}
      type="button"
    >
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="size-4 text-[var(--accent)]" />
          {label}
        </div>
        <div className="mt-2 text-sm leading-6 text-muted">{description}</div>
      </div>
      <div
        className={cn(
          "mt-1 flex size-6 items-center justify-center rounded-full border transition",
          checked
            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
            : "border-line bg-white text-transparent",
        )}
      >
        {checked ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
      </div>
    </button>
  );
}
