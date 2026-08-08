"use client";

import Image from "next/image";
import Link from "next/link";
import type { ComponentType, TransitionStartFunction } from "react";
import { useMemo, useState, useTransition } from "react";
import {
  Boxes,
  Check,
  FileClock,
  Loader2,
  Minus,
  PackagePlus,
  Plus,
  Search,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatCurrency,
  formatDisplayDateTime,
  formatUsd,
  type BalanceRecord,
  type DocumentAcceptanceStatusRecord,
  type ProductRecord,
  type TransactionRecord,
  type UserRecord,
} from "@/lib/rebohrome-data";
import { cn } from "@/lib/utils";

type AdminUserDetail = {
  user: UserRecord;
  balance: BalanceRecord;
};

type AdminTransactionEntry = {
  transaction: TransactionRecord;
  direction: string;
  source: string;
  balanceBefore: number | null;
  balanceAfter: number | null;
  adminNote: string | null;
  supportNote: string | null;
  visibleDescription: string | null;
  relatedProductId: string | null;
  relatedProductTitle: string | null;
  relatedOrderId: string | null;
};

type AdminInventoryEntry = {
  inventoryId: string;
  quantity: number;
  orderId: string;
  acquiredAt: string;
  status: string;
  acquisitionSource: string;
  removedAt: string | null;
  deliveryMode: string;
  adminNote: string | null;
  visibleUserNote: string | null;
  relatedTransactionId: string | null;
  product: ProductRecord;
};

type AdminAuditEntry = {
  id: string;
  adminUsername: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  createdAt: string;
};

type Props = {
  documentAcceptance: DocumentAcceptanceStatusRecord;
  detail: AdminUserDetail;
  initialTransactions: AdminTransactionEntry[];
  initialInventory: AdminInventoryEntry[];
  initialAuditLog: AdminAuditEntry[];
  initialProducts: ProductRecord[];
};

type Tab = "transactions" | "inventory" | "add-product" | "balance" | "audit";

type Toast =
  | {
      tone: "success" | "error";
      message: string;
    }
  | null;

const transactionStatuses = [
  "pending",
  "completed",
  "failed",
  "canceled",
  "refunded",
  "chargeback",
  "reversed",
  "manually_adjusted",
];

const editableProviders = [
  "Store Checkout",
  "Internal Wallet",
  "TransVoucher",
  "Cleffo",
  "Wert.io",
  "Coinflow",
  "Admin",
];

const editableSources = [
  "store_checkout",
  "user_action",
  "provider_webhook",
  "provider_api_sync",
  "admin_action",
  "system",
  "migration",
];

function getAdminProviderLabel(entry: AdminTransactionEntry) {
  const provider = entry.transaction.paymentProvider;

  if (
    (entry.transaction.kind === "product_grant" || entry.transaction.kind === "purchase") &&
    (!provider || provider === "Admin")
  ) {
    return "Store Checkout";
  }

  if (entry.transaction.kind === "purchase" && provider === "Internal Wallet") {
    return "Archive Balance";
  }

  return provider ?? "Internal Wallet";
}

function getAdminSourceLabel(entry: AdminTransactionEntry) {
  if (
    (entry.transaction.kind === "product_grant" || entry.transaction.kind === "purchase") &&
    entry.source === "admin_action"
  ) {
    return "store_checkout";
  }

  return entry.source;
}

