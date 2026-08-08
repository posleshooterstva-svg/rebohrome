"use client";

/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { Check, Download, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPublicProductTitle } from "@/lib/rebohrome-data";
import { cn } from "@/lib/utils";

type ReceiptUser = {
  id: string;
  username: string;
  email: string;
  name: string;
};

type ReceiptProduct = {
  id: string;
  title: string;
  collection: string;
  category: string;
  price: number;
  currency: string;
  imageUrl: string | null;
};

type ReceiptItem = ReceiptProduct & {
  quantity: number;
};

type ReceiptData = {
  receiptId: string;
  orderId: string;
  purchaseDate: string;
  cardLast4: string;
  paymentMethodLabel: string;
  customerEmail: string;
  visibleNote: string;
  internalNote: string;
  currency: string;
  items: ReceiptItem[];
};

const sampleDate = "2026-06-14T23:56";
const initialReceiptId = "RH-2026-DRAFT";
const initialOrderId = "ORD-2026-DRAFT";

const sampleReceipt: ReceiptData = {
  receiptId: "RH-2026-1842",
  orderId: "ORD-2026-XRJZ8",
  purchaseDate: sampleDate,
  cardLast4: "5771",
  paymentMethodLabel: "Card",
  customerEmail: "collector@rebohrome.com",
  visibleNote: "",
  internalNote: "",
  currency: "USD",
  items: [
    {
      id: "sample-espeon-cgc-85",
      title: "2012 #48 Espeon CGC 8.5",
      collection: "Digital collectible card",
      category: "Digital collectible card",
      price: 470.16,
      currency: "USD",
      imageUrl: "/uploads/photo_2026-06-03_18-02-49.jpg",
      quantity: 1,
    },
  ],
};

function currentDateTimeLocal() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function generateReceiptId() {
  return `RH-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function generateOrderId() {
  return `ORD-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(amount);
}

function formatDate(value: string) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function validateReceipt(data: ReceiptData, selectedUser: ReceiptUser | null, total: number) {
  const issues: string[] = [];
  if (!selectedUser) issues.push("User is required.");
  if (!data.items.length) issues.push("Select at least one card.");
  if (!data.purchaseDate) issues.push("Purchase date is required.");
  if (!/^\d{4}$/.test(data.cardLast4)) issues.push("Card last 4 must be exactly 4 digits.");
  if (!data.orderId.trim()) issues.push("Order ID is required.");
  if (!data.receiptId.trim()) issues.push("Receipt ID is required.");
  if (total <= 0) issues.push("Receipt amount must be greater than 0.");
  return issues;
}

