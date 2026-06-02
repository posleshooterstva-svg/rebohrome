"use client";

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
  type BalanceRecord,
  type PaymentReconciliationStatus,
  type UserRecord,
} from "@/lib/rebohrome-data";
import { cn } from "@/lib/utils";

type AdminUserEntry = {
  user: UserRecord;
  balance: BalanceRecord;
};

type AdminUsersManagerProps = {
  initialUsers: AdminUserEntry[];
  initialReconciliationStatus: PaymentReconciliationStatus;
};

type UserDraft = {
  name: string;
  role: UserRecord["role"];
  status: UserRecord["status"];
  telegramUsername: string;
  telegramId: string;
  withdrawalWallet: string;
  verified: boolean;
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
    withdrawalWallet: entry.user.withdrawalWallet ?? "",
    verified: entry.user.telegramVerified,
  };
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
    withdrawalWallet: draft.withdrawalWallet.trim(),
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

      return queryMatch && roleMatch && statusMatch && verifiedMatch && deletedMatch;
    });
  }, [deferredQuery, deletedFilter, roleFilter, statusFilter, users, verifiedFilter]);

  const activeEntry = users.find((entry) => entry.user.id === activeUserId) ?? null;

  function handleSaved(nextEntry: AdminUserEntry) {
    setUsers((current) =>
      current.map((entry) => (entry.user.id === nextEntry.user.id ? nextEntry : entry)),
    );
    setActiveUserId(null);
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
              Manage accounts, roles, payout identities, verification, and onboarding.
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

        <div className="mt-6 grid gap-3 lg:grid-cols-[1.4fr_repeat(4,minmax(0,0.78fr))]">
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
        <InlineMeta label="Pending" value={formatUsd(entry.balance.pendingWithdrawal)} />
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
  onNotify,
}: {
  entry: AdminUserEntry;
  onClose: () => void;
  onDelete: () => void;
  onSaved: (entry: AdminUserEntry) => void;
  onNotify: (toast: ToastState) => void;
}) {
  const [draft, setDraft] = useState<UserDraft>(() => createDraft(entry));
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setDraft(createDraft(entry));
  }, [entry]);

  const isDirty = normalizeDraft(draft) !== normalizeDraft(createDraft(entry));

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
      formData.append("withdrawalWallet", draft.withdrawalWallet);
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
          <div className="text-sm font-semibold text-foreground">Payout identity</div>
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
            <Field
              label="USDT BEP20 Wallet"
              onChange={(value) => updateField("withdrawalWallet", value)}
              value={draft.withdrawalWallet}
            />
          </div>
        </section>

        <section className="rounded-[18px] border border-line bg-white p-5">
          <div className="text-sm font-semibold text-foreground">Verification & balance</div>
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
              <ReadOnlyField label="Pending withdrawals" value={formatUsd(entry.balance.pendingWithdrawal)} />
              <ReadOnlyField label="Total deposited" value={formatUsd(entry.balance.totalDeposited)} />
              <ReadOnlyField label="Payout bonus %" value={`+${Math.floor(entry.balance.totalDeposited / 20000)}%`} />
              <ReadOnlyField
                label="Next bonus threshold"
                value={formatUsd((Math.floor(entry.balance.totalDeposited / 20000) + 1) * 20000)}
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
    </DrawerShell>
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
