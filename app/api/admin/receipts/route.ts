import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db/client";
import { getRequestMeta, requireAdminSession } from "@/lib/session";

export const runtime = "nodejs";

type ReceiptItemInput = {
  id?: unknown;
  title?: unknown;
  imageUrl?: unknown;
  collection?: unknown;
  category?: unknown;
  quantity?: unknown;
  price?: unknown;
  currency?: unknown;
};

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeMoney(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.round(next * 100) / 100 : 0;
}

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "receipt";
}

async function ensureReceiptTables() {
  const db = getDbClient();
  await db.execute(
    `create table if not exists admin_purchase_receipts (
      id text primary key,
      receipt_id text not null unique,
      order_id text not null,
      user_id text not null,
      customer_email text not null,
      purchase_date text not null,
      payment_method text not null,
      card_last4 text not null,
      amount real not null,
      currency text not null,
      delivery_status text not null,
      status text not null,
      created_by_admin_id text not null,
      created_at text not null,
      updated_at text not null,
      pdf_path text,
      internal_note text,
      visible_note text
    )`,
  );
  await db.execute(
    `create table if not exists admin_purchase_receipt_items (
      id text primary key,
      receipt_record_id text not null,
      product_id text not null,
      card_name text not null,
      card_image text,
      collection_name text,
      quantity integer not null,
      unit_price real not null,
      total_price real not null,
      currency text not null
    )`,
  );
  await db.execute(
    `create table if not exists admin_receipt_audit_logs (
      id text primary key,
      admin_id text not null,
      user_id text,
      receipt_id text not null,
      order_id text not null,
      action text not null,
      amount real not null,
      selected_product_ids text not null,
      card_last4_masked text not null,
      ip_address text,
      user_agent text,
      created_at text not null
    )`,
  );
}

async function writeAudit(input: {
  action: string;
  adminId: string;
  userId: string;
  receiptId: string;
  orderId: string;
  amount: number;
  productIds: string[];
  cardLast4: string;
}) {
  const meta = await getRequestMeta("/api/admin/receipts");
  await getDbClient().execute({
    sql: `insert into admin_receipt_audit_logs (
      id, admin_id, user_id, receipt_id, order_id, action, amount,
      selected_product_ids, card_last4_masked, ip_address, user_agent, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
      input.adminId,
      input.userId,
      input.receiptId,
      input.orderId,
      input.action,
      input.amount,
      JSON.stringify(input.productIds),
      `•••• ${input.cardLast4}`,
      meta.ipAddress,
      meta.userAgent,
      meta.timestamp,
    ],
  });
}

export async function GET() {
  const session = await requireAdminSession("/");
  await ensureReceiptTables();
  const result = await getDbClient().execute({
    sql: `select admin_purchase_receipts.*, users.username
          from admin_purchase_receipts
          left join users on users.id = admin_purchase_receipts.user_id
          order by created_at desc
          limit 50`,
    args: [],
  });
  return NextResponse.json({ ok: true, receipts: result.rows, adminId: session.userId });
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession("/");
    await ensureReceiptTables();
    const payload = (await request.json()) as Record<string, unknown>;
    const userId = safeString(payload.userId);
    const receiptId = safeString(payload.receiptId).toUpperCase();
    const orderId = safeString(payload.orderId).toUpperCase();
    const customerEmail = safeString(payload.customerEmail);
    const cardLast4 = safeString(payload.cardLast4);
    const purchaseDate = safeString(payload.purchaseDate);
    const paymentMethod = safeString(payload.paymentMethodLabel) || "Card";
    const currency = safeString(payload.currency) || "USD";
    const internalNote = safeString(payload.internalNote);
    const visibleNote = safeString(payload.visibleNote);
    const amount = safeMoney(payload.amount);
    const items = Array.isArray(payload.items) ? (payload.items as ReceiptItemInput[]) : [];

    if (!userId || !receiptId || !orderId || !purchaseDate || !customerEmail) {
      return NextResponse.json({ ok: false, error: "Missing required receipt fields." }, { status: 400 });
    }
    if (!/^\d{4}$/.test(cardLast4)) {
      return NextResponse.json({ ok: false, error: "Card last 4 must be exactly 4 digits." }, { status: 400 });
    }
    if (!items.length || amount <= 0) {
      return NextResponse.json({ ok: false, error: "Select at least one priced card." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const recordId = randomUUID();
    const fileName = `receipt-${safeFilePart(receiptId)}-${safeFilePart(orderId)}.pdf`;

    await getDbClient().execute({
      sql: `insert into admin_purchase_receipts (
        id, receipt_id, order_id, user_id, customer_email, purchase_date,
        payment_method, card_last4, amount, currency, delivery_status, status,
        created_by_admin_id, created_at, updated_at, pdf_path, internal_note, visible_note
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(receipt_id) do update set
        order_id = excluded.order_id,
        user_id = excluded.user_id,
        customer_email = excluded.customer_email,
        purchase_date = excluded.purchase_date,
        payment_method = excluded.payment_method,
        card_last4 = excluded.card_last4,
        amount = excluded.amount,
        currency = excluded.currency,
        updated_at = excluded.updated_at,
        pdf_path = excluded.pdf_path,
        internal_note = excluded.internal_note,
        visible_note = excluded.visible_note`,
      args: [
        recordId,
        receiptId,
        orderId,
        userId,
        customerEmail,
        purchaseDate,
        paymentMethod,
        cardLast4,
        amount,
        currency,
        "Delivered to Archive Wallet",
        "generated",
        session.userId,
        now,
        now,
        fileName,
        internalNote || null,
        visibleNote || null,
      ],
    });

    const receiptRow = await getDbClient().execute({
      sql: "select id from admin_purchase_receipts where receipt_id = ?",
      args: [receiptId],
    });
    const receiptRecordId = String(receiptRow.rows[0]?.id ?? recordId);
    await getDbClient().execute({
      sql: "delete from admin_purchase_receipt_items where receipt_record_id = ?",
      args: [receiptRecordId],
    });

    const productIds: string[] = [];
    for (const item of items) {
      const productId = safeString(item.id);
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const unitPrice = safeMoney(item.price);
      if (!productId || unitPrice <= 0) continue;
      productIds.push(productId);
      await getDbClient().execute({
        sql: `insert into admin_purchase_receipt_items (
          id, receipt_record_id, product_id, card_name, card_image, collection_name,
          quantity, unit_price, total_price, currency
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          receiptRecordId,
          productId,
          safeString(item.title),
          safeString(item.imageUrl) || null,
          safeString(item.collection),
          quantity,
          unitPrice,
          Math.round(unitPrice * quantity * 100) / 100,
          safeString(item.currency) || currency,
        ],
      });
    }

    await writeAudit({
      action: "receipt_created",
      adminId: session.userId,
      userId,
      receiptId,
      orderId,
      amount,
      productIds,
      cardLast4,
    });

    return NextResponse.json({ ok: true, id: receiptRecordId, fileName });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create receipt." },
      { status: 400 },
    );
  }
}