function formatAdminSource(value: string) {
  switch (value) {
    case "store_checkout":
      return "Store Checkout";
    case "user_action":
      return "User Action";
    case "provider_webhook":
      return "Provider Webhook";
    case "provider_api_sync":
      return "Provider API Sync";
    case "admin_action":
      return "Admin Action";
    default:
      return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function getAdminTransactionTypeLabel(kind: string) {
  switch (kind) {
    case "purchase":
    case "product_grant":
      return "Buy";
    case "product_remove":
      return "Product Remove";
    case "product_quantity_adjustment":
      return "Quantity Adjustment";
    case "manual_credit":
      return "Manual Credit";
    case "manual_debit":
      return "Manual Debit";
    case "admin_initial_balance":
      return "Initial Balance";
    default:
      return kind.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function toDateTimeLocalValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toUtcIsoFromDateTimeLocal(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return new Date(trimmed).toISOString();
}

export function AdminUserDetailManager({
  documentAcceptance,
  detail: initialDetail,
  initialAuditLog,
  initialInventory,
  initialProducts,
  initialTransactions,
}: Props) {
  const [detail, setDetail] = useState(initialDetail);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [inventory, setInventory] = useState(initialInventory);
  const [auditLog, setAuditLog] = useState(initialAuditLog);
  const [products, setProducts] = useState(initialProducts);
  const [activeTab, setActiveTab] = useState<Tab>("transactions");
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  async function refreshAudit() {
    const response = await fetch(`/api/admin/users/${detail.user.id}/audit-log`);
    const data = (await response.json()) as { ok: boolean; auditLog?: AdminAuditEntry[] };
    if (data.ok && data.auditLog) {
      setAuditLog(data.auditLog);
    }
  }

  function notify(next: Toast) {
    setToast(next);
    window.setTimeout(() => setToast(null), 3600);
  }

  return (
    <div className="space-y-6">
      <Toast toast={toast} />
      <section className="rounded-[28px] border border-line bg-panel-strong p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link className="text-sm text-muted transition hover:text-foreground" href="/admin/users">
              Back to users
            </Link>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-foreground">
              {detail.user.username}
            </h2>
            <div className="mt-2 text-sm text-muted">
              {detail.user.email} / {detail.user.telegramUsername}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Balance" value={formatUsd(detail.balance.available)} />
            <Metric label="Deposited" value={formatUsd(detail.balance.totalDeposited)} />
            <Metric label="Spent" value={formatUsd(detail.balance.totalSpent)} />
            <Metric label="Inventory" value={String(inventory.filter((item) => item.status === "active").length)} />
          </div>
        </div>
        <div className="mt-5 rounded-[22px] border border-line bg-panel p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">Document Acceptance</div>
              <div className="mt-1 text-xs text-muted">
                Accepted all: {documentAcceptance.acceptedAllAt ? formatDisplayDateTime(documentAcceptance.acceptedAllAt) : "Missing / outdated"}
              </div>
              <div className="mt-1 text-xs text-muted">
                IP: {documentAcceptance.ipAddress ?? "N/A"} / User agent: {documentAcceptance.userAgent ?? "N/A"}
              </div>
            </div>
            <StatusPill value={documentAcceptance.accepted ? "accepted" : "action_required"} />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {Object.entries(documentAcceptance.required).map(([key, item]) => (
              <div className="rounded-[16px] border border-line bg-panel-strong px-3 py-2" key={key}>
                <div className="text-xs uppercase tracking-[0.16em] text-muted">{key}</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {item.accepted ? "Accepted" : "Missing"}
                </div>
                <div className="mt-1 text-xs text-muted">v{item.version}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {[
          ["transactions", "Transactions"],
          ["inventory", "Inventory / Archive"],
          ["add-product", "Add Product"],
          ["balance", "Adjust Balance"],
          ["audit", "Audit Log"],
        ].map(([id, label]) => (
          <button
            className={cn(
              "rounded-full border px-4 py-2 text-sm transition",
              activeTab === id
                ? "border-violet-300/50 bg-violet-500/20 text-white"
                : "border-line bg-panel text-muted hover:text-foreground",
            )}
            key={id}
            onClick={() => setActiveTab(id as Tab)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "transactions" ? (
        <TransactionsTab
          isPending={isPending}
          onNotify={notify}
          onRefreshAudit={refreshAudit}
          setTransactions={setTransactions}
          startTransition={startTransition}
          transactions={transactions}
          userId={detail.user.id}
        />
      ) : null}
      {activeTab === "inventory" ? (
        <InventoryTab
          inventory={inventory}
          isPending={isPending}
          onNotify={notify}
          onRefreshAudit={refreshAudit}
          setAuditLog={setAuditLog}
          setInventory={setInventory}
          startTransition={startTransition}
          userId={detail.user.id}
        />
      ) : null}
      {activeTab === "add-product" ? (
        <AddProductTab
          detail={detail}
          isPending={isPending}
          onNotify={notify}
          onRefreshAudit={refreshAudit}
          products={products}
          setDetail={setDetail}
          setInventory={setInventory}
          setProducts={setProducts}
          setTransactions={setTransactions}
          startTransition={startTransition}
          userId={detail.user.id}
        />
      ) : null}
      {activeTab === "balance" ? (
        <BalanceTab
          detail={detail}
          isPending={isPending}
          onNotify={notify}
          onRefreshAudit={refreshAudit}
          setDetail={setDetail}
          startTransition={startTransition}
        />
      ) : null}
      {activeTab === "audit" ? <AuditTab auditLog={auditLog} /> : null}
    </div>
  );
}

function TransactionsTab({
  isPending,
  onNotify,
  onRefreshAudit,
  setTransactions,
  startTransition,
  transactions,
  userId,
}: {
  isPending: boolean;
  onNotify: (toast: Toast) => void;
  onRefreshAudit: () => Promise<void>;
  setTransactions: (transactions: AdminTransactionEntry[]) => void;
  startTransition: TransitionStartFunction;
  transactions: AdminTransactionEntry[];
  userId: string;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminTransactionEntry | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return transactions;
    }
    return transactions.filter((entry) =>
      [
        entry.transaction.id,
        entry.transaction.kind,
        entry.transaction.status,
        entry.transaction.paymentProvider ?? "",
        entry.transaction.summary,
        entry.relatedProductTitle ?? "",
        entry.adminNote ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, transactions]);

  async function refresh() {
    const url = new URL(`/api/admin/users/${userId}/transactions`, window.location.origin);
    url.searchParams.set("query", query);
    const response = await fetch(url);
    const data = (await response.json()) as {
      ok: boolean;
      transactions?: AdminTransactionEntry[];
      error?: string;
    };
    if (!data.ok || !data.transactions) {
      throw new Error(data.error ?? "Unable to refresh transactions.");
    }
    setTransactions(data.transactions);
  }

  return (
    <section className="rounded-[28px] border border-line bg-panel-strong p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-lg font-semibold text-foreground">Transaction history</div>
          <p className="mt-1 text-sm text-muted">
            Provider amounts stay immutable. Use adjustment records for balance corrections.
          </p>
        </div>
        <label className="flex min-w-[280px] items-center gap-2 rounded-[16px] border border-line bg-panel px-3 py-2">
          <Search className="size-4 text-muted" />
          <input
            className="w-full bg-transparent text-sm text-foreground outline-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search transaction, provider, note"
            value={query}
          />
        </label>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-[1180px] w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.18em] text-muted">
            <tr className="border-b border-line">
              <th className="py-3 pr-4">Date</th>
              <th className="py-3 pr-4">Type</th>
              <th className="py-3 pr-4">Amount</th>
              <th className="py-3 pr-4">Status</th>
              <th className="py-3 pr-4">Provider</th>
              <th className="py-3 pr-4">Product / Order</th>
              <th className="py-3 pr-4">Balance</th>
              <th className="py-3 pr-4">Source</th>
              <th className="py-3 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr className="border-b border-line/70 align-top" key={entry.transaction.id}>
                <td className="py-4 pr-4 text-muted">{formatDisplayDateTime(entry.transaction.createdAt)}</td>
                <td className="py-4 pr-4">
                  <div className="font-medium text-foreground">
                    {getAdminTransactionTypeLabel(entry.transaction.kind)}
                  </div>
                  <div className="mt-1 text-xs text-muted">{entry.direction}</div>
                </td>
                <td className="py-4 pr-4 font-semibold text-foreground">
                  {formatCurrency(entry.transaction.amount, entry.transaction.displayCurrency ?? "USD")}
                </td>
                <td className="py-4 pr-4"><StatusPill value={entry.transaction.status} /></td>
                <td className="py-4 pr-4 text-muted">{getAdminProviderLabel(entry)}</td>
                <td className="py-4 pr-4 text-muted">
                  {entry.relatedProductTitle ?? entry.relatedProductId ?? "No product"}
                  <div className="text-xs">{entry.relatedOrderId ?? entry.transaction.referenceId}</div>
                </td>
                <td className="py-4 pr-4 text-muted">
                  {entry.balanceBefore === null ? "N/A" : formatUsd(entry.balanceBefore)}
                  {" -> "}
                  {entry.balanceAfter === null ? "N/A" : formatUsd(entry.balanceAfter)}
                </td>
                <td className="py-4 pr-4 text-muted">{formatAdminSource(getAdminSourceLabel(entry))}</td>
                <td className="py-4 pr-4">
                  <button
                    className="rounded-full border border-line px-3 py-1.5 text-xs text-foreground transition hover:bg-white/5"
                    onClick={() => setEditing(entry)}
                    type="button"
                  >
                    View / edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? (
        <TransactionEditor
          entry={editing}
          isPending={isPending}
          onClose={() => setEditing(null)}
          onNotify={onNotify}
          onRefresh={async () => {
            await refresh();
            await onRefreshAudit();
          }}
          startTransition={startTransition}
        />
      ) : null}
    </section>
  );
}

function InventoryTab({
  inventory,
  isPending,
  onNotify,
  onRefreshAudit,
  setAuditLog,
  setInventory,
  startTransition,
  userId,
}: {
  inventory: AdminInventoryEntry[];
  isPending: boolean;
  onNotify: (toast: Toast) => void;
  onRefreshAudit: () => Promise<void>;
  setAuditLog: (audit: AdminAuditEntry[]) => void;
  setInventory: (inventory: AdminInventoryEntry[]) => void;
  startTransition: TransitionStartFunction;
  userId: string;
}) {
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [qtyById, setQtyById] = useState<Record<string, string>>({});

  function mutateInventory(inventoryId: string, action: "increase" | "decrease" | "remove") {
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/users/${userId}/inventory/${inventoryId}/${action}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              quantity: qtyById[inventoryId] || 1,
              reason: reasonById[inventoryId],
              reduceStock: true,
              returnStock: action !== "increase",
            }),
          },
        );
        const data = (await response.json()) as {
          ok: boolean;
          inventory?: AdminInventoryEntry[];
          auditLog?: AdminAuditEntry[];
          error?: string;
        };
        if (!data.ok || !data.inventory) {
          throw new Error(data.error ?? "Inventory update failed.");
        }
        setInventory(data.inventory);
        if (data.auditLog) {
          setAuditLog(data.auditLog);
        } else {
          await onRefreshAudit();
        }
        onNotify({ tone: "success", message: "Inventory updated." });
      } catch (error) {
        onNotify({ tone: "error", message: error instanceof Error ? error.message : "Inventory update failed." });
      }
    });
  }

  return (
    <section className="rounded-[28px] border border-line bg-panel-strong p-5">
      <div className="text-lg font-semibold text-foreground">Inventory / Archive</div>
      <div className="mt-5 grid gap-4">
        {inventory.length === 0 ? (
          <EmptyState icon={Boxes} text="No archive items yet." />
        ) : (
          inventory.map((item) => (
            <div
              className="grid gap-4 rounded-[22px] border border-line bg-panel p-4 xl:grid-cols-[72px_1fr_120px_1.3fr]"
              key={item.inventoryId}
            >
              <ProductThumb product={item.product} />
              <div>
                <div className="font-semibold text-foreground">{item.product.title}</div>
                <div className="mt-1 text-sm text-muted">{item.product.collection} / {item.product.id}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusPill value={item.status} />
                  <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
                    {item.acquisitionSource}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-muted">Quantity</div>
                <div className="mt-2 text-2xl font-semibold text-foreground">{item.quantity}</div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[80px_1fr]">
                <input
                  className="rounded-[14px] border border-line bg-panel-strong px-3 py-2 text-sm text-foreground outline-none"
                  min={1}
                  onChange={(event) => setQtyById((current) => ({ ...current, [item.inventoryId]: event.target.value }))}
                  placeholder="Qty"
                  type="number"
                  value={qtyById[item.inventoryId] ?? "1"}
                />
                <input
                  className="rounded-[14px] border border-line bg-panel-strong px-3 py-2 text-sm text-foreground outline-none"
                  onChange={(event) => setReasonById((current) => ({ ...current, [item.inventoryId]: event.target.value }))}
                  placeholder="Required reason"
                  value={reasonById[item.inventoryId] ?? ""}
                />
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <SmallAction disabled={isPending} icon={Plus} label="Increase" onClick={() => mutateInventory(item.inventoryId, "increase")} />
                  <SmallAction disabled={isPending} icon={Minus} label="Decrease" onClick={() => mutateInventory(item.inventoryId, "decrease")} />
                  <SmallAction danger disabled={isPending} icon={ShieldAlert} label="Remove" onClick={() => mutateInventory(item.inventoryId, "remove")} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function AddProductTab({
  detail,
  isPending,
  onNotify,
  onRefreshAudit,
  products,
  setDetail,
  setInventory,
  setProducts,
  setTransactions,
  startTransition,
  userId,
}: {
  detail: AdminUserDetail;
  isPending: boolean;
  onNotify: (toast: Toast) => void;
  onRefreshAudit: () => Promise<void>;
  products: ProductRecord[];
  setDetail: (detail: AdminUserDetail) => void;
  setInventory: (inventory: AdminInventoryEntry[]) => void;
  setProducts: (products: ProductRecord[]) => void;
  setTransactions: (transactions: AdminTransactionEntry[]) => void;
  startTransition: TransitionStartFunction;
  userId: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [purchaseDate, setPurchaseDate] = useState(() => toDateTimeLocalValue(new Date()));
  const [reason, setReason] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [visibleUserNote, setVisibleUserNote] = useState("");
  const [reduceStock, setReduceStock] = useState(true);
  const [chargeBalance, setChargeBalance] = useState(true);
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;
  const selectedQuantity = Math.max(1, Number(quantity) || 1);
  const purchaseTotal = selectedProduct ? selectedProduct.price * selectedQuantity : 0;

  async function search() {
    const url = new URL("/api/admin/products/search", window.location.origin);
    url.searchParams.set("query", query);
    const response = await fetch(url);
    const data = (await response.json()) as { ok: boolean; products?: ProductRecord[]; error?: string };
    if (!data.ok || !data.products) {
      throw new Error(data.error ?? "Product search failed.");
    }
    setProducts(data.products);
    if (data.products[0]) {
      setSelectedProductId(data.products[0].id);
    }
  }

  function submit() {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/users/${userId}/inventory/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: selectedProductId,
            quantity,
            acquisitionSource: chargeBalance ? "store_checkout" : "admin_grant",
            reason,
            purchaseDate: toUtcIsoFromDateTimeLocal(purchaseDate),
            adminNote,
            visibleUserNote,
            reduceStock,
            createTransaction: true,
            chargeBalance,
          }),
        });
        const data = (await response.json()) as {
          ok: boolean;
          detail?: AdminUserDetail;
          inventory?: AdminInventoryEntry[];
          transactions?: AdminTransactionEntry[];
          error?: string;
        };
        if (!data.ok || !data.inventory || !data.detail) {
          throw new Error(data.error ?? "Product grant failed.");
        }
        setInventory(data.inventory);
        setDetail(data.detail);
        if (data.transactions) {
          setTransactions(data.transactions);
        }
        await onRefreshAudit();
        onNotify({
          tone: "success",
          message: chargeBalance
            ? "Store purchase recorded and balance charged."
            : "Product added to user archive.",
        });
      } catch (error) {
        onNotify({ tone: "error", message: error instanceof Error ? error.message : "Product grant failed." });
      }
    });
  }

  return (
    <section className="rounded-[28px] border border-line bg-panel-strong p-5">
      <div className="text-lg font-semibold text-foreground">Add product to user</div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_360px]">
        <div>
          <div className="flex gap-3">
            <label className="flex flex-1 items-center gap-2 rounded-[16px] border border-line bg-panel px-3 py-2">
              <Search className="size-4 text-muted" />
              <input
                className="w-full bg-transparent text-sm text-foreground outline-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search product, collection, SKU"
                value={query}
              />
            </label>
            <Button onClick={() => startTransition(search)} type="button" variant="secondary">
              Search
            </Button>
          </div>
          <div className="mt-4 grid gap-3">
            {products.map((product) => (
              <button
                className={cn(
                  "grid gap-4 rounded-[20px] border p-4 text-left transition sm:grid-cols-[64px_1fr_auto]",
                  selectedProductId === product.id
                    ? "border-violet-300/50 bg-violet-500/15"
                    : "border-line bg-panel hover:bg-white/[0.04]",
                )}
                key={product.id}
                onClick={() => setSelectedProductId(product.id)}
                type="button"
              >
                <ProductThumb product={product} />
                <div>
                  <div className="font-semibold text-foreground">{product.title}</div>
                  <div className="mt-1 text-sm text-muted">{product.collection} / {product.id}</div>
                </div>
                <div className="text-sm text-muted">
                  <div>{formatCurrency(product.price, product.currency)}</div>
                  <div>Stock: {product.stock}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-[22px] border border-line bg-panel p-4">
          <div className="font-semibold text-foreground">Grant settings</div>
          <div className="mt-4 grid gap-3">
            <div className="rounded-[16px] border border-line bg-panel-strong px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3 text-muted">
                <span>Purchase total</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(purchaseTotal, selectedProduct?.currency ?? "USD")}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-muted">
                <span>Current balance</span>
                <span className="font-semibold text-foreground">{formatUsd(detail.balance.available)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-muted">
                <span>{chargeBalance ? "After purchase" : "After grant"}</span>
                <span className="font-semibold text-foreground">
                  {formatUsd(chargeBalance ? detail.balance.available - purchaseTotal : detail.balance.available)}
                </span>
              </div>
            </div>
            <DarkInput label="Quantity" onChange={setQuantity} type="number" value={quantity} />
            <DarkInput
              label="Purchase Date"
              onChange={setPurchaseDate}
              type="datetime-local"
              value={purchaseDate}
            />
            <DarkInput label="Required reason" onChange={setReason} placeholder="support compensation" value={reason} />
            <DarkInput label="Internal admin note" onChange={setAdminNote} value={adminNote} />
            <DarkInput label="Visible user note" onChange={setVisibleUserNote} value={visibleUserNote} />
            <label className="flex items-center justify-between gap-3 rounded-[16px] border border-line bg-panel-strong px-4 py-3 text-sm text-foreground">
              Record as store purchase and charge archive balance
              <input checked={chargeBalance} onChange={(event) => setChargeBalance(event.target.checked)} type="checkbox" />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-[16px] border border-line bg-panel-strong px-4 py-3 text-sm text-foreground">
              Reduce product stock
              <input checked={reduceStock} onChange={(event) => setReduceStock(event.target.checked)} type="checkbox" />
            </label>
            <Button disabled={isPending || !selectedProductId} onClick={submit} type="button">
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus className="size-4" />}
              Add Product
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function BalanceTab({
  detail,
  isPending,
  onNotify,
  onRefreshAudit,
  setDetail,
  startTransition,
}: {
  detail: AdminUserDetail;
  isPending: boolean;
  onNotify: (toast: Toast) => void;
  onRefreshAudit: () => Promise<void>;
  setDetail: (detail: AdminUserDetail) => void;
  startTransition: TransitionStartFunction;
}) {
  const [adjustmentType, setAdjustmentType] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [visibleUserNote, setVisibleUserNote] = useState("");

  function submit() {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/users/${detail.user.id}/balance/adjust`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adjustmentType,
            amount,
            currency: "USD",
            reason,
            internalNote,
            visibleUserNote,
          }),
        });
        const data = (await response.json()) as { ok: boolean; detail?: AdminUserDetail; error?: string };
        if (!data.ok || !data.detail) {
          throw new Error(data.error ?? "Balance adjustment failed.");
        }
        setDetail(data.detail);
        await onRefreshAudit();
        onNotify({ tone: "success", message: "Balance adjustment recorded." });
      } catch (error) {
        onNotify({ tone: "error", message: error instanceof Error ? error.message : "Balance adjustment failed." });
      }
    });
  }

  return (
    <section className="rounded-[28px] border border-line bg-panel-strong p-5">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-1 size-5 text-amber-300" />
        <div>
          <div className="text-lg font-semibold text-foreground">Manual balance adjustment</div>
          <p className="mt-1 text-sm text-muted">
            This creates a new ledger transaction. Provider payment history is not overwritten.
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[22px] border border-line bg-panel p-4">
          <Metric label="Current available balance" value={formatUsd(detail.balance.available)} />
        </div>
        <div className="grid gap-3 rounded-[22px] border border-line bg-panel p-4">
          <select
            className="rounded-[14px] border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none"
            onChange={(event) => setAdjustmentType(event.target.value as "credit" | "debit")}
            value={adjustmentType}
          >
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
          </select>
          <DarkInput label="Amount" onChange={setAmount} type="number" value={amount} />
          <DarkInput label="Required reason" onChange={setReason} value={reason} />
          <DarkInput label="Internal note" onChange={setInternalNote} value={internalNote} />
          <DarkInput label="Visible user note" onChange={setVisibleUserNote} value={visibleUserNote} />
          <Button disabled={isPending} onClick={submit} type="button">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Record Adjustment
          </Button>
        </div>
      </div>
    </section>
  );
}

function AuditTab({ auditLog }: { auditLog: AdminAuditEntry[] }) {
  return (
    <section className="rounded-[28px] border border-line bg-panel-strong p-5">
      <div className="text-lg font-semibold text-foreground">Audit log</div>
      <div className="mt-5 space-y-3">
        {auditLog.length === 0 ? (
          <EmptyState icon={FileClock} text="No admin audit events yet." />
        ) : (
          auditLog.map((entry) => (
            <div className="rounded-[20px] border border-line bg-panel p-4" key={entry.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-semibold text-foreground">{entry.action}</div>
                <div className="text-sm text-muted">{formatDisplayDateTime(entry.createdAt)}</div>
              </div>
              <div className="mt-2 text-sm text-muted">
                {entry.adminUsername} changed {entry.entityType} {entry.entityId}
              </div>
              <div className="mt-2 rounded-[14px] border border-line bg-panel-strong px-3 py-2 text-sm text-foreground">
                {entry.reason}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function TransactionEditor({
  entry,
  isPending,
  onClose,
  onNotify,
  onRefresh,
  startTransition,
}: {
  entry: AdminTransactionEntry;
  isPending: boolean;
  onClose: () => void;
  onNotify: (toast: Toast) => void;
  onRefresh: () => Promise<void>;
  startTransition: TransitionStartFunction;
}) {
  const [status, setStatus] = useState(entry.transaction.status);
  const [adminNote, setAdminNote] = useState(entry.adminNote ?? "");
  const [paymentProvider, setPaymentProvider] = useState(
    getAdminProviderLabel(entry),
  );
  const [source, setSource] = useState(getAdminSourceLabel(entry));
  const [supportNote, setSupportNote] = useState(entry.supportNote ?? "");
  const [visibleDescription, setVisibleDescription] = useState(entry.visibleDescription ?? "");
  const [relatedProductId, setRelatedProductId] = useState(entry.relatedProductId ?? "");
  const [relatedOrderId, setRelatedOrderId] = useState(entry.relatedOrderId ?? "");
  const [reason, setReason] = useState("");

  function submit() {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/transactions/${entry.transaction.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            paymentProvider,
            source,
            adminNote,
            supportNote,
            visibleDescription,
            relatedProductId,
            relatedOrderId,
            reason,
          }),
        });
        const data = (await response.json()) as { ok: boolean; error?: string };
        if (!data.ok) {
          throw new Error(data.error ?? "Transaction update failed.");
        }
        await onRefresh();
        onNotify({ tone: "success", message: "Transaction metadata updated." });
        onClose();
      } catch (error) {
        onNotify({ tone: "error", message: error instanceof Error ? error.message : "Transaction update failed." });
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 p-4 backdrop-blur" onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-[720px] overflow-y-auto rounded-[28px] border border-line bg-[#101425] p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-foreground">{entry.transaction.id}</div>
            <div className="mt-1 text-sm text-muted">{entry.transaction.summary}</div>
          </div>
          <button className="text-muted hover:text-foreground" onClick={onClose} type="button">Close</button>
        </div>
        <div className="mt-5 grid gap-3">
          <select className="rounded-[14px] border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none" onChange={(event) => setStatus(event.target.value as TransactionRecord["status"])} value={status}>
            {transactionStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <label className="space-y-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">Provider</span>
            <select
              className="w-full rounded-[14px] border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
              onChange={(event) => setPaymentProvider(event.target.value)}
              value={paymentProvider}
            >
              {editableProviders.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">Source</span>
            <select
              className="w-full rounded-[14px] border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
              onChange={(event) => setSource(event.target.value)}
              value={source}
            >
              {editableSources.map((item) => (
                <option key={item} value={item}>
                  {formatAdminSource(item)}
                </option>
              ))}
            </select>
          </label>
          <DarkInput label="Admin note" onChange={setAdminNote} value={adminNote} />
          <DarkInput label="Support note" onChange={setSupportNote} value={supportNote} />
          <DarkInput label="Visible description" onChange={setVisibleDescription} value={visibleDescription} />
          <DarkInput label="Related product ID" onChange={setRelatedProductId} value={relatedProductId} />
          <DarkInput label="Related order ID" onChange={setRelatedOrderId} value={relatedOrderId} />
          <DarkInput label="Required reason" onChange={setReason} value={reason} />
          <Button disabled={isPending} onClick={submit} type="button">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Save safe fields
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProductThumb({ product }: { product: ProductRecord }) {
  return (
    <div className="relative size-16 overflow-hidden rounded-[16px] border border-line bg-panel-strong">
      {product.imageUrl ? (
        <Image alt="" className="object-cover" fill sizes="64px" src={product.imageUrl} />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted">{product.rarity}</div>
      )}
    </div>
  );
}

function SmallAction({
  danger,
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  danger?: boolean;
  disabled?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-50",
        danger
          ? "border-rose-400/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
          : "border-line bg-panel-strong text-foreground hover:bg-white/5",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function DarkInput({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] uppercase tracking-[0.18em] text-muted">{label}</span>
      <input
        className="w-full rounded-[14px] border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted"
        min={type === "number" ? 0 : undefined}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        step={type === "number" ? "0.01" : undefined}
        type={type}
        value={value}
      />
    </label>
  );
}

function StatusPill({ value }: { value: string }) {
  const tone =
    value === "completed" || value === "active"
      ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-100"
      : value === "pending"
        ? "border-amber-300/30 bg-amber-500/10 text-amber-100"
        : value === "removed" || value === "failed"
          ? "border-rose-300/30 bg-rose-500/10 text-rose-100"
          : "border-line bg-panel-strong text-muted";
  return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs", tone)}>{value}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-line bg-panel px-4 py-3">
      <div className="text-xs uppercase tracking-[0.18em] text-muted">{label}</div>
      <div className="mt-2 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  text,
}: {
  icon: ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[20px] border border-dashed border-line bg-panel px-4 py-6 text-sm text-muted">
      <Icon className="size-4" />
      {text}
    </div>
  );
}

function Toast({ toast }: { toast: Toast }) {
  if (!toast) {
    return null;
  }
  return (
    <div
      className={cn(
        "fixed right-5 top-5 z-[300] rounded-[18px] border px-4 py-3 text-sm shadow-2xl backdrop-blur",
        toast.tone === "success"
          ? "border-emerald-300/30 bg-emerald-500/20 text-emerald-50"
          : "border-rose-300/30 bg-rose-500/20 text-rose-50",
      )}
    >
      {toast.message}
    </div>
  );
}