export function ReceiptBuilderClient() {
  const [userQuery, setUserQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [users, setUsers] = useState<ReceiptUser[]>([]);
  const [products, setProducts] = useState<ReceiptProduct[]>([]);
  const [selectedUser, setSelectedUser] = useState<ReceiptUser | null>(null);
  const [data, setData] = useState<ReceiptData>({
    ...sampleReceipt,
    receiptId: initialReceiptId,
    orderId: initialOrderId,
    purchaseDate: sampleDate,
    cardLast4: "",
    customerEmail: "",
    items: [],
  });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(
    () => data.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [data.items],
  );
  const issues = useMemo(() => validateReceipt(data, selectedUser, total), [data, selectedUser, total]);

  useEffect(() => {
    setData((current) => {
      if (current.receiptId !== initialReceiptId || current.orderId !== initialOrderId) {
        return current;
      }

      return {
        ...current,
        receiptId: generateReceiptId(),
        orderId: generateOrderId(),
        purchaseDate: currentDateTimeLocal(),
      };
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/users/search?query=${encodeURIComponent(userQuery)}&limit=8`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((payload) => setUsers(payload.users ?? []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [userQuery]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/products/search?query=${encodeURIComponent(productQuery)}&limit=8`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((payload) => setProducts(payload.products ?? []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [productQuery]);

  function update<Key extends keyof ReceiptData>(key: Key, value: ReceiptData[Key]) {
    setData((current) => ({ ...current, [key]: value }));
  }

  function selectUser(user: ReceiptUser) {
    setSelectedUser(user);
    setData((current) => ({
      ...current,
      customerEmail: user.email,
    }));
  }

  function addProduct(product: ReceiptProduct) {
    setData((current) => {
      const existing = current.items.find((item) => item.id === product.id);
      if (existing) {
        return {
          ...current,
          items: current.items.map((item) =>
            item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
          ),
        };
      }
      return {
        ...current,
        currency: product.currency || current.currency,
        items: [...current.items, { ...product, quantity: 1 }],
      };
    });
  }

  function loadSample() {
    setSelectedUser({
      id: "sample-user",
      username: "collector",
      email: "collector@rebohrome.com",
      name: "Collector",
    });
    setData(sampleReceipt);
  }

  async function saveAndPrint() {
    setError(null);
    setStatus(null);
    if (issues.length) {
      setError("Fix validation issues before generating PDF.");
      return;
    }
    const response = await fetch("/api/admin/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        userId: selectedUser?.id,
        customerEmail: data.customerEmail || selectedUser?.email,
        amount: total,
        purchaseDate: new Date(data.purchaseDate).toISOString(),
      }),
    });
    const payload = (await response.json()) as { ok: boolean; fileName?: string; error?: string };
    if (!payload.ok) {
      setError(payload.error ?? "Unable to create receipt.");
      return;
    }
    setStatus(`Receipt saved. Suggested file name: ${payload.fileName}`);
    window.print();
  }

  return (
    <>
      <style jsx global>{`
        .receipt-print-layer {
          display: none;
        }

        .receipt-document {
          background: #f3f4f8 !important;
          color: #111827 !important;
        }

        .receipt-paper-card {
          background: #ffffff !important;
          border: 1px solid #e6e8ef !important;
          color: #111827 !important;
          box-shadow: 0 14px 50px rgba(15, 23, 42, 0.08) !important;
        }

        .receipt-soft-row {
          background: #f7f8fc !important;
          color: #111827 !important;
        }

        @page {
          size: A4;
          margin: 0;
        }

        @media print {
          html,
          body {
            background: #f3f4f8 !important;
            height: 297mm !important;
            margin: 0 !important;
            overflow: hidden !important;
            width: 210mm !important;
          }

          body * {
            visibility: hidden !important;
          }

          #receipt-print-root,
          #receipt-print-root * {
            visibility: visible !important;
          }

          .receipt-screen,
          .admin-layout,
          .dashboard-header,
          .sidebar,
          .topbar,
          .profile-menu,
          .notification-button,
          .receipt-controls,
          .receipt-form {
            display: none !important;
          }

          #receipt-print-root.receipt-print-layer {
            display: flex !important;
            position: fixed !important;
            inset: 0 auto auto 0 !important;
            height: 297mm;
            width: 210mm;
            align-items: flex-start;
            justify-content: center;
            background: #f3f4f8;
            overflow: hidden;
            padding: 8mm 0 0;
          }

          .receipt-document {
            width: 168mm !important;
            max-width: 168mm !important;
            break-inside: avoid;
            page-break-inside: avoid;
            box-shadow: none !important;
            padding: 0 !important;
          }

          .receipt-paper-card {
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="receipt-screen grid gap-5 xl:grid-cols-[minmax(0,440px)_1fr]">
        <div className="space-y-4">
          <div className="rounded-[24px] border border-line bg-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Receipt Builder</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">Purchase receipt</h2>
              </div>
              <Button onClick={loadSample} type="button" variant="secondary">
                Sample
              </Button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">User</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
                  <input
                    className="w-full rounded-2xl border border-line bg-panel-strong py-3 pl-11 pr-4 text-sm text-foreground outline-none"
                    onChange={(event) => setUserQuery(event.target.value)}
                    placeholder="Search username, email, user ID"
                    value={userQuery}
                  />
                </div>
              </label>
              <div className="grid gap-2">
                {users.map((user) => (
                  <button
                    className={cn(
                      "rounded-2xl border border-line bg-panel-strong px-4 py-3 text-left text-sm text-muted transition hover:text-foreground",
                      selectedUser?.id === user.id && "border-violet-300/40 text-foreground",
                    )}
                    key={user.id}
                    onClick={() => selectUser(user)}
                    type="button"
                  >
                    <div className="font-semibold">{user.username || user.name}</div>
                    <div className="text-xs">{user.email}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-line bg-panel p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Cards</div>
            <label className="mt-4 grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Select cards</span>
              <input
                className="rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none"
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Search name, SKU, collection, rarity"
                value={productQuery}
              />
            </label>
            <div className="mt-3 grid gap-2">
              {products.map((product) => (
                <button
                  className="flex items-center gap-3 rounded-2xl border border-line bg-panel-strong p-3 text-left transition hover:border-violet-300/35"
                  key={product.id}
                  onClick={() => addProduct(product)}
                  type="button"
                >
                  <ProductThumb product={product} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {getPublicProductTitle(product.title)}
                    </div>
                    <div className="text-xs text-muted">{product.collection}</div>
                  </div>
                  <div className="text-sm font-semibold text-foreground">{formatMoney(product.price, product.currency)}</div>
                  <Plus className="size-4 text-muted" />
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-line bg-panel p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Receipt fields</div>
            <div className="mt-4 grid gap-3">
              <ReceiptInput label="Receipt ID" value={data.receiptId} onChange={(value) => update("receiptId", value.trim().toUpperCase())} />
              <ReceiptInput label="Order ID" value={data.orderId} onChange={(value) => update("orderId", value.trim().toUpperCase())} />
              <ReceiptInput label="Purchase Date" type="datetime-local" value={data.purchaseDate} onChange={(value) => update("purchaseDate", value)} />
              <ReceiptInput label="Card last 4 digits" maxLength={4} value={data.cardLast4} onChange={(value) => update("cardLast4", value.replace(/\D/g, "").slice(0, 4))} />
              <ReceiptInput label="Customer email" value={data.customerEmail} onChange={(value) => update("customerEmail", value)} />
              <ReceiptInput label="Visible note" value={data.visibleNote} onChange={(value) => update("visibleNote", value)} />
              <ReceiptInput label="Internal admin note" value={data.internalNote} onChange={(value) => update("internalNote", value)} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[24px] border border-line bg-panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Preview</div>
                <div className="mt-2 text-sm text-muted">Total: {formatMoney(total, data.currency)}</div>
              </div>
              <Button disabled={issues.length > 0} onClick={saveAndPrint} type="button">
                <Download className="size-4" />
                Download PDF
              </Button>
            </div>
            {issues.length ? (
              <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-100">
                {issues.map((issue) => (
                  <div key={issue}>{issue}</div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                Receipt is ready.
              </div>
            )}
            {status ? <div className="mt-3 rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">{status}</div> : null}
            {error ? <div className="mt-3 rounded-2xl border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
          </div>

          <SelectedItems data={data} setData={setData} />
          <div className="overflow-auto rounded-[24px] border border-line bg-[#f3f4f8] p-6">
            <ReceiptPreview data={data} total={total} />
          </div>
        </div>
      </div>

      <div className="receipt-print-layer" id="receipt-print-root">
        <ReceiptPreview data={data} total={total} />
      </div>
    </>
  );
}

function ReceiptInput({
  label,
  maxLength,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  maxLength?: number;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</span>
      <input
        className="rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none"
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function SelectedItems({
  data,
  setData,
}: {
  data: ReceiptData;
  setData: Dispatch<SetStateAction<ReceiptData>>;
}) {
  if (!data.items.length) {
    return null;
  }
  return (
    <div className="rounded-[24px] border border-line bg-panel p-5">
      <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Selected cards</div>
      <div className="mt-4 grid gap-3">
        {data.items.map((item) => (
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel-strong p-3" key={item.id}>
            <ProductThumb product={item} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">{item.title}</div>
              <div className="text-xs text-muted">{formatMoney(item.price, item.currency)} x {item.quantity}</div>
            </div>
            <input
              className="w-16 rounded-xl border border-line bg-panel px-2 py-2 text-center text-sm text-foreground"
              min={1}
              onChange={(event) =>
                setData((current) => ({
                  ...current,
                  items: current.items.map((row) =>
                    row.id === item.id ? { ...row, quantity: Math.max(1, Number(event.target.value) || 1) } : row,
                  ),
                }))
              }
              type="number"
              value={item.quantity}
            />
            <button
              className="rounded-xl border border-line p-2 text-muted transition hover:text-rose-200"
              onClick={() =>
                setData((current) => ({
                  ...current,
                  items: current.items.filter((row) => row.id !== item.id),
                }))
              }
              type="button"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductThumb({ product }: { product: { imageUrl: string | null; title: string } }) {
  return (
    <div className="relative h-16 w-12 overflow-hidden rounded-lg border border-black/10 bg-white">
      <ProductImage className="h-full w-full object-cover" imageUrl={product.imageUrl} title={product.title} />
    </div>
  );
}

function ProductImage({ className, imageUrl, title }: { className: string; imageUrl: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  const src = normalizeReceiptImageUrl(imageUrl);

  if (!src || failed) {
    return (
      <div className="grid h-full w-full place-items-center bg-[#eee8ff]">
        <Image
          alt=""
          className="size-8 object-contain"
          height={64}
          src="/uploads/rebohrome-veriff-logo-icon.png"
          width={64}
        />
      </div>
    );
  }

  return <img alt="" className={className} onError={() => setFailed(true)} src={src} title={title} />;
}

function normalizeReceiptImageUrl(imageUrl: string | null) {
  const trimmed = imageUrl?.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/\\/g, "/");
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith("data:")) {
    return encodeURI(normalized);
  }

  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return encodeURI(withLeadingSlash);
}

function LegacyReceiptPreview({ data, total }: { data: ReceiptData; total: number }) {
  return (
    <article className="receipt-card mx-auto w-[720px] max-w-full rounded-[12px] border border-[#d9dce7] bg-white px-10 py-8 font-sans text-[#111827] shadow-[0_18px_70px_rgba(15,23,42,0.16)]">
      <section className="receipt-section receipt-section-soft rounded-[18px] px-6 py-6 text-center">
        <div className="flex items-center gap-4">
          <Image
            alt="ReboHrome"
            className="size-12 object-contain"
            height={96}
            src="/uploads/rebohrome-veriff-logo-icon.png"
            width={96}
          />
          <div className="text-[18px] font-semibold tracking-[0.42em] text-[#141827]">REBOHROME</div>
        </div>
        <h1 className="mt-5 font-serif text-[32px] leading-tight text-[#111827]">Receipt from REBOHROME</h1>
        <div className="mt-2 text-sm text-[#7b8195]">Receipt #{data.receiptId || "RH-2026-1842"}</div>
      </section>

      <section className="receipt-section mt-5 rounded-[16px] p-4">
        <div className="grid grid-cols-3 gap-3">
          <ReceiptMeta label="Amount paid" value={formatMoney(total, data.currency)} />
          <ReceiptMeta label="Date paid" value={formatDate(data.purchaseDate)} />
          <ReceiptMeta label="Payment method" value={`${data.paymentMethodLabel || "Card"} •••• ${data.cardLast4 || "5771"}`} />
        </div>
      </section>

      <section className="receipt-section mt-5 rounded-[16px] p-5">
        <div className="flex items-center justify-between border-b border-[#eceef5] pb-3">
          <h2 className="font-serif text-[21px] text-[#111827]">Order summary</h2>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b90a3]">Archive purchase</span>
        </div>
        <div className="mt-4 space-y-3">
          {data.items.map((item) => (
            <div className="receipt-line-item flex items-center gap-5 rounded-[14px] p-3" key={item.id}>
              <ProductThumb product={item} />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-[#171b2a]">{item.title}</div>
                <div className="mt-1 text-sm text-[#7b8195]">{item.category || "Digital collectible card"}</div>
              </div>
              <div className="text-[15px] font-semibold text-[#171b2a]">{formatMoney(item.price * item.quantity, data.currency)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="receipt-section receipt-section-soft mt-5 rounded-[16px] p-5">
        <div className="flex justify-between text-sm text-[#6f7689]">
          <span>Subtotal</span>
          <span>{formatMoney(total, data.currency)}</span>
        </div>
        <div className="mt-3 border-t border-[#e1e4ee] pt-3 flex justify-between text-[15px] font-semibold text-[#171b2a]">
          <span>Amount paid</span>
          <span>{formatMoney(total, data.currency)}</span>
        </div>
      </section>

      <section className="receipt-section receipt-delivery mt-5 rounded-[16px] px-5 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Delivery status</div>
        <div className="mt-5 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-violet-800 shadow-sm">
            <span className="grid size-5 place-items-center rounded-full bg-violet-700 text-white">
              <Check className="size-3.5" />
            </span>
            Delivered to Archive Wallet
          </div>
        </div>
      </section>

      <section className="receipt-section mt-4 rounded-[16px] px-5 py-4 text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b90a3]">Order ID</div>
        <div className="mt-2 text-sm font-semibold text-[#171b2a]">{data.orderId || "ORD-2026-XRJZ8"}</div>
      </section>

      {data.visibleNote ? (
        <section className="receipt-section mt-4 rounded-[16px] px-5 py-4 text-center text-sm text-[#4b5565]">{data.visibleNote}</section>
      ) : null}

      <footer className="receipt-section receipt-section-soft mt-5 rounded-[16px] px-5 py-4 text-center text-sm text-[#7b8195]">
        <div className="font-semibold text-[#4b5565]">Need help?</div>
        <div className="mt-1">Contact support at <span className="text-violet-700">support@rebohrome.com</span></div>
      </footer>
    </article>
  );
}

void LegacyReceiptPreview;

function ReceiptMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-[#f7f8fc] px-4 py-3">
      <div className="text-sm text-[#7b8195]">{label}</div>
      <div className="mt-2 text-[18px] font-medium text-[#111827]">{value}</div>
    </div>
  );
}

export function ReceiptPreview({ data, total }: { data: ReceiptData; total: number }) {
  const itemCount = data.items.reduce((sum, item) => sum + item.quantity, 0);
  const primaryItem = data.items[0] ?? null;

  return (
    <article className="receipt-document mx-auto w-[560px] max-w-full rounded-[18px] bg-[#f3f4f8] p-7 font-sans text-[#111827]">
      <section className="receipt-paper-card rounded-[12px] bg-white px-7 py-7">
        <div className="flex items-start justify-between gap-5">
          <div>
            <h1 className="text-[20px] font-semibold tracking-[-0.03em] text-[#0f172a]">
              Order {data.orderId || "ORD-2026-XRJZ8"}
            </h1>
            <div className="mt-1 text-[13px] text-[#858ba0]">
              {formatDate(data.purchaseDate)} <span className="text-[#aeb3c2]">•</span>{" "}
              <span className="font-semibold text-emerald-600">Delivered</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Image
              alt="ReboHrome"
              className="size-8 object-contain"
              height={64}
              src="/uploads/rebohrome-veriff-logo-icon.png"
              width={64}
            />
            <div className="text-[13px] font-semibold uppercase tracking-[0.28em] text-[#111827]">ReboHrome</div>
          </div>
        </div>

        <div className="mt-7 flex items-center gap-4">
          <div className="relative size-16 overflow-hidden rounded-[18px] border border-[#e6e8ef] bg-[#f7f8fc]">
            <ProductImage
              className="h-full w-full object-cover"
              imageUrl={primaryItem?.imageUrl ?? null}
              title={primaryItem ? getPublicProductTitle(primaryItem.title) : "Receipt item"}
            />
          </div>
          <div className="min-w-0">
            <div className="text-[24px] font-semibold tracking-[-0.04em] text-[#0b1020]">
              {formatMoney(total, data.currency)}
            </div>
            <div className="mt-1 truncate text-[13px] font-medium text-[#5f6678]">
              {primaryItem ? getPublicProductTitle(primaryItem.title) : "Select product to generate receipt"}
            </div>
          </div>
        </div>

        <div className="mt-7 grid gap-4 text-[13px]">
          <ReceiptDetail label="Billed to" value={data.customerEmail || "collector@rebohrome.com"} />
          <ReceiptDetail label="Paid with" value={`${data.paymentMethodLabel || "Card"} •••• ${data.cardLast4 || "5771"}`} />
          <ReceiptDetail label="Charge amount" value={formatMoney(total, data.currency)} strong />
          <ReceiptDetail label="Receipt ID" value={data.receiptId || "RH-2026-1842"} />
          <ReceiptDetail label="Archive delivery" value="Delivered to Archive Wallet" strong />
        </div>

        <div className="receipt-soft-row mt-7 rounded-[12px] bg-[#f7f8fc] p-4">
          <div className="mb-3 text-[13px] font-semibold text-[#0f172a]">Order summary</div>
          <div className="space-y-3">
            {data.items.map((item) => (
              <div className="flex items-center gap-4" key={item.id}>
                <ProductThumb product={item} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-[#111827]">{getPublicProductTitle(item.title)}</div>
                  <div className="mt-1 text-[12px] text-[#858ba0]">
                    {item.category || "Digital collectible card"}
                    {item.quantity > 1 ? ` · Qty ${item.quantity}` : ""}
                  </div>
                </div>
                <div className="text-[14px] font-semibold text-[#111827]">
                  {formatMoney(item.price * item.quantity, data.currency)}
                </div>
              </div>
            ))}
            {!data.items.length ? <div className="text-[13px] text-[#858ba0]">No items selected.</div> : null}
          </div>
        </div>

        <div className="mt-5 border-t border-[#e7e9f0] pt-4">
          <div className="flex items-center justify-between text-[14px] font-semibold text-[#111827]">
            <span>Amount paid</span>
            <span>{formatMoney(total, data.currency)}</span>
          </div>
          <div className="mt-4 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-lg bg-[#efeaff] px-4 py-2 text-[13px] font-semibold text-[#5f35d8]">
              <span className="grid size-5 place-items-center rounded-full bg-[#6f45f8] text-white">
                <Check className="size-3.5" />
              </span>
              Delivered to Archive Wallet
            </div>
          </div>
          <div className="mt-4 text-center text-[13px] text-[#858ba0]">
            {itemCount || 0} {itemCount === 1 ? "collectible" : "collectibles"} · Receipt #{data.receiptId || "RH-2026-1842"}
          </div>
        </div>
      </section>

      {data.visibleNote ? (
        <section className="receipt-paper-card mt-4 rounded-[12px] bg-white px-7 py-4 text-center text-[13px] text-[#5f6678]">
          {data.visibleNote}
        </section>
      ) : null}

      <footer className="mt-4 text-center text-[11px] leading-relaxed text-[#858ba0]">
        Need help? Contact support at <span className="text-[#5f35d8]">support@rebohrome.com</span>
      </footer>
    </article>
  );
}

function ReceiptDetail({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-5">
      <div className="text-[#858ba0]">{label}</div>
      <div className={cn("min-w-0 break-words text-[#111827]", strong && "font-semibold")}>{value}</div>
    </div>
  );
}
