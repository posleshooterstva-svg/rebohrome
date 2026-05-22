"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, PencilLine, Search, ShieldCheck, X } from "lucide-react";
import { updateAdminUserInlineAction } from "@/app/actions/marketplace";
import { Button } from "@/components/ui/button";
import { formatDisplayDateTime, formatUsd, type BalanceRecord, type UserRecord } from "@/lib/rebohrome-data";
import { cn } from "@/lib/utils";

type AdminUserEntry = {
  user: UserRecord;
  balance: BalanceRecord;
};

type AdminUsersManagerProps = {
  initialUsers: AdminUserEntry[];
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

type ToastState =
  | {
      tone: "success" | "error";
      message: string;
    }
  | null;

function createDraft(entry: AdminUserEntry): UserDraft {
  return {
    name: entry.user.name,
    role: entry.user.role,
    status: entry.user.status,
    telegramUsername: entry.user.telegramUsername,
    telegramId: entry.user.telegramId ?? "",
    withdrawalWallet: entry.user.withdrawalWallet ?? "",
    verified: entry.user.telegramVerified,
  };
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

export function AdminUsersManager({ initialUsers }: AdminUsersManagerProps) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRecord["role"]>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | UserRecord["status"]>("all");
  const [verifiedFilter, setVerifiedFilter] = useState<"all" | "verified" | "unverified">("all");
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
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
      const queryMatch =
        !normalizedQuery ||
        entry.user.username.toLowerCase().includes(normalizedQuery) ||
        entry.user.name.toLowerCase().includes(normalizedQuery) ||
        entry.user.email.toLowerCase().includes(normalizedQuery) ||
        entry.user.telegramUsername.toLowerCase().includes(normalizedQuery);
      const roleMatch = roleFilter === "all" || entry.user.role === roleFilter;
      const statusMatch = statusFilter === "all" || entry.user.status === statusFilter;
      const verifiedMatch =
        verifiedFilter === "all" ||
        (verifiedFilter === "verified"
          ? entry.user.telegramVerified
          : !entry.user.telegramVerified);

      return queryMatch && roleMatch && statusMatch && verifiedMatch;
    });
  }, [deferredQuery, roleFilter, statusFilter, users, verifiedFilter]);

  const activeEntry = users.find((entry) => entry.user.id === activeUserId) ?? null;

  function handleSaved(nextEntry: AdminUserEntry) {
    setUsers((current) =>
      current.map((entry) => (entry.user.id === nextEntry.user.id ? nextEntry : entry)),
    );
    setActiveUserId(null);
  }

  return (
    <>
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

      <section className="rounded-[28px] border border-line bg-panel-strong p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-lg font-semibold text-foreground">Collectors</div>
            <p className="mt-1 text-sm text-muted">
              Edit account roles, payout identities, verification state, and public profile details without opening a full database form.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1.4fr_repeat(3,minmax(0,0.78fr))]">
          <label className="flex items-center gap-3 rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3">
            <Search className="size-4 text-muted" />
            <input
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by username, profile name, or Telegram"
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
            <option value="admin">Admins</option>
          </select>
          <select
            className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none"
            onChange={(event) => setStatusFilter(event.target.value as "all" | UserRecord["status"])}
            value={statusFilter}
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <select
            className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none"
            onChange={(event) =>
              setVerifiedFilter(event.target.value as "all" | "verified" | "unverified")
            }
            value={verifiedFilter}
          >
            <option value="all">All verification</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </select>
        </div>

        <div className="mt-6 space-y-3">
          {filteredUsers.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-line bg-panel px-4 py-8 text-sm text-muted">
              No users match the current filters.
            </div>
          ) : (
            filteredUsers.map((entry) => (
              <article
                key={entry.user.id}
                className="grid gap-4 rounded-[22px] border border-line bg-panel px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                      {entry.user.username}
                    </h3>
                    {entry.user.role === "admin" ? <Badge tone="sky">Admin</Badge> : <Badge tone="violet">Collector</Badge>}
                    {entry.user.telegramVerified ? <Badge tone="emerald">Telegram Verified</Badge> : <Badge tone="amber">Telegram Pending</Badge>}
                    {entry.user.status === "active" ? null : <Badge tone="rose">Suspended</Badge>}
                  </div>
                  <div className="mt-1 text-sm text-muted">{entry.user.name}</div>
                  <div className="mt-2 text-sm text-muted">{entry.user.email}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted">
                    <span>{entry.user.telegramUsername}</span>
                    <span>·</span>
                    <span>
                      {entry.user.telegramVerified ? "Telegram verified" : "Telegram pending"}
                    </span>
                    <span>·</span>
                    <span>
                      {entry.user.telegramChatId ? "Chat linked" : "Chat not linked"}
                    </span>
                  </div>
                </div>

                <div className="grid gap-2 text-sm text-muted sm:grid-cols-2">
                  <InlineMeta label="Balance" value={formatUsd(entry.balance.available)} />
                  <InlineMeta label="Deposited" value={formatUsd(entry.balance.totalDeposited)} />
                  <InlineMeta
                    label="Pending"
                    value={formatUsd(entry.balance.pendingWithdrawal)}
                  />
                  <InlineMeta
                    label="Last login"
                    value={
                      entry.user.lastLoginAt
                        ? formatDisplayDateTime(entry.user.lastLoginAt)
                        : "No logins yet"
                    }
                  />
                  <InlineMeta
                    label="Registered"
                    value={formatDisplayDateTime(entry.user.createdAt)}
                  />
                </div>

                <div className="flex items-center justify-start md:justify-end">
                  <Button
                    onClick={() => setActiveUserId(entry.user.id)}
                    type="button"
                    variant="secondary"
                  >
                    <PencilLine className="size-4" />
                    Edit User
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <AnimatePresence>
        {activeEntry ? (
          <AdminUserDrawer
            key={activeEntry.user.id}
            entry={activeEntry}
            onClose={() => setActiveUserId(null)}
            onNotify={setToast}
            onSaved={handleSaved}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function AdminUserDrawer({
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
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[210] bg-[rgba(248,248,251,0.54)] backdrop-blur-[10px]"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.aside
        animate={{ x: 0 }}
        className="absolute inset-y-0 right-0 w-full max-w-[620px] overflow-y-auto border-l border-line bg-[rgba(255,255,255,0.94)] shadow-[0_20px_90px_rgba(15,23,42,0.12)]"
        exit={{ x: 48 }}
        initial={{ x: 60 }}
        onClick={(event) => event.stopPropagation()}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="sticky top-0 z-10 border-b border-line bg-[rgba(255,255,255,0.92)] px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">
                Edit User
              </div>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                {entry.user.username}
              </h3>
              <div className="mt-2 text-sm text-muted">{entry.user.email}</div>
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

        <div className="space-y-6 p-5">
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
                value={draft.role}
              />
              <SelectField
                label="Status"
                onChange={(value) => updateField("status", value as UserRecord["status"])}
                options={["active", "suspended"]}
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
                description="Telegram verification can be reviewed here, while bot chat linkage is displayed read-only below."
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
                <ReadOnlyField
                  label="Registered"
                  value={formatDisplayDateTime(entry.user.createdAt)}
                />
                <ReadOnlyField
                  label="Last login"
                  value={
                    entry.user.lastLoginAt
                      ? formatDisplayDateTime(entry.user.lastLoginAt)
                      : "No logins yet"
                  }
                />
                <ReadOnlyField label="Available balance" value={formatUsd(entry.balance.available)} />
                <ReadOnlyField
                  label="Pending withdrawals"
                  value={formatUsd(entry.balance.pendingWithdrawal)}
                />
                <ReadOnlyField label="Total deposited" value={formatUsd(entry.balance.totalDeposited)} />
                <ReadOnlyField label="Total spent" value={formatUsd(entry.balance.totalSpent)} />
              </div>
            </div>
          </section>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-[rgba(255,255,255,0.92)] px-4 py-4 shadow-[0_-18px_36px_rgba(15,23,42,0.06)] backdrop-blur">
            <div className="text-sm leading-6 text-muted">
              {isDirty
                ? "Unsaved changes are ready to sync across the admin workspace."
                : "No unsaved changes yet."}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={onClose} type="button" variant="secondary">
                Cancel
              </Button>
              <Button disabled={!isDirty || isPending} onClick={handleSubmit} type="button">
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </motion.aside>
    </motion.div>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted">{label}</span>
      <input
        className="w-full rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none transition focus:border-[rgba(120,112,241,0.3)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
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
            {option}
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
        <Check className="size-3.5" />
      </div>
    </button>
  );
}
