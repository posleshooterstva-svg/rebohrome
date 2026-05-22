import { readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { createHash, randomBytes, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import {
  ADMIN_SEED_PASSWORD,
  ADMIN_SEED_TELEGRAM,
  ADMIN_SEED_USERNAME,
  TELEGRAM_CALLBACK_SECRET,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
} from "@/lib/server-config";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { convertAmount } from "@/lib/currency-service";
import {
  answerTelegramCallbackQuery,
  editTelegramMessage,
  sendTelegramMessage,
  sendTelegramNotification,
  type TelegramReplyMarkup,
  type TelegramUpdate,
} from "@/lib/telegram";
import {
  buildPlaceholderEmail,
  createProductId,
  createReadableId,
  formatCurrency,
  formatUsd,
  formatUtcDateTime,
  getPaletteByRarity,
  isValidTelegramUsername,
  maskCardNumber,
  normalizeTelegramUsername,
  normalizeUsername,
  type BalanceRecord,
  type CheckoutPaymentSessionRecord,
  type CheckoutPaymentSessionStatus,
  type CollectionSummary,
  type CryptoNetwork,
  type DashboardStat,
  type DeliveryType,
  type DepositPaymentSessionRecord,
  type DepositPaymentSessionStatus,
  type DepositRecord,
  type HeaderAccount,
  type MarketplaceFilters,
  type OrderRecord,
  type OrderStatus,
  type PaymentState,
  type PaymentMethodName,
  type PaymentProviderName,
  type ProductInput,
  type ProductRecord,
  type Rarity,
  type SupportedCurrency,
  type TransactionRecord,
  type TelegramSyncStatus,
  type UserRecord,
  type UserRole,
  type UserStatus,
  type WithdrawalActionSource,
  type WithdrawalRecord,
  type WithdrawalStatus,
  type WithdrawalStatusHistoryRecord,
} from "@/lib/rebohrome-data";
import { validateProductImageFile } from "@/lib/product-image";
import {
  buildTransVoucherReturnUrls,
  createTransVoucherPayment,
  getTransVoucherPaymentStatus,
  mapTransVoucherMethod,
} from "@/lib/transvoucher";
import {
  getDbClient,
  getDbRuntimeConfig,
  resetDbClient,
  shouldAutoSeedDatabase,
  shouldAutoSetupDatabase,
} from "./client";
import {
  isSupabaseManagedImageUrl,
  isSupabaseStorageAvailable,
  removeImageFromSupabaseStorage,
  uploadImageToSupabaseStorage,
} from "@/lib/supabase-storage";

type SqlValue = string | number | null;
type DbRow = Record<string, SqlValue>;

let initialized = false;
let initializationPromise: Promise<void> | null = null;

const REQUIRED_TABLES = [
  "users",
  "profiles",
  "balances",
  "sessions",
  "products",
  "orders",
  "payment_sessions",
  "deposit_payment_sessions",
  "order_items",
  "owned_cards",
  "cart_items",
  "transactions",
  "deposits",
  "withdrawal_requests",
  "admin_logs",
  "withdrawal_status_history",
  "telegram_action_tokens",
  "telegram_runtime_state",
  "notifications",
  "security_audit_events",
] as const;

type SecurityAuditEventType =
  | "users_page_visit"
  | "user_registered"
  | "user_login"
  | "transvoucher_invalid_signature";

type SecurityAuditEventInput = {
  eventType: SecurityAuditEventType;
  userId?: string | null;
  username?: string | null;
  telegramUsername?: string | null;
  role?: string | null;
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  route: string;
  timestamp: string;
};

let missingSecurityTelegramWarningLogged = false;

function nowIso() {
  return new Date().toISOString();
}

function isFinalWithdrawalStatus(status: WithdrawalStatus) {
  return status === "completed" || status === "declined";
}

function canTransitionWithdrawalStatus(
  from: WithdrawalStatus,
  to: WithdrawalStatus,
) {
  const transitions: Record<WithdrawalStatus, WithdrawalStatus[]> = {
    pending: ["approved", "declined"],
    approved: ["processing"],
    processing: ["completed"],
    completed: [],
    declined: [],
  };

  return transitions[from].includes(to);
}

function asBoolean(value: SqlValue) {
  return Number(value ?? 0) === 1;
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createSessionToken() {
  return randomBytes(32).toString("hex");
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toJson(value: unknown) {
  return JSON.stringify(value);
}

function escapeTelegramHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateForTelegram(value: string | null | undefined, limit = 220) {
  const next = String(value ?? "");
  return next.length > limit ? `${next.slice(0, limit - 1)}…` : next;
}

function getSecurityFieldValue(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : "Unknown";
}

function fromJson<T>(value: SqlValue) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  return JSON.parse(value) as T;
}

function normalizeProduct(row: DbRow): ProductRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    rarity: row.rarity as Rarity,
    price: Number(row.price),
    currency: row.currency ? (String(row.currency) as SupportedCurrency) : "USD",
    stock: Number(row.stock),
    collection: String(row.collection),
    category: String(row.category),
    description: String(row.description),
    tagline: String(row.tagline),
    defaultDeliveryType: row.default_delivery_type
      ? (String(row.default_delivery_type) as DeliveryType)
      : "digital",
    deliveryDigital: String(row.delivery_digital),
    deliveryPhysical: String(row.delivery_physical),
    edition: String(row.edition),
    shape: String(row.shape) as ProductRecord["shape"],
    imageUrl: row.image_url ? String(row.image_url) : null,
    imagePath: row.image_path ? String(row.image_path) : null,
    imageUpdatedAt: row.image_updated_at ? String(row.image_updated_at) : null,
    featured: asBoolean(row.featured ?? 0),
    homepageFeatured: asBoolean(row.homepage_featured ?? 0),
    featuredStartedAt: row.featured_started_at ? String(row.featured_started_at) : null,
    status: row.status ? (String(row.status) as ProductRecord["status"]) : "active",
    archived: asBoolean(row.archived ?? 0),
    palette: {
      glow: String(row.palette_glow),
      glowSoft: String(row.palette_glow_soft),
      core: String(row.palette_core),
      ring: String(row.palette_ring),
    },
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeUser(row: DbRow): UserRecord {
  return {
    id: String(row.id),
    username: String(row.username),
    email: String(row.email),
    name: String(row.name),
    role: String(row.role) as UserRecord["role"],
    status: String(row.status) as UserRecord["status"],
    telegramUsername: String(row.telegram_username),
    telegramId: row.telegram_id ? String(row.telegram_id) : null,
    withdrawalWallet: row.withdrawal_wallet ? String(row.withdrawal_wallet) : null,
    verified: asBoolean(row.verified ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
  };
}

function normalizeBalance(row: DbRow): BalanceRecord {
  return {
    userId: String(row.user_id),
    available: Number(row.available),
    pendingWithdrawal: Number(row.pending_withdrawal),
    totalDeposited: Number(row.total_deposited),
    totalSpent: Number(row.total_spent),
    totalWithdrawn: Number(row.total_withdrawn),
    updatedAt: String(row.updated_at),
  };
}

function normalizeOrder(row: DbRow): OrderRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    status: String(row.status) as OrderStatus,
    paymentState: String(row.payment_state) as PaymentState,
    subtotal: Number(row.subtotal),
    shipping: Number(row.shipping),
    total: Number(row.total),
    currency: row.currency ? (String(row.currency) as SupportedCurrency) : "USD",
    paymentProvider: row.payment_provider ? String(row.payment_provider) : null,
    transvoucherTransactionId: row.transvoucher_transaction_id
      ? String(row.transvoucher_transaction_id)
      : null,
    transvoucherReferenceId: row.transvoucher_reference_id
      ? String(row.transvoucher_reference_id)
      : null,
    providerStatus: row.provider_status ? String(row.provider_status) : null,
    shippingName: String(row.shipping_name),
    shippingEmail: String(row.shipping_email),
    shippingAddress: String(row.shipping_address),
    shippingCity: String(row.shipping_city),
    shippingPostalCode: String(row.shipping_postal_code),
    paymentMethod: String(row.payment_method),
    failureReason: row.failure_reason ? String(row.failure_reason) : null,
    remainingBalance:
      row.remaining_balance === null ? null : Number(row.remaining_balance),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    paidAt: row.paid_at ? String(row.paid_at) : null,
    itemCount: row.item_count === null ? undefined : Number(row.item_count),
  };
}

function normalizeTransaction(row: DbRow): TransactionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    kind: String(row.kind) as TransactionRecord["kind"],
    amount: Number(row.amount),
    originalAmount:
      row.original_amount === null || row.original_amount === undefined
        ? null
        : Number(row.original_amount),
    originalCurrency: row.original_currency
      ? (String(row.original_currency) as SupportedCurrency)
      : null,
    displayCurrency: row.display_currency
      ? (String(row.display_currency) as SupportedCurrency)
      : null,
    creditedAmountUsd:
      row.credited_amount_usd === null || row.credited_amount_usd === undefined
        ? null
        : Number(row.credited_amount_usd),
    exchangeRate:
      row.exchange_rate === null || row.exchange_rate === undefined
        ? null
        : Number(row.exchange_rate),
    paymentMethod: row.payment_method ? String(row.payment_method) : null,
    paymentProvider: row.payment_provider ? String(row.payment_provider) : null,
    transvoucherTransactionId: row.transvoucher_transaction_id
      ? String(row.transvoucher_transaction_id)
      : null,
    transvoucherReferenceId: row.transvoucher_reference_id
      ? String(row.transvoucher_reference_id)
      : null,
    paymentUrl: row.payment_url ? String(row.payment_url) : null,
    providerStatus: row.provider_status ? String(row.provider_status) : null,
    rawProviderResponse: row.raw_provider_response
      ? String(row.raw_provider_response)
      : null,
    status: String(row.status) as TransactionRecord["status"],
    referenceId: String(row.reference_id),
    summary: String(row.summary),
    metaJson: row.meta_json ? String(row.meta_json) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    paidAt: row.paid_at ? String(row.paid_at) : null,
  };
}

function normalizeDeposit(row: DbRow): DepositRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    amount: Number(row.amount),
    originalAmount:
      row.original_amount === null || row.original_amount === undefined
        ? null
        : Number(row.original_amount),
    originalCurrency: row.original_currency
      ? (String(row.original_currency) as SupportedCurrency)
      : null,
    creditedAmountUsd:
      row.credited_amount_usd === null || row.credited_amount_usd === undefined
        ? null
        : Number(row.credited_amount_usd),
    exchangeRate:
      row.exchange_rate === null || row.exchange_rate === undefined
        ? null
        : Number(row.exchange_rate),
    paymentMethod: String(row.payment_method),
    paymentProvider: row.payment_provider ? String(row.payment_provider) : null,
    transvoucherTransactionId: row.transvoucher_transaction_id
      ? String(row.transvoucher_transaction_id)
      : null,
    transvoucherReferenceId: row.transvoucher_reference_id
      ? String(row.transvoucher_reference_id)
      : null,
    cardholderName: String(row.cardholder_name),
    cardMasked: String(row.card_masked),
    status: String(row.status) as DepositRecord["status"],
    balanceBefore: Number(row.balance_before),
    balanceAfter: Number(row.balance_after),
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    paidAt: row.paid_at ? String(row.paid_at) : null,
  };
}

function normalizeWithdrawal(row: DbRow): WithdrawalRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    amount: Number(row.amount),
    walletAddress: String(row.wallet_address),
    telegramId: String(row.telegram_id),
    status: String(row.status) as WithdrawalRecord["status"],
    sourceDepositId: row.source_deposit_id ? String(row.source_deposit_id) : null,
    sourceCardMasked: row.source_card_masked ? String(row.source_card_masked) : null,
    sourceCardholderName: row.source_cardholder_name
      ? String(row.source_cardholder_name)
      : null,
    adminNote: row.admin_note ? String(row.admin_note) : null,
    telegramChatId: row.telegram_chat_id ? String(row.telegram_chat_id) : null,
    telegramMessageId: row.telegram_message_id ? String(row.telegram_message_id) : null,
    telegramSyncStatus: row.telegram_sync_status
      ? (String(row.telegram_sync_status) as TelegramSyncStatus)
      : "pending",
    telegramSyncedAt: row.telegram_synced_at ? String(row.telegram_synced_at) : null,
    telegramLastError: row.telegram_last_error ? String(row.telegram_last_error) : null,
    lastActionSource: row.last_action_source
      ? (String(row.last_action_source) as WithdrawalActionSource)
      : "system",
    lastUpdatedByAdminId: row.last_updated_by_admin_id
      ? String(row.last_updated_by_admin_id)
      : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeWithdrawalHistory(row: DbRow): WithdrawalStatusHistoryRecord {
  return {
    id: String(row.id),
    withdrawalId: String(row.withdrawal_id),
    actionType: String(row.action_type),
    previousStatus: row.previous_status
      ? (String(row.previous_status) as WithdrawalStatus)
      : null,
    nextStatus: String(row.next_status) as WithdrawalStatus,
    source: String(row.source) as WithdrawalActionSource,
    adminUserId: row.admin_user_id ? String(row.admin_user_id) : null,
    adminUsername: row.admin_username ? String(row.admin_username) : null,
    adminTelegramUsername: row.admin_telegram_username
      ? String(row.admin_telegram_username)
      : null,
    note: row.note ? String(row.note) : null,
    createdAt: String(row.created_at),
  };
}

function normalizeCheckoutPaymentSession(
  row: DbRow,
): CheckoutPaymentSessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    paymentMethod: String(row.payment_method) as PaymentMethodName,
    paymentProvider: String(row.payment_provider) as PaymentProviderName,
    currency: String(row.currency) as SupportedCurrency,
    subtotal: Number(row.subtotal),
    shipping: Number(row.shipping),
    total: Number(row.total),
    status: String(row.status) as CheckoutPaymentSessionStatus,
    itemsJson: String(row.items_json),
    metaJson: row.meta_json ? String(row.meta_json) : null,
    orderId: row.order_id ? String(row.order_id) : null,
    transactionId: row.transaction_id ? String(row.transaction_id) : null,
    transvoucherTransactionId: row.transvoucher_transaction_id
      ? String(row.transvoucher_transaction_id)
      : null,
    transvoucherReferenceId: row.transvoucher_reference_id
      ? String(row.transvoucher_reference_id)
      : null,
    paymentUrl: row.payment_url ? String(row.payment_url) : null,
    providerStatus: row.provider_status ? String(row.provider_status) : null,
    rawProviderResponse: row.raw_provider_response
      ? String(row.raw_provider_response)
      : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    expiresAt: String(row.expires_at),
  };
}

function normalizeDepositPaymentSession(
  row: DbRow,
): DepositPaymentSessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    paymentMethod: String(row.payment_method) as PaymentMethodName,
    paymentProvider: String(row.payment_provider) as PaymentProviderName,
    currency: String(row.currency) as SupportedCurrency,
    originalAmount: Number(row.original_amount),
    creditedAmountUsd: Number(row.credited_amount_usd),
    exchangeRate: Number(row.exchange_rate),
    status: String(row.status) as DepositPaymentSessionStatus,
    metaJson: row.meta_json ? String(row.meta_json) : null,
    depositId: row.deposit_id ? String(row.deposit_id) : null,
    transactionId: row.transaction_id ? String(row.transaction_id) : null,
    transvoucherTransactionId: row.transvoucher_transaction_id
      ? String(row.transvoucher_transaction_id)
      : null,
    transvoucherReferenceId: row.transvoucher_reference_id
      ? String(row.transvoucher_reference_id)
      : null,
    paymentUrl: row.payment_url ? String(row.payment_url) : null,
    providerStatus: row.provider_status ? String(row.provider_status) : null,
    rawProviderResponse: row.raw_provider_response
      ? String(row.raw_provider_response)
      : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    expiresAt: String(row.expires_at),
  };
}

async function loadSeedProducts() {
  const seedPath = path.join(process.cwd(), "data", "seeds", "products.json");
  const file = await readFile(seedPath, "utf8");
  return JSON.parse(file) as ProductInput[];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorFingerprint(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }

  const errorRecord = error as Record<string, unknown>;
  const message =
    typeof errorRecord.message === "string" ? errorRecord.message : "";
  const code = typeof errorRecord.code === "string" ? errorRecord.code : "";
  const cause = "cause" in errorRecord ? getErrorFingerprint(errorRecord.cause) : "";

  return `${message} ${code} ${cause}`.toLowerCase();
}

function isTransientDatabaseError(error: unknown) {
  const fingerprint = getErrorFingerprint(error);

  return [
    "fetch failed",
    "econnreset",
    "etimedout",
    "socket hang up",
    "networkerror",
    "temporarily unavailable",
    "connection reset",
    "connection closed",
  ].some((marker) => fingerprint.includes(marker));
}

async function execute(sql: string, args: SqlValue[] = []) {
  const runtime = getDbRuntimeConfig();
  const maxAttempts = runtime.usingExternalDatabase ? 3 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await getDbClient().execute({ sql, args });
    } catch (error) {
      const shouldRetry =
        runtime.usingExternalDatabase &&
        attempt < maxAttempts &&
        isTransientDatabaseError(error);

      if (!shouldRetry) {
        throw error;
      }

      resetDbClient();
      await delay(160 * attempt);
    }
  }

  throw new Error("Database request failed after exhausting retry attempts.");
}

async function queryOne(sql: string, args: SqlValue[] = []) {
  const result = await execute(sql, args);
  return (result.rows[0] ?? null) as DbRow | null;
}

async function queryMany(sql: string, args: SqlValue[] = []) {
  const result = await execute(sql, args);
  return result.rows as DbRow[];
}

async function ensureColumn(table: string, definition: string) {
  try {
    await execute(`alter table ${table} add column ${definition}`);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (
      message.includes("duplicate column name") ||
      message.includes("already exists")
    ) {
      return;
    }

    throw error;
  }
}

async function insertSecurityAuditEvent(input: SecurityAuditEventInput) {
  await execute(
    `insert into security_audit_events (
      id, event_type, user_id, username, telegram_username, role, ip_address,
      country, user_agent, language, route, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.eventType,
      input.userId ?? null,
      input.username ?? null,
      input.telegramUsername ?? null,
      input.role ?? null,
      input.ipAddress,
      input.country,
      input.userAgent,
      input.language,
      input.route,
      input.timestamp,
    ],
  );
}

async function hasRecentSecurityAuditEvent(input: {
  eventType: SecurityAuditEventType;
  username?: string | null;
  ipAddress: string;
  route?: string | null;
  since: string;
}) {
  const row = await queryOne(
    `select id from security_audit_events
     where event_type = ?
       and coalesce(username, '') = ?
       and ip_address = ?
       and coalesce(route, '') = ?
       and created_at >= ?
     order by created_at desc
     limit 1`,
    [
      input.eventType,
      input.username ?? "",
      input.ipAddress,
      input.route ?? "",
      input.since,
    ],
  );

  return Boolean(row);
}

async function assertDatabaseReady() {
  const rows = await queryMany(
    `select name from sqlite_master
     where type = 'table'
       and name in (${REQUIRED_TABLES.map(() => "?").join(", ")})`,
    [...REQUIRED_TABLES],
  );

  const existingTables = new Set(rows.map((row) => String(row.name)));
  const missingTables = REQUIRED_TABLES.filter(
    (tableName) => !existingTables.has(tableName),
  );

  if (missingTables.length === 0) {
    return;
  }

  const config = getDbRuntimeConfig();
  throw new Error(
    `Database schema is not initialized for ${config.source}. Missing tables: ${missingTables.join(
      ", ",
    )}. Run "npm run db:setup" before starting the app, and use "npm run db:seed" if you also need the initial catalog and admin account.`,
  );
}

async function seedProductsIfEmpty() {
  const row = await queryOne("select count(*) as count from products");

  if (Number(row?.count ?? 0) > 0) {
    return;
  }

  const timestamp = nowIso();
  const seeds = await loadSeedProducts();

  for (const product of seeds) {
    await execute(
      `insert into products (
        id, title, rarity, price, currency, stock, collection, category, description, tagline,
        default_delivery_type, delivery_digital, delivery_physical, edition, shape,
        image_url, featured, homepage_featured, featured_started_at, showcase_float,
        showcase_rotation_seconds, status, archived, palette_glow, palette_glow_soft,
        palette_core, palette_ring, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.id,
        product.title,
        product.rarity,
        product.price,
        product.currency,
        product.stock,
        product.collection,
        product.category,
        product.description,
        product.tagline,
        product.defaultDeliveryType,
        product.deliveryDigital,
        product.deliveryPhysical,
        product.edition,
        product.shape,
        product.imageUrl,
        product.featured ? 1 : 0,
        product.homepageFeatured ? 1 : 0,
        product.homepageFeatured ? timestamp : null,
        1,
        12,
        product.status,
        0,
        product.palette.glow,
        product.palette.glowSoft,
        product.palette.core,
        product.palette.ring,
        timestamp,
        timestamp,
      ],
    );
  }
}

async function seedAdminAccount() {
  const username = normalizeUsername(ADMIN_SEED_USERNAME);
  const existing = await queryOne(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.withdrawal_wallet, profiles.verified
     from users
     inner join profiles on profiles.user_id = users.id
     where users.username = ?
     limit 1`,
    [username],
  );

  if (existing) {
    return;
  }

  const timestamp = nowIso();
  const userId = randomUUID();
  const passwordHash = hashPassword(ADMIN_SEED_PASSWORD);

  await execute(
    `insert into users (
      id, username, email, name, password_hash, status, created_at, updated_at, last_login_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      username,
      buildPlaceholderEmail(username),
      "Archive Admin",
      passwordHash,
      "active",
      timestamp,
      timestamp,
      null,
    ],
  );

  await execute(
    `insert into profiles (
      user_id, role, telegram_username, telegram_id, withdrawal_wallet, verified, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, "admin", normalizeTelegramUsername(ADMIN_SEED_TELEGRAM), null, null, 1, timestamp, timestamp],
  );

  await execute(
    `insert into balances (
      user_id, available, pending_withdrawal, total_deposited, total_spent, total_withdrawn, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?)`,
    [userId, 0, 0, 0, 0, 0, timestamp],
  );
}

async function logAdminAction(
  adminUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  message: string,
  options?: {
    source?: WithdrawalActionSource;
    previousStatus?: WithdrawalStatus | null;
    nextStatus?: WithdrawalStatus | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  await execute(
    `insert into admin_logs (
      id, admin_user_id, action, entity_type, entity_id, message,
      source, previous_status, next_status, metadata_json, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      adminUserId,
      action,
      entityType,
      entityId,
      message,
      options?.source ?? "dashboard",
      options?.previousStatus ?? null,
      options?.nextStatus ?? null,
      options?.metadata ? toJson(options.metadata) : null,
      nowIso(),
    ],
  );
}

async function insertWithdrawalHistory(input: {
  withdrawalId: string;
  actionType: string;
  previousStatus: WithdrawalStatus | null;
  nextStatus: WithdrawalStatus;
  source: WithdrawalActionSource;
  adminUserId?: string | null;
  adminUsername?: string | null;
  adminTelegramUsername?: string | null;
  note?: string | null;
}) {
  await execute(
    `insert into withdrawal_status_history (
      id, withdrawal_id, action_type, previous_status, next_status, source,
      admin_user_id, admin_username, admin_telegram_username, note, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.withdrawalId,
      input.actionType,
      input.previousStatus ?? null,
      input.nextStatus,
      input.source,
      input.adminUserId ?? null,
      input.adminUsername ?? null,
      input.adminTelegramUsername ?? null,
      input.note ?? null,
      nowIso(),
    ],
  );
}

async function getUserRowById(userId: string) {
  return queryOne(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.withdrawal_wallet, profiles.verified
     from users
     inner join profiles on profiles.user_id = users.id
     where users.id = ?
     limit 1`,
    [userId],
  );
}

async function getUserRowByTelegramUsername(telegramUsername: string) {
  return queryOne(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.withdrawal_wallet, profiles.verified
     from users
     inner join profiles on profiles.user_id = users.id
     where profiles.telegram_username = ?
     limit 1`,
    [normalizeTelegramUsername(telegramUsername)],
  );
}

async function getBalanceRowByUserId(userId: string) {
  return queryOne("select * from balances where user_id = ? limit 1", [userId]);
}

async function getLatestCompletedDeposit(userId: string) {
  const row = await queryOne(
    "select * from deposits where user_id = ? and status = 'completed' order by created_at desc limit 1",
    [userId],
  );

  return row ? normalizeDeposit(row) : null;
}

async function getUserAndBalance(userId: string) {
  const [userRow, balanceRow] = await Promise.all([
    getUserRowById(userId),
    getBalanceRowByUserId(userId),
  ]);

  if (!userRow || !balanceRow) {
    return null;
  }

  return {
    user: normalizeUser(userRow),
    balance: normalizeBalance(balanceRow),
  } satisfies HeaderAccount;
}

async function createTransactionRecord(input: {
  id?: string;
  userId: string;
  kind: TransactionRecord["kind"];
  amount: number;
  originalAmount?: number | null;
  originalCurrency?: SupportedCurrency | null;
  displayCurrency?: SupportedCurrency | null;
  creditedAmountUsd?: number | null;
  exchangeRate?: number | null;
  paymentMethod?: string | null;
  paymentProvider?: string | null;
  transvoucherTransactionId?: string | null;
  transvoucherReferenceId?: string | null;
  paymentUrl?: string | null;
  providerStatus?: string | null;
  rawProviderResponse?: string | null;
  status: TransactionRecord["status"];
  referenceId: string;
  summary: string;
  meta?: Record<string, unknown> | null;
  paidAt?: string | null;
}) {
  const id = input.id ?? createReadableId("TXN");
  const timestamp = nowIso();

  await execute(
    `insert into transactions (
      id, user_id, kind, amount, original_amount, original_currency, display_currency,
      credited_amount_usd, exchange_rate, payment_method, payment_provider,
      transvoucher_transaction_id, transvoucher_reference_id, payment_url,
      provider_status, raw_provider_response, status, reference_id, summary,
      meta_json, created_at, updated_at, paid_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [
      id,
      input.userId,
      input.kind,
      input.amount,
      input.originalAmount ?? null,
      input.originalCurrency ?? null,
      input.displayCurrency ?? null,
      input.creditedAmountUsd ?? null,
      input.exchangeRate ?? null,
      input.paymentMethod ?? null,
      input.paymentProvider ?? null,
      input.transvoucherTransactionId ?? null,
      input.transvoucherReferenceId ?? null,
      input.paymentUrl ?? null,
      input.providerStatus ?? null,
      input.rawProviderResponse ?? null,
      input.status,
      input.referenceId,
      input.summary,
      input.meta ? toJson(input.meta) : null,
      timestamp,
      timestamp,
      input.paidAt ?? null,
    ],
  );

  return id;
}

function getPaymentReference(input: {
  paymentMethod: PaymentMethodName | string;
  cardNumber?: string;
  cryptoNetwork?: CryptoNetwork | string | null;
}) {
  if (input.cardNumber?.trim()) {
    return maskCardNumber(input.cardNumber);
  }

  if (input.paymentMethod === "Crypto") {
    return `${input.cryptoNetwork ?? "Wallet"} settlement`;
  }

  if (input.paymentMethod === "Apple Pay" || input.paymentMethod === "Google Pay") {
    return "Tokenized wallet session";
  }

  if (input.paymentMethod === "Archive Balance") {
    return "Archive balance settlement";
  }

  return "Secure payment session";
}

function getDisplayAmountLabel(input: {
  amount: number;
  currency: SupportedCurrency;
  creditedAmountUsd?: number | null;
}) {
  if (input.currency === "USD") {
    return formatUsd(input.amount);
  }

  if (input.creditedAmountUsd === null || input.creditedAmountUsd === undefined) {
    return formatCurrency(input.amount, input.currency);
  }

  return `${formatCurrency(input.amount, input.currency)} credited as ${formatUsd(
    input.creditedAmountUsd,
  )}`;
}

const CHECKOUT_PAYMENT_SESSION_TTL_MINUTES = 30;

type CheckoutSessionLine = {
  productId: string;
  quantity: number;
  deliveryType: DeliveryType;
};

async function resolveCheckoutProducts(
  items: CheckoutSessionLine[],
) {
  if (items.length === 0) {
    throw new Error("Cart is empty.");
  }

  const quantityByProduct = new Map<string, number>();
  for (const item of items) {
    quantityByProduct.set(
      item.productId,
      (quantityByProduct.get(item.productId) ?? 0) + item.quantity,
    );
  }

  const productIds = [...quantityByProduct.keys()];
  const placeholders = productIds.map(() => "?").join(", ");
  const productRows = await queryMany(
    `select * from products where id in (${placeholders}) and archived = 0`,
    productIds,
  );
  const productMap = new Map(
    productRows.map((row) => {
      const product = normalizeProduct(row);
      return [product.id, product];
    }),
  );

  for (const [productId, quantity] of quantityByProduct.entries()) {
    const product = productMap.get(productId);

    if (!product) {
      throw new Error("One or more selected products are no longer available.");
    }

    if (product.stock < quantity) {
      throw new Error(`${product.title} no longer has enough stock.`);
    }
  }

  return { productMap, productIds };
}

function calculateCheckoutTotals(
  items: CheckoutSessionLine[],
  productMap: Map<string, ProductRecord>,
) {
  let subtotal = 0;

  for (const item of items) {
    subtotal += (productMap.get(item.productId)?.price ?? 0) * item.quantity;
  }

  const shipping = items.some((item) => item.deliveryType === "physical")
    ? 18
    : 0;

  return {
    subtotal,
    shipping,
    total: subtotal + shipping,
  };
}

function parseCheckoutSessionItems(itemsJson: string) {
  return JSON.parse(itemsJson) as CheckoutSessionLine[];
}

function normalizeProviderStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function mapProviderStatusToTransactionStatus(
  status: string,
): TransactionRecord["status"] {
  const normalized = normalizeProviderStatus(status);

  if (normalized === "attempting") {
    return "attempting";
  }

  if (normalized === "processing") {
    return "processing";
  }

  if (
    normalized === "succeeded" ||
    normalized === "completed" ||
    normalized === "paid" ||
    normalized === "success"
  ) {
    return "completed";
  }

  if (
    normalized === "failed" ||
    normalized === "declined" ||
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "expired"
  ) {
    return "failed";
  }

  return "pending";
}

function mapProviderStatusToCheckoutSessionStatus(
  status: string,
): CheckoutPaymentSessionStatus {
  const normalized = normalizeProviderStatus(status);

  if (normalized === "attempting") {
    return "attempting";
  }

  if (normalized === "processing") {
    return "processing";
  }

  if (
    normalized === "succeeded" ||
    normalized === "completed" ||
    normalized === "paid" ||
    normalized === "success"
  ) {
    return "completed";
  }

  if (
    normalized === "failed" ||
    normalized === "declined" ||
    normalized === "cancelled" ||
    normalized === "canceled"
  ) {
    return "failed";
  }

  if (normalized === "expired") {
    return "expired";
  }

  return "pending";
}

function mapProviderStatusToDepositSessionStatus(
  status: string,
): DepositPaymentSessionStatus {
  const normalized = normalizeProviderStatus(status);

  if (normalized === "attempting") {
    return "attempting";
  }

  if (normalized === "processing") {
    return "processing";
  }

  if (
    normalized === "succeeded" ||
    normalized === "completed" ||
    normalized === "paid" ||
    normalized === "success"
  ) {
    return "completed";
  }

  if (
    normalized === "failed" ||
    normalized === "declined" ||
    normalized === "cancelled" ||
    normalized === "canceled"
  ) {
    return "failed";
  }

  if (normalized === "expired") {
    return "expired";
  }

  return "pending";
}

function isProviderCompletedStatus(status: string) {
  return mapProviderStatusToTransactionStatus(status) === "completed";
}

function isProviderFailedStatus(status: string) {
  return mapProviderStatusToTransactionStatus(status) === "failed";
}

function buildTransVoucherPaymentReference(input: {
  referenceId?: string | null;
  transactionId?: string | null;
}) {
  return input.referenceId?.trim() || input.transactionId?.trim() || "TransVoucher session";
}

function getTransactionMeta(record: TransactionRecord | null) {
  return record?.metaJson ? fromJson<Record<string, unknown>>(record.metaJson) ?? {} : {};
}

function extractProviderFailureReason(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const directFields = [
    "failure_reason",
    "failureReason",
    "reason",
    "message",
    "error",
  ];

  for (const field of directFields) {
    if (typeof record[field] === "string" && record[field].trim()) {
      return String(record[field]).trim();
    }
  }

  const nestedCandidates = [record.data, record.result, record.payment, record.payment_intent];
  for (const candidate of nestedCandidates) {
    const nested = extractProviderFailureReason(candidate);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function formatTelegramTimestamp(value: string) {
  return `${formatUtcDateTime(value)} UTC`;
}

function formatCleanOperationalWithdrawalStatus(status: WithdrawalStatus) {
  switch (status) {
    case "pending":
      return "🟡 PENDING";
    case "approved":
      return "🟣 APPROVED";
    case "processing":
      return "🔵 PROCESSING";
    case "completed":
      return "🟢 COMPLETED";
    case "declined":
      return "🔴 DECLINED";
    default:
      return String(status).toUpperCase();
  }
}

function getWithdrawalStatusIndicator(status: WithdrawalStatus) {
  switch (status) {
    case "pending":
      return "🟡 PENDING";
    case "approved":
      return "🟣 APPROVED";
    case "processing":
      return "🔵 PROCESSING";
    case "completed":
      return "🟢 COMPLETED";
    case "declined":
      return "🔴 DECLINED";
    default:
      return String(status).toUpperCase();
  }
}

function formatOperationalWithdrawalStatus(status: WithdrawalStatus) {
  switch (status) {
    case "pending":
      return "🟡 PENDING";
    case "approved":
      return "🟣 APPROVED";
    case "processing":
      return "🔵 PROCESSING";
    case "completed":
      return "🟢 COMPLETED";
    case "declined":
      return "🔴 DECLINED";
    default:
      return String(status).toUpperCase();
  }
}

const legacyWithdrawalStatusFormatters = [
  getWithdrawalStatusIndicator,
  formatOperationalWithdrawalStatus,
];
void legacyWithdrawalStatusFormatters;

function buildTelegramKeyboard(buttons: Array<{ text: string; callbackData: string }>) {
  const rows: TelegramReplyMarkup["inline_keyboard"] = [];

  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(
      buttons.slice(index, index + 2).map((button) => ({
        text: button.text,
        callback_data: button.callbackData,
      })),
    );
  }

  return { inline_keyboard: rows };
}

function buildTelegramFailureMessage(input: {
  title: string;
  username: string;
  telegramUsername: string;
  amount: number;
  currency: SupportedCurrency;
  paymentMethod: string;
  reason: string;
  referenceId: string;
  transactionId?: string | null;
  providerReferenceId?: string | null;
  timestamp: string;
}) {
  return [
    `<b>${input.title}</b>`,
    "",
    `Username: ${input.username}`,
    `Telegram: ${input.telegramUsername}`,
    "",
    `Attempted Amount: ${formatCurrency(input.amount, input.currency)}`,
    `Payment Method: ${input.paymentMethod}`,
    "",
    "Failure Reason:",
    input.reason,
    "",
    "Order ID:",
    input.referenceId,
    ...(input.transactionId ? ["", "Transaction ID:", input.transactionId] : []),
    ...(input.providerReferenceId ? ["", "Reference ID:", input.providerReferenceId] : []),
    "",
    "Timestamp:",
    formatTelegramTimestamp(input.timestamp),
  ].join("\n");
}

function buildWithdrawalTelegramMessage(input: {
  username: string;
  telegramUsername: string;
  telegramId: string;
  walletAddress: string;
  amount: number;
  requestId: string;
  status: WithdrawalStatus;
  updatedAt: string;
  updatedBy: string;
  sourceDepositId: string | null;
  sourceCardMasked: string | null;
  sourceCardholderName: string | null;
  syncStatus: TelegramSyncStatus;
}) {
  return [
    "<b>Withdrawal Request</b>",
    "",
    `User: ${input.telegramUsername}`,
    `Username: ${input.username}`,
    `Telegram ID: ${input.telegramId}`,
    `Wallet: <code>${input.walletAddress}</code>`,
    `Amount: ${formatUsd(input.amount)}`,
    `Request ID: ${input.requestId}`,
    "",
    "Current Status:",
    formatCleanOperationalWithdrawalStatus(input.status),
    "",
    "Updated By:",
    input.updatedBy,
    "",
    "Updated At:",
    formatTelegramTimestamp(input.updatedAt),
    "",
    "Funding Trail:",
    `Deposit ID: ${input.sourceDepositId ?? "N/A"}`,
    `Card: ${input.sourceCardMasked ?? "N/A"}`,
    `Cardholder: ${input.sourceCardholderName ?? "N/A"}`,
    "",
    `Telegram Sync: ${input.syncStatus.toUpperCase()}`,
  ].join("\n");
}

async function sendDepositNotification(params: {
  username: string;
  telegramUsername: string;
  depositId: string;
  originalAmount: number;
  originalCurrency: SupportedCurrency;
  creditedAmountUsd: number;
  exchangeRate: number;
  paymentMethod: string;
  provider: string;
  transactionId?: string | null;
  referenceId?: string | null;
  timestamp: string;
}) {
  await sendTelegramNotification(
    [
      "<b>New Deposit Completed</b>",
      "",
      `User: ${params.telegramUsername}`,
      `Username: ${params.username}`,
      `Paid: ${getDisplayAmountLabel({
        amount: params.originalAmount,
        currency: params.originalCurrency,
      })}`,
      `Credited: ${formatUsd(params.creditedAmountUsd)}`,
      `Rate: 1 ${params.originalCurrency} = ${params.exchangeRate.toFixed(2)} USD`,
      `Provider: ${params.provider}`,
      `Method: ${params.paymentMethod}`,
      `Deposit ID: ${params.depositId}`,
      params.transactionId ? `Transaction ID: ${params.transactionId}` : null,
      params.referenceId ? `Reference ID: ${params.referenceId}` : null,
      "------------------",
      `Timestamp: ${formatTelegramTimestamp(params.timestamp)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function sendPurchaseNotification(params: {
  username: string;
  telegramUsername: string;
  orderId: string;
  total: number;
  currency: SupportedCurrency;
  paymentMethod: string;
  provider: string;
  transactionId?: string | null;
  referenceId?: string | null;
  items: Array<{ title: string; quantity: number }>;
  timestamp: string;
}) {
  const lines = params.items.map((item) => `- ${item.title} x${item.quantity}`);

  await sendTelegramNotification(
    [
      "<b>New Card Purchase</b>",
      "",
      `User: ${params.telegramUsername}`,
      `Username: ${params.username}`,
      `Method: ${params.paymentMethod}`,
      `Provider: ${params.provider}`,
      `Order ID: ${params.orderId}`,
      params.transactionId ? `Transaction ID: ${params.transactionId}` : null,
      params.referenceId ? `Reference ID: ${params.referenceId}` : null,
      "",
      "Purchased:",
      ...lines,
      "",
      `Total: ${formatCurrency(params.total, params.currency)}`,
      "------------------",
      `Timestamp: ${formatTelegramTimestamp(params.timestamp)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function sendDepositFailureNotification(params: {
  username: string;
  telegramUsername: string;
  depositId: string;
  amount: number;
  currency: SupportedCurrency;
  paymentMethod: string;
  provider?: string | null;
  transactionId?: string | null;
  referenceId?: string | null;
  reason: string;
  timestamp: string;
}) {
  await sendTelegramNotification(
    buildTelegramFailureMessage({
      title: "Payment Failed",
      username: params.username,
      telegramUsername: params.telegramUsername,
      amount: params.amount,
      currency: params.currency,
      paymentMethod: params.provider
        ? `${params.paymentMethod} · ${params.provider}`
        : params.paymentMethod,
      reason: params.reason,
      referenceId: params.depositId,
      timestamp: params.timestamp,
      transactionId: params.transactionId,
      providerReferenceId: params.referenceId,
    }),
  );
}

async function sendPurchaseFailureNotification(params: {
  username: string;
  telegramUsername: string;
  orderId: string;
  amount: number;
  currency: SupportedCurrency;
  paymentMethod: string;
  provider?: string | null;
  transactionId?: string | null;
  referenceId?: string | null;
  reason: string;
  timestamp: string;
}) {
  await sendTelegramNotification(
    buildTelegramFailureMessage({
      title: "Payment Failed",
      username: params.username,
      telegramUsername: params.telegramUsername,
      amount: params.amount,
      currency: params.currency,
      paymentMethod: params.provider
        ? `${params.paymentMethod} · ${params.provider}`
        : params.paymentMethod,
      reason: params.reason,
      referenceId: params.orderId,
      timestamp: params.timestamp,
      transactionId: params.transactionId,
      providerReferenceId: params.referenceId,
    }),
  );
}

async function sendWithdrawalFailureNotification(params: {
  username: string;
  telegramUsername: string;
  amount: number;
  walletAddress: string;
  requestId: string;
  reason: string;
  timestamp: string;
}) {
  await sendTelegramNotification(
    [
      "<b>Withdrawal Rejected</b>",
      "",
      `Username: ${params.username}`,
      `Telegram: ${params.telegramUsername}`,
      "",
      "Amount:",
      formatUsd(params.amount),
      "",
      "Wallet:",
      `<code>${params.walletAddress}</code>`,
      "",
      "Reason:",
      params.reason,
      "",
      "Request ID:",
      params.requestId,
      "",
      "Timestamp:",
      formatTelegramTimestamp(params.timestamp),
    ].join("\n"),
  );
}

async function notifySafely(task: () => Promise<unknown>) {
  try {
    await task();
  } catch (error) {
    console.error("Telegram notification failed", error);
  }
}

function canSendSecurityTelegramNotification() {
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    return true;
  }

  if (!missingSecurityTelegramWarningLogged) {
    console.warn(
      "Telegram security notifications are disabled because TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing.",
    );
    missingSecurityTelegramWarningLogged = true;
  }

  return false;
}

async function sendSecurityTelegramNotification(message: string) {
  if (!canSendSecurityTelegramNotification()) {
    return;
  }

  await notifySafely(() => sendTelegramNotification(message));
}

function buildUsersPageVisitTelegramMessage(input: SecurityAuditEventInput) {
  return [
    "<b>Users Page Visit</b>",
    "",
    `User: ${escapeTelegramHtml(getSecurityFieldValue(input.username))}`,
    `Role: ${escapeTelegramHtml(getSecurityFieldValue(input.role))}`,
    `Route: ${escapeTelegramHtml(getSecurityFieldValue(input.route))}`,
    `IP: ${escapeTelegramHtml(getSecurityFieldValue(input.ipAddress))}`,
    `Country: ${escapeTelegramHtml(getSecurityFieldValue(input.country))}`,
    `User Agent: ${escapeTelegramHtml(truncateForTelegram(input.userAgent, 280))}`,
    `Language: ${escapeTelegramHtml(getSecurityFieldValue(input.language))}`,
    `Time: ${escapeTelegramHtml(formatTelegramTimestamp(input.timestamp))}`,
  ].join("\n");
}

function buildUserRegistrationTelegramMessage(input: SecurityAuditEventInput) {
  return [
    "<b>New User Registration</b>",
    "",
    `Username: ${escapeTelegramHtml(getSecurityFieldValue(input.username))}`,
    `Telegram: ${escapeTelegramHtml(getSecurityFieldValue(input.telegramUsername))}`,
    `IP: ${escapeTelegramHtml(getSecurityFieldValue(input.ipAddress))}`,
    `Country: ${escapeTelegramHtml(getSecurityFieldValue(input.country))}`,
    `User Agent: ${escapeTelegramHtml(truncateForTelegram(input.userAgent, 280))}`,
    `Language: ${escapeTelegramHtml(getSecurityFieldValue(input.language))}`,
    `Time: ${escapeTelegramHtml(formatTelegramTimestamp(input.timestamp))}`,
  ].join("\n");
}

function buildUserLoginTelegramMessage(input: SecurityAuditEventInput) {
  return [
    "<b>User Login</b>",
    "",
    `Username: ${escapeTelegramHtml(getSecurityFieldValue(input.username))}`,
    `Telegram: ${escapeTelegramHtml(getSecurityFieldValue(input.telegramUsername))}`,
    `IP: ${escapeTelegramHtml(getSecurityFieldValue(input.ipAddress))}`,
    `Country: ${escapeTelegramHtml(getSecurityFieldValue(input.country))}`,
    `User Agent: ${escapeTelegramHtml(truncateForTelegram(input.userAgent, 280))}`,
    `Language: ${escapeTelegramHtml(getSecurityFieldValue(input.language))}`,
    `Time: ${escapeTelegramHtml(formatTelegramTimestamp(input.timestamp))}`,
  ].join("\n");
}

export async function trackUsersPageVisit(input: SecurityAuditEventInput) {
  await ensureDatabase();
  const cooldownSince = new Date(
    new Date(input.timestamp).getTime() - 5 * 60 * 1000,
  ).toISOString();
  const shouldSendTelegram = !(
    await hasRecentSecurityAuditEvent({
      eventType: "users_page_visit",
      username: input.username,
      ipAddress: input.ipAddress,
      route: input.route,
      since: cooldownSince,
    })
  );

  await insertSecurityAuditEvent({
    ...input,
    eventType: "users_page_visit",
  });

  if (shouldSendTelegram) {
    await sendSecurityTelegramNotification(
      buildUsersPageVisitTelegramMessage({
        ...input,
        eventType: "users_page_visit",
      }),
    );
  }
}

export async function trackUserRegistered(input: SecurityAuditEventInput) {
  await ensureDatabase();
  await insertSecurityAuditEvent({
    ...input,
    eventType: "user_registered",
  });
  await sendSecurityTelegramNotification(
    buildUserRegistrationTelegramMessage({
      ...input,
      eventType: "user_registered",
    }),
  );
}

export async function trackUserLogin(input: SecurityAuditEventInput) {
  await ensureDatabase();
  const cooldownSince = new Date(
    new Date(input.timestamp).getTime() - 5 * 60 * 1000,
  ).toISOString();
  const shouldSendTelegram = !(
    await hasRecentSecurityAuditEvent({
      eventType: "user_login",
      username: input.username,
      ipAddress: input.ipAddress,
      route: input.route,
      since: cooldownSince,
    })
  );

  await insertSecurityAuditEvent({
    ...input,
    eventType: "user_login",
  });

  if (shouldSendTelegram) {
    await sendSecurityTelegramNotification(
      buildUserLoginTelegramMessage({
        ...input,
        eventType: "user_login",
      }),
    );
  }
}

async function answerTelegramCallbackSafely(input: {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
}) {
  try {
    await answerTelegramCallbackQuery(input);
  } catch (error) {
    console.warn("Telegram callback answer failed", error);
  }
}

function getWithdrawalTargetStatus(actionType: string): WithdrawalStatus {
  switch (actionType) {
    case "approve":
      return "approved";
    case "processing":
      return "processing";
    case "decline":
      return "declined";
    case "complete":
      return "completed";
    default:
      throw new Error("Unsupported withdrawal action.");
  }
}

function createTelegramActionTokenId() {
  return randomBytes(9).toString("hex");
}

function createTelegramCallbackSignature(input: {
  tokenId: string;
  actionType: string;
  withdrawalId: string;
}) {
  return createHash("sha256")
    .update(
      `${input.tokenId}:${input.actionType}:${input.withdrawalId}:${TELEGRAM_CALLBACK_SECRET}`,
    )
    .digest("hex")
    .slice(0, 12);
}

function buildTelegramCallbackData(input: {
  tokenId: string;
  signature: string;
}) {
  return `wd:${input.tokenId}:${input.signature}`;
}

async function getAdminIdentity(adminUserId: string) {
  const row = await getUserRowById(adminUserId);

  if (!row) {
    throw new Error("Admin account not found.");
  }

  const admin = normalizeUser(row);

  if (admin.role !== "admin") {
    throw new Error("Only admin users can perform this action.");
  }

  return admin;
}

async function getWithdrawalNotificationContext(withdrawalId: string) {
  const row = await queryOne(
    `select
      withdrawal_requests.*,
      users.username,
      profiles.telegram_username,
      updater.username as updated_by_username,
      updater_profiles.telegram_username as updated_by_telegram_username
     from withdrawal_requests
     inner join users on users.id = withdrawal_requests.user_id
     inner join profiles on profiles.user_id = users.id
     left join users as updater on updater.id = withdrawal_requests.last_updated_by_admin_id
     left join profiles as updater_profiles on updater_profiles.user_id = updater.id
     where withdrawal_requests.id = ?
     limit 1`,
    [withdrawalId],
  );

  if (!row) {
    return null;
  }

  return {
    request: normalizeWithdrawal(row),
    username: String(row.username),
    telegramUsername: String(row.telegram_username),
    updatedByUsername: row.updated_by_username
      ? String(row.updated_by_username)
      : "system",
    updatedByTelegramUsername: row.updated_by_telegram_username
      ? String(row.updated_by_telegram_username)
      : null,
  };
}

async function updateWithdrawalTelegramSyncState(input: {
  withdrawalId: string;
  syncStatus: TelegramSyncStatus;
  chatId?: string | null;
  messageId?: string | null;
  lastError?: string | null;
}) {
  await execute(
    `update withdrawal_requests set
      telegram_chat_id = coalesce(?, telegram_chat_id),
      telegram_message_id = coalesce(?, telegram_message_id),
      telegram_sync_status = ?,
      telegram_synced_at = ?,
      telegram_last_error = ?
     where id = ?`,
    [
      input.chatId ?? null,
      input.messageId ?? null,
      input.syncStatus,
      nowIso(),
      input.lastError ?? null,
      input.withdrawalId,
    ],
  );
}

function getAllowedTelegramWithdrawalActions(status: WithdrawalStatus) {
  switch (status) {
    case "pending":
      return [
        { id: "approve", label: "Approve" },
        { id: "decline", label: "Decline" },
      ] as const;
    case "approved":
      return [{ id: "processing", label: "Processing" }] as const;
    case "processing":
      return [{ id: "complete", label: "Complete" }] as const;
    case "completed":
    case "declined":
      return [] as const;
    default:
      return [] as const;
  }
}

async function replaceWithdrawalTelegramTokens(input: {
  withdrawalId: string;
  status: WithdrawalStatus;
}) {
  await execute(
    "delete from telegram_action_tokens where withdrawal_id = ? and consumed_at is null",
    [input.withdrawalId],
  );

  const createdAt = nowIso();
  const expiresAt = addDays(new Date(), 3).toISOString();
  const buttons: Array<{ text: string; callbackData: string }> = [];

  for (const action of getAllowedTelegramWithdrawalActions(input.status)) {
    const actionType = action.id;
    const tokenId = createTelegramActionTokenId();
    const signature = createTelegramCallbackSignature({
      tokenId,
      actionType,
      withdrawalId: input.withdrawalId,
    });

    await execute(
      `insert into telegram_action_tokens (
        id, withdrawal_id, action_type, callback_signature,
        allowed_from_status, expires_at, consumed_at, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tokenId,
        input.withdrawalId,
        actionType,
        signature,
        input.status,
        expiresAt,
        null,
        createdAt,
      ],
    );

    buttons.push({
      text: action.label,
      callbackData: buildTelegramCallbackData({ tokenId, signature }),
    });
  }

  return buildTelegramKeyboard(buttons);
}

export async function syncWithdrawalTelegramMessage(withdrawalId: string) {
  await ensureDatabase();

  const context = await getWithdrawalNotificationContext(withdrawalId);

  if (!context) {
    throw new Error("Withdrawal request not found.");
  }

  if (!TELEGRAM_CHAT_ID) {
    await updateWithdrawalTelegramSyncState({
      withdrawalId,
      syncStatus: "error",
      lastError: "Missing TELEGRAM_CHAT_ID configuration.",
    });
    return { ok: false as const, skipped: true as const };
  }

  const replyMarkup = await replaceWithdrawalTelegramTokens({
    withdrawalId,
    status: context.request.status,
  });
  const text = buildWithdrawalTelegramMessage({
    username: context.username,
    telegramUsername: context.telegramUsername,
    telegramId: context.request.telegramId,
    walletAddress: context.request.walletAddress,
    amount: context.request.amount,
    requestId: context.request.id,
    status: context.request.status,
    updatedAt: context.request.updatedAt,
    updatedBy: context.updatedByUsername,
    sourceDepositId: context.request.sourceDepositId,
    sourceCardMasked: context.request.sourceCardMasked,
    sourceCardholderName: context.request.sourceCardholderName,
    syncStatus: "synced",
  });

  try {
    let messageResult:
      | {
          message_id: number;
          chat: { id: number };
        }
      | null = null;

    if (context.request.telegramChatId && context.request.telegramMessageId) {
      try {
        const editResult = await editTelegramMessage({
          chatId: context.request.telegramChatId,
          messageId: context.request.telegramMessageId,
          text,
          replyMarkup,
        });
        messageResult = editResult.result;
      } catch {
        messageResult = null;
      }
    }

    if (!messageResult) {
      const sendResult = await sendTelegramMessage({
        chatId: TELEGRAM_CHAT_ID,
        text,
        replyMarkup,
      });

      if (!sendResult.result) {
        throw new Error("Telegram send returned no message result.");
      }

      messageResult = sendResult.result;
    }

    await updateWithdrawalTelegramSyncState({
      withdrawalId,
      syncStatus: "synced",
      chatId: String(messageResult.chat.id),
      messageId: String(messageResult.message_id),
      lastError: null,
    });

    revalidatePrivate(context.request.userId);
    revalidateAdmin();

    return {
      ok: true as const,
      chatId: String(messageResult.chat.id),
      messageId: String(messageResult.message_id),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Telegram synchronization failed.";

    await updateWithdrawalTelegramSyncState({
      withdrawalId,
      syncStatus: "error",
      lastError: message,
    });
    revalidatePrivate(context.request.userId);
    revalidateAdmin();
    throw error;
  }
}

export async function retryWithdrawalTelegramSync(
  withdrawalId: string,
  adminUserId: string,
) {
  await ensureDatabase();

  const admin = await getAdminIdentity(adminUserId);
  const row = await queryOne(
    "select * from withdrawal_requests where id = ? limit 1",
    [withdrawalId],
  );
  const request = row ? normalizeWithdrawal(row) : null;

  if (!request) {
    throw new Error("Withdrawal request not found.");
  }

  await updateWithdrawalTelegramSyncState({
    withdrawalId,
    syncStatus: "stale",
    lastError: null,
  });

  await logAdminAction(
    admin.id,
    "withdrawal-telegram-sync",
    "withdrawal",
    withdrawalId,
    `Retried Telegram sync for ${withdrawalId}`,
    {
      source: "dashboard",
      previousStatus: request.status,
      nextStatus: request.status,
      metadata: {
        trigger: "manual-retry",
      },
    },
  );

  revalidatePrivate(request.userId);
  revalidateAdmin();

  return syncWithdrawalTelegramMessage(withdrawalId);
}

export async function getWithdrawalStatusHistory(withdrawalId: string) {
  await ensureDatabase();
  const rows = await queryMany(
    `select * from withdrawal_status_history
     where withdrawal_id = ?
     order by created_at desc`,
    [withdrawalId],
  );

  return rows.map((row) => normalizeWithdrawalHistory(row));
}

export async function getTelegramRuntimeState(stateKey: string) {
  await ensureDatabase();
  const row = await queryOne(
    "select state_value from telegram_runtime_state where state_key = ? limit 1",
    [stateKey],
  );

  return row?.state_value ? String(row.state_value) : null;
}

export async function setTelegramRuntimeState(stateKey: string, stateValue: string) {
  await ensureDatabase();
  const timestamp = nowIso();
  await execute(
    `insert into telegram_runtime_state (state_key, state_value, updated_at)
     values (?, ?, ?)
     on conflict(state_key) do update set
       state_value = excluded.state_value,
       updated_at = excluded.updated_at`,
    [stateKey, stateValue, timestamp],
  );
}

export async function getAdminByTelegramUsername(telegramUsername: string) {
  await ensureDatabase();
  const row = await getUserRowByTelegramUsername(telegramUsername);

  if (!row) {
    return null;
  }

  const user = normalizeUser(row);
  return user.role === "admin" ? user : null;
}

export async function processTelegramUpdate(update: TelegramUpdate) {
  await ensureDatabase();

  const callback = update.callback_query;

  if (!callback?.data || !callback.data.startsWith("wd:")) {
    return { ok: true as const, skipped: true as const };
  }

  const [prefix, tokenId, signature] = callback.data.split(":");

  if (prefix !== "wd" || !tokenId || !signature) {
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Malformed action payload.",
      showAlert: true,
    });
    return { ok: false as const, error: "Malformed callback data." };
  }

  const tokenRow = await queryOne(
    "select * from telegram_action_tokens where id = ? limit 1",
    [tokenId],
  );

  if (!tokenRow) {
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "This action token is no longer valid.",
      showAlert: true,
    });
    return { ok: false as const, error: "Unknown callback token." };
  }

  const storedSignature = String(tokenRow.callback_signature);
  const withdrawalId = String(tokenRow.withdrawal_id);
  const actionType = String(tokenRow.action_type);
  const expectedSignature = createTelegramCallbackSignature({
    tokenId,
    actionType,
    withdrawalId,
  });

  if (signature !== storedSignature || signature !== expectedSignature) {
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Signature validation failed.",
      showAlert: true,
    });
    return { ok: false as const, error: "Invalid callback signature." };
  }

  if (tokenRow.consumed_at || new Date(String(tokenRow.expires_at)).getTime() < Date.now()) {
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "This action is no longer active.",
      showAlert: true,
    });
    return { ok: false as const, error: "Expired or consumed callback token." };
  }

  const context = await getWithdrawalNotificationContext(withdrawalId);

  if (!context) {
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Withdrawal request not found.",
      showAlert: true,
    });
    return { ok: false as const, error: "Withdrawal request not found." };
  }

  const callbackUsername = callback.from.username
    ? normalizeTelegramUsername(callback.from.username)
    : null;

  const admin =
    callbackUsername ? await getAdminByTelegramUsername(callbackUsername) : null;
  const chatId = String(callback.message?.chat.id ?? "");

  if (!admin || (TELEGRAM_CHAT_ID && chatId !== String(TELEGRAM_CHAT_ID))) {
    await insertWithdrawalHistory({
      withdrawalId,
      actionType: `unauthorized-${actionType}`,
      previousStatus: context.request.status,
      nextStatus: context.request.status,
      source: "telegram-unauthorized",
      adminUsername: callbackUsername ?? callback.from.first_name ?? "unknown",
      note: "Unauthorized Telegram callback attempt.",
    });
    revalidateAdmin();
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Unauthorized action.",
      showAlert: true,
    });
    return { ok: false as const, error: "Unauthorized callback sender." };
  }

  if (context.request.status !== String(tokenRow.allowed_from_status)) {
    await execute(
      "update telegram_action_tokens set consumed_at = ? where id = ? and consumed_at is null",
      [nowIso(), tokenId],
    );
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: `Request is already ${context.request.status}.`,
      showAlert: false,
    });
    return { ok: false as const, error: "Callback token is stale." };
  }

  const targetStatus = getWithdrawalTargetStatus(actionType);

  if (!canTransitionWithdrawalStatus(context.request.status, targetStatus)) {
    await execute(
      "update telegram_action_tokens set consumed_at = ? where id = ? and consumed_at is null",
      [nowIso(), tokenId],
    );
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "This transition is not allowed.",
      showAlert: true,
    });
    return { ok: false as const, error: "Invalid withdrawal transition." };
  }

  await execute(
    "update telegram_action_tokens set consumed_at = ? where id = ? and consumed_at is null",
    [nowIso(), tokenId],
  );

  await updateWithdrawalStatus({
    withdrawalId,
    status: targetStatus,
    adminUserId: admin.id,
    adminNote: `Telegram action: ${actionType}`,
    source: "telegram",
  });

  await answerTelegramCallbackSafely({
    callbackQueryId: callback.id,
    text: `${formatCleanOperationalWithdrawalStatus(targetStatus)} applied`,
    showAlert: false,
  });

  return { ok: true as const, withdrawalId, status: targetStatus };
}

function revalidateStorefront() {
  revalidatePath("/");
  revalidatePath("/marketplace");
  revalidatePath("/product/[id]", "page");
  revalidatePath("/cart");
  revalidatePath("/checkout");
}

function revalidatePrivate(userId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/collection");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/deposit");
  revalidatePath("/dashboard/withdraw");
  revalidatePath("/dashboard/transactions");
  revalidatePath("/withdraw");
  if (userId) {
    revalidatePath(`/success?user=${userId}`);
  }
}

function revalidateAdmin() {
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/products");
  revalidatePath("/admin/upload");
  revalidatePath("/admin/users");
  revalidatePath("/admin/analytics");
}

export async function ensureDatabase() {
  if (initialized) {
    return;
  }

  if (!initializationPromise) {
    initializationPromise = (async () => {
      if (!shouldAutoSetupDatabase()) {
        await assertDatabaseReady();
        initialized = true;
        return;
      }

      await execute(
        `create table if not exists users (
          id text primary key,
          username text not null unique,
          email text not null unique,
          name text not null,
          password_hash text not null,
          status text not null,
          created_at text not null,
          updated_at text not null,
          last_login_at text
        )`,
      );

      await execute(
        `create table if not exists profiles (
          user_id text primary key,
          role text not null,
          telegram_username text not null unique,
          telegram_id text,
          withdrawal_wallet text,
          verified integer not null default 1,
          created_at text not null,
          updated_at text not null
        )`,
      );

      await execute(
        `create table if not exists balances (
          user_id text primary key,
          available integer not null default 0,
          pending_withdrawal integer not null default 0,
          total_deposited integer not null default 0,
          total_spent integer not null default 0,
          total_withdrawn integer not null default 0,
          updated_at text not null
        )`,
      );

      await execute(
        `create table if not exists sessions (
          id text primary key,
          user_id text not null,
          token_hash text not null unique,
          user_agent text,
          ip_address text,
          created_at text not null,
          expires_at text not null
        )`,
      );

      await execute(
        `create table if not exists products (
          id text primary key,
          title text not null,
          rarity text not null,
          price integer not null,
          currency text not null default 'USD',
          stock integer not null,
          collection text not null,
          category text not null,
          description text not null,
          tagline text not null,
          default_delivery_type text not null default 'digital',
          delivery_digital text not null,
          delivery_physical text not null,
          edition text not null,
          shape text not null,
          image_url text,
          image_path text,
          image_updated_at text,
          featured integer not null default 0,
          homepage_featured integer not null default 0,
          featured_started_at text,
          showcase_float real not null default 1,
          showcase_rotation_seconds integer not null default 12,
          status text not null default 'active',
          archived integer not null default 0,
          palette_glow text not null,
          palette_glow_soft text not null,
          palette_core text not null,
          palette_ring text not null,
          created_at text not null,
          updated_at text not null
        )`,
      );

      await execute(
        `create table if not exists orders (
          id text primary key,
          user_id text not null,
          status text not null,
          payment_state text not null,
          subtotal integer not null,
          shipping integer not null,
          total integer not null,
          currency text not null default 'USD',
          shipping_name text not null,
          shipping_email text not null,
          shipping_address text not null,
          shipping_city text not null,
          shipping_postal_code text not null,
          payment_method text not null,
          payment_provider text,
          transvoucher_transaction_id text,
          transvoucher_reference_id text,
          provider_status text,
          failure_reason text,
          remaining_balance integer,
          created_at text not null,
          updated_at text not null,
          paid_at text
        )`,
      );

      await execute(
        `create table if not exists payment_sessions (
          id text primary key,
          user_id text not null,
          payment_method text not null,
          payment_provider text not null,
          currency text not null,
          subtotal integer not null,
          shipping integer not null,
          total integer not null,
          status text not null,
          items_json text not null,
          meta_json text,
          order_id text,
          transaction_id text,
          transvoucher_transaction_id text,
          transvoucher_reference_id text,
          payment_url text,
          provider_status text,
          raw_provider_response text,
          created_at text not null,
          updated_at text not null,
          expires_at text not null
        )`,
      );

      await execute(
        `create table if not exists deposit_payment_sessions (
          id text primary key,
          user_id text not null,
          payment_method text not null,
          payment_provider text not null,
          currency text not null,
          original_amount integer not null,
          credited_amount_usd integer not null,
          exchange_rate real not null,
          status text not null,
          meta_json text,
          deposit_id text,
          transaction_id text,
          transvoucher_transaction_id text,
          transvoucher_reference_id text,
          payment_url text,
          provider_status text,
          raw_provider_response text,
          created_at text not null,
          updated_at text not null,
          expires_at text not null
        )`,
      );

      await execute(
        `create table if not exists order_items (
          id text primary key,
          order_id text not null,
          product_id text not null,
          quantity integer not null,
          unit_price integer not null,
          delivery_type text not null
        )`,
      );

      await execute(
        `create table if not exists owned_cards (
          id text primary key,
          user_id text not null,
          product_id text not null,
          order_id text not null,
          quantity integer not null,
          acquired_at text not null
        )`,
      );

      await execute(
        `create table if not exists cart_items (
          id text primary key,
          user_id text not null,
          product_id text not null,
          quantity integer not null,
          delivery_type text not null,
          updated_at text not null
        )`,
      );

      await execute(
        `create table if not exists transactions (
          id text primary key,
          user_id text not null,
          kind text not null,
          amount integer not null,
          original_amount integer,
          original_currency text,
          display_currency text,
          credited_amount_usd integer,
          exchange_rate real,
          payment_method text,
          payment_provider text,
          transvoucher_transaction_id text,
          transvoucher_reference_id text,
          payment_url text,
          provider_status text,
          raw_provider_response text,
          status text not null,
          reference_id text not null,
          summary text not null,
          meta_json text,
          created_at text not null,
          updated_at text not null,
          paid_at text
        )`,
      );

      await execute(
        `create table if not exists deposits (
          id text primary key,
          user_id text not null,
          amount integer not null,
          original_amount integer,
          original_currency text,
          credited_amount_usd integer,
          exchange_rate real,
          payment_method text not null,
          payment_provider text,
          transvoucher_transaction_id text,
          transvoucher_reference_id text,
          cardholder_name text not null,
          card_masked text not null,
          status text not null,
          balance_before integer not null,
          balance_after integer not null,
          created_at text not null,
          updated_at text,
          completed_at text,
          paid_at text
        )`,
      );

      await execute(
        `create table if not exists withdrawal_requests (
          id text primary key,
          user_id text not null,
          amount integer not null,
          wallet_address text not null,
          telegram_id text not null,
          status text not null,
          source_deposit_id text,
          source_card_masked text,
          source_cardholder_name text,
          admin_note text,
          telegram_chat_id text,
          telegram_message_id text,
          telegram_sync_status text not null default 'pending',
          telegram_synced_at text,
          telegram_last_error text,
          last_action_source text not null default 'system',
          last_updated_by_admin_id text,
          created_at text not null,
          updated_at text not null
        )`,
      );

      await execute(
        `create table if not exists admin_logs (
          id text primary key,
          admin_user_id text not null,
          action text not null,
          entity_type text not null,
          entity_id text not null,
          message text not null,
          source text not null default 'dashboard',
          previous_status text,
          next_status text,
          metadata_json text,
          created_at text not null
        )`,
      );

      await execute(
        `create table if not exists withdrawal_status_history (
          id text primary key,
          withdrawal_id text not null,
          action_type text not null,
          previous_status text,
          next_status text not null,
          source text not null,
          admin_user_id text,
          admin_username text,
          admin_telegram_username text,
          note text,
          created_at text not null
        )`,
      );

      await execute(
        `create table if not exists telegram_action_tokens (
          id text primary key,
          withdrawal_id text not null,
          action_type text not null,
          callback_signature text not null,
          allowed_from_status text not null,
          expires_at text not null,
          consumed_at text,
          created_at text not null
        )`,
      );

      await execute(
        `create table if not exists telegram_runtime_state (
          state_key text primary key,
          state_value text not null,
          updated_at text not null
        )`,
      );

      await execute(
        `create table if not exists notifications (
          id text primary key,
          user_id text not null,
          kind text not null,
          title text not null,
          body text not null,
          status text not null default 'unread',
          meta_json text,
          created_at text not null,
          read_at text
        )`,
      );

      await execute(
        `create table if not exists security_audit_events (
          id text primary key,
          event_type text not null,
          user_id text,
          username text,
          telegram_username text,
          role text,
          ip_address text not null,
          country text not null,
          user_agent text not null,
          language text not null,
          route text not null,
          created_at text not null
        )`,
      );

      await ensureColumn("withdrawal_requests", "telegram_chat_id text");
      await ensureColumn("withdrawal_requests", "telegram_message_id text");
      await ensureColumn(
        "withdrawal_requests",
        "telegram_sync_status text not null default 'pending'",
      );
      await ensureColumn("withdrawal_requests", "telegram_synced_at text");
      await ensureColumn("withdrawal_requests", "telegram_last_error text");
      await ensureColumn(
        "withdrawal_requests",
        "last_action_source text not null default 'system'",
      );
      await ensureColumn("withdrawal_requests", "last_updated_by_admin_id text");
      await ensureColumn("admin_logs", "source text not null default 'dashboard'");
      await ensureColumn("admin_logs", "previous_status text");
      await ensureColumn("admin_logs", "next_status text");
      await ensureColumn("admin_logs", "metadata_json text");
      await ensureColumn("orders", "currency text not null default 'USD'");
      await ensureColumn("orders", "payment_provider text");
      await ensureColumn("orders", "transvoucher_transaction_id text");
      await ensureColumn("orders", "transvoucher_reference_id text");
      await ensureColumn("orders", "provider_status text");
      await ensureColumn("orders", "paid_at text");
      await ensureColumn("payment_sessions", "transvoucher_transaction_id text");
      await ensureColumn("payment_sessions", "transvoucher_reference_id text");
      await ensureColumn("payment_sessions", "payment_url text");
      await ensureColumn("payment_sessions", "provider_status text");
      await ensureColumn("payment_sessions", "raw_provider_response text");
      await ensureColumn("deposit_payment_sessions", "transvoucher_transaction_id text");
      await ensureColumn("deposit_payment_sessions", "transvoucher_reference_id text");
      await ensureColumn("deposit_payment_sessions", "payment_url text");
      await ensureColumn("deposit_payment_sessions", "provider_status text");
      await ensureColumn("deposit_payment_sessions", "raw_provider_response text");
      await ensureColumn("transactions", "original_amount integer");
      await ensureColumn("transactions", "original_currency text");
      await ensureColumn("transactions", "display_currency text");
      await ensureColumn("transactions", "credited_amount_usd integer");
      await ensureColumn("transactions", "exchange_rate real");
      await ensureColumn("transactions", "payment_method text");
      await ensureColumn("transactions", "payment_provider text");
      await ensureColumn("transactions", "transvoucher_transaction_id text");
      await ensureColumn("transactions", "transvoucher_reference_id text");
      await ensureColumn("transactions", "payment_url text");
      await ensureColumn("transactions", "provider_status text");
      await ensureColumn("transactions", "raw_provider_response text");
      await ensureColumn("transactions", "paid_at text");
      await ensureColumn("deposits", "original_amount integer");
      await ensureColumn("deposits", "original_currency text");
      await ensureColumn("deposits", "credited_amount_usd integer");
      await ensureColumn("deposits", "exchange_rate real");
      await ensureColumn("deposits", "payment_provider text");
      await ensureColumn("deposits", "transvoucher_transaction_id text");
      await ensureColumn("deposits", "transvoucher_reference_id text");
      await ensureColumn("deposits", "updated_at text");
      await ensureColumn("deposits", "paid_at text");
      await ensureColumn("products", "currency text not null default 'USD'");
      await ensureColumn(
        "products",
        "default_delivery_type text not null default 'digital'",
      );
      await ensureColumn("products", "featured integer not null default 0");
      await ensureColumn("products", "homepage_featured integer not null default 0");
      await ensureColumn("products", "featured_started_at text");
      await ensureColumn("products", "image_path text");
      await ensureColumn("products", "image_updated_at text");
      await ensureColumn("products", "showcase_float real not null default 1");
      await ensureColumn("products", "showcase_rotation_seconds integer not null default 12");
      await ensureColumn("products", "status text not null default 'active'");

      await execute(
        "update withdrawal_requests set status = 'declined' where status = 'rejected'",
      );
      await execute(
        "update withdrawal_requests set status = 'completed' where status = 'paid'",
      );
      await execute(
        "update withdrawal_requests set telegram_sync_status = 'pending' where telegram_sync_status is null or telegram_sync_status = ''",
      );
      await execute(
        "update withdrawal_requests set last_action_source = 'system' where last_action_source is null or last_action_source = ''",
      );
      await execute(
        "update orders set currency = 'USD' where currency is null or currency = ''",
      );
      await execute(
        "update orders set provider_status = payment_state where provider_status is null or provider_status = ''",
      );
      await execute(
        "update products set currency = 'USD' where currency is null or currency = ''",
      );
      await execute(
        "update products set default_delivery_type = 'digital' where default_delivery_type is null or default_delivery_type = ''",
      );
      await execute(
        "update deposits set updated_at = created_at where updated_at is null or updated_at = ''",
      );
      await execute(
        "update products set status = 'active' where status is null or status = ''",
      );
      await execute(
        "update products set homepage_featured = 0 where homepage_featured is null",
      );
      await execute(
        "update products set showcase_float = 1 where showcase_float is null or showcase_float <= 0",
      );
      await execute(
        "update products set showcase_rotation_seconds = 12 where showcase_rotation_seconds is null or showcase_rotation_seconds <= 0",
      );

      if (shouldAutoSeedDatabase()) {
        await seedProductsIfEmpty();
        await seedAdminAccount();
      }

      initialized = true;
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  await initializationPromise;
}

function buildMarketplaceQuery(filters: MarketplaceFilters) {
  const where: string[] = ["archived = 0", "status = 'active'"];
  const args: SqlValue[] = [];

  if (filters.search) {
    where.push("(title like ? or collection like ? or category like ?)");
    const query = `%${filters.search}%`;
    args.push(query, query, query);
  }

  if (filters.rarity) {
    where.push("rarity = ?");
    args.push(filters.rarity);
  }

  if (filters.collection) {
    where.push("collection = ?");
    args.push(filters.collection);
  }

  let orderBy = "created_at desc";

  switch (filters.sort) {
    case "price-asc":
      orderBy = "price asc";
      break;
    case "price-desc":
      orderBy = "price desc";
      break;
    case "stock-desc":
      orderBy = "stock desc";
      break;
    case "title-asc":
      orderBy = "title asc";
      break;
    default:
      orderBy = "created_at desc";
  }

  return {
    sql: `select * from products ${
      where.length ? `where ${where.join(" and ")}` : ""
    } order by ${orderBy}`,
    args,
  };
}

export async function getMarketplaceProducts(filters: MarketplaceFilters = {}) {
  await ensureDatabase();
  const query = buildMarketplaceQuery(filters);
  const rows = await queryMany(query.sql, query.args);
  return rows.map((row) => normalizeProduct(row));
}

export async function getProductById(id: string) {
  await ensureDatabase();
  const row = await queryOne(
    "select * from products where id = ? and archived = 0 and status = 'active' limit 1",
    [id],
  );
  return row ? normalizeProduct(row) : null;
}

export async function getRelatedProducts(id: string, limit = 4) {
  await ensureDatabase();
  const rows = await queryMany(
    "select * from products where id <> ? and archived = 0 and status = 'active' order by created_at desc limit ?",
    [id, limit],
  );
  return rows.map((row) => normalizeProduct(row));
}

export async function getTrendingProducts(limit = 4) {
  await ensureDatabase();
  const rows = await queryMany(
    "select * from products where archived = 0 and status = 'active' order by featured desc, stock asc, created_at desc limit ?",
    [limit],
  );
  return rows.map((row) => normalizeProduct(row));
}

export async function getHeroProducts(limit = 3) {
  await ensureDatabase();
  const rows = await queryMany(
    "select * from products where archived = 0 and status = 'active' order by featured desc, rarity = 'Legendary' desc, created_at desc limit ?",
    [limit],
  );
  return rows.map((row) => normalizeProduct(row));
}

export async function getHomepageFeaturedProduct() {
  await ensureDatabase();
  const row = await queryOne(
    `select * from products
     where archived = 0 and status = 'active' and homepage_featured = 1
     order by featured_started_at desc, updated_at desc
     limit 1`,
  );

  return row ? normalizeProduct(row) : null;
}

export async function getFeaturedCollections() {
  await ensureDatabase();
  const rows = await queryMany(
    `select
      collection as title,
      min(id) as id,
      count(*) as card_count,
      min(category) as description_seed,
      min(shape) as shape,
      min(palette_glow) as palette_glow,
      min(palette_glow_soft) as palette_glow_soft,
      min(palette_core) as palette_core,
      min(palette_ring) as palette_ring
    from products
    where archived = 0 and status = 'active'
    group by collection
    order by card_count desc, collection asc
    limit 4`,
  );

  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    cardCount: Number(row.card_count),
    description: `${String(row.description_seed)} collection from the live galactic archive.`,
    shape: String(row.shape) as ProductRecord["shape"],
    palette: {
      glow: String(row.palette_glow),
      glowSoft: String(row.palette_glow_soft),
      core: String(row.palette_core),
      ring: String(row.palette_ring),
    },
  })) satisfies CollectionSummary[];
}

export async function getMarketplaceFacets() {
  await ensureDatabase();
  const [rarityRows, collectionRows] = await Promise.all([
    queryMany("select distinct rarity from products where archived = 0 and status = 'active' order by rarity"),
    queryMany(
      "select distinct collection from products where archived = 0 and status = 'active' order by collection",
    ),
  ]);

  return {
    rarities: rarityRows.map((row) => String(row.rarity)),
    collections: collectionRows.map((row) => String(row.collection)),
  };
}

export async function registerUser(input: {
  username: string;
  email: string;
  telegramUsername: string;
  password: string;
}) {
  await ensureDatabase();

  const username = normalizeUsername(input.username);
  const email = input.email.trim().toLowerCase();
  const telegramUsername = normalizeTelegramUsername(input.telegramUsername);

  if (username.length < 3) {
    throw new Error("Username must be at least 3 characters.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (!isValidTelegramUsername(telegramUsername)) {
    throw new Error("Telegram username must start with @ and use 5-32 valid characters.");
  }

  const [existingUser, existingEmail, existingTelegram] = await Promise.all([
    queryOne("select id from users where username = ? limit 1", [username]),
    queryOne("select id from users where email = ? limit 1", [email]),
    queryOne("select user_id from profiles where telegram_username = ? limit 1", [
      telegramUsername,
    ]),
  ]);

  if (existingUser) {
    throw new Error("This username is already taken.");
  }

  if (existingEmail) {
    throw new Error("This email is already connected to another account.");
  }

  if (existingTelegram) {
    throw new Error("This Telegram username is already connected to another account.");
  }

  const userId = randomUUID();
  const timestamp = nowIso();
  const passwordHash = hashPassword(input.password);

  await execute(
    `insert into users (
      id, username, email, name, password_hash, status, created_at, updated_at, last_login_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      username,
      email,
      username,
      passwordHash,
      "active",
      timestamp,
      timestamp,
      timestamp,
    ],
  );

  await execute(
    `insert into profiles (
      user_id, role, telegram_username, telegram_id, withdrawal_wallet, verified, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, "user", telegramUsername, null, null, 1, timestamp, timestamp],
  );

  await execute(
    `insert into balances (
      user_id, available, pending_withdrawal, total_deposited, total_spent, total_withdrawn, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?)`,
    [userId, 0, 0, 0, 0, 0, timestamp],
  );

  return userId;
}

export async function authenticateUser(input: {
  username: string;
  password: string;
}) {
  await ensureDatabase();

  const row = await queryOne(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.withdrawal_wallet, profiles.verified
     from users
     inner join profiles on profiles.user_id = users.id
     where users.username = ?
     limit 1`,
    [normalizeUsername(input.username)],
  );

  if (!row) {
    return null;
  }

  if (!verifyPassword(input.password, String(row.password_hash))) {
    return null;
  }

  const loginAt = nowIso();
  await execute("update users set last_login_at = ?, updated_at = ? where id = ?", [
    loginAt,
    loginAt,
    String(row.id),
  ]);

  const freshRow = await getUserRowById(String(row.id));
  return freshRow ? normalizeUser(freshRow) : null;
}

export async function createSessionForUser(input: {
  userId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  await ensureDatabase();

  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const createdAt = new Date();
  const expiresAt = addDays(createdAt, 30).toISOString();

  await execute(
    `insert into sessions (id, user_id, token_hash, user_agent, ip_address, created_at, expires_at)
     values (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.userId,
      tokenHash,
      input.userAgent ?? null,
      input.ipAddress ?? null,
      createdAt.toISOString(),
      expiresAt,
    ],
  );

  return token;
}

export async function deleteSessionByToken(token: string) {
  await ensureDatabase();
  await execute("delete from sessions where token_hash = ?", [hashSessionToken(token)]);
}

export async function getUserBySessionToken(token: string) {
  await ensureDatabase();
  const row = await queryOne(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.withdrawal_wallet, profiles.verified, sessions.expires_at
     from sessions
     inner join users on users.id = sessions.user_id
     inner join profiles on profiles.user_id = users.id
     where sessions.token_hash = ?
     limit 1`,
    [hashSessionToken(token)],
  );

  if (!row) {
    return null;
  }

  if (new Date(String(row.expires_at)).getTime() <= Date.now()) {
    return null;
  }

  return normalizeUser(row);
}

export async function getHeaderAccount(userId: string) {
  await ensureDatabase();
  return getUserAndBalance(userId);
}

export async function getUserById(id: string) {
  await ensureDatabase();
  const row = await getUserRowById(id);
  return row ? normalizeUser(row) : null;
}

export async function getBalanceByUserId(userId: string) {
  await ensureDatabase();
  const row = await getBalanceRowByUserId(userId);
  return row ? normalizeBalance(row) : null;
}

export async function updateUserProfile(
  userId: string,
  input: {
    name: string;
    telegramUsername: string;
    telegramId: string;
    withdrawalWallet: string;
  },
) {
  await ensureDatabase();

  const telegramUsername = normalizeTelegramUsername(input.telegramUsername);

  if (!isValidTelegramUsername(telegramUsername)) {
    throw new Error("Telegram username must start with @ and use 5-32 valid characters.");
  }

  const owner = await queryOne(
    "select user_id from profiles where telegram_username = ? and user_id <> ? limit 1",
    [telegramUsername, userId],
  );

  if (owner) {
    throw new Error("Telegram username is already connected to another account.");
  }

  const timestamp = nowIso();

  await execute("update users set name = ?, updated_at = ? where id = ?", [
    input.name.trim() || "Collector",
    timestamp,
    userId,
  ]);

  await execute(
    `update profiles set
      telegram_username = ?, telegram_id = ?, withdrawal_wallet = ?, updated_at = ?
     where user_id = ?`,
    [
      telegramUsername,
      input.telegramId.trim() || null,
      input.withdrawalWallet.trim() || null,
      timestamp,
      userId,
    ],
  );

  revalidatePrivate(userId);
}

export async function getDashboardStats(userId: string): Promise<DashboardStat[]> {
  await ensureDatabase();
  const [balanceRow, purchaseRow, cardsRow] = await Promise.all([
    getBalanceRowByUserId(userId),
    queryOne(
      "select count(*) as purchases from orders where user_id = ? and payment_state = 'completed'",
      [userId],
    ),
    queryOne("select coalesce(sum(quantity), 0) as owned from owned_cards where user_id = ?", [
      userId,
    ]),
  ]);

  const balance = balanceRow ? normalizeBalance(balanceRow) : null;

  return [
    {
      label: "Current balance",
      value: formatUsd(balance?.available ?? 0),
      accent: "violet",
    },
    {
      label: "Total deposited",
      value: formatUsd(balance?.totalDeposited ?? 0),
      accent: "cyan",
    },
    {
      label: "Total spent",
      value: formatUsd(balance?.totalSpent ?? 0),
      accent: "rose",
    },
    {
      label: "Cards owned",
      value: `${Number(cardsRow?.owned ?? 0)}`,
      accent: "emerald",
    },
    {
      label: "Purchases",
      value: `${Number(purchaseRow?.purchases ?? 0)}`,
      accent: "amber",
    },
  ];
}

export async function getFinancialOverview(userId: string) {
  await ensureDatabase();
  const [balance, recentTransactions, pendingRow, recentWithdrawals] = await Promise.all([
    getBalanceByUserId(userId),
    getUserTransactions(userId, 5),
    queryOne(
      `select coalesce(sum(amount), 0) as total
       from withdrawal_requests
       where user_id = ?
         and status in ('pending', 'approved', 'processing')`,
      [userId],
    ),
    getUserWithdrawals(userId, 3),
  ]);

  return {
    balance,
    pendingWithdrawals: Number(pendingRow?.total ?? 0),
    recentTransactions,
    recentWithdrawals,
  };
}

export async function getUserOrders(userId: string) {
  await ensureDatabase();
  const rows = await queryMany(
    `select
      orders.*,
      coalesce(sum(order_items.quantity), 0) as item_count
     from orders
     left join order_items on order_items.order_id = orders.id
     where orders.user_id = ?
     group by orders.id
     order by orders.created_at desc`,
    [userId],
  );

  return rows.map((row) => normalizeOrder(row));
}

export async function getUserInventory(userId: string) {
  await ensureDatabase();
  const rows = await queryMany(
    `select
      owned_cards.id as inventory_id,
      owned_cards.quantity,
      owned_cards.order_id,
      owned_cards.acquired_at,
      products.*
     from owned_cards
     inner join products on products.id = owned_cards.product_id
     where owned_cards.user_id = ?
     order by owned_cards.acquired_at desc`,
    [userId],
  );

  return rows.map((row) => ({
    inventoryId: String(row.inventory_id),
    orderId: String(row.order_id),
    quantity: Number(row.quantity),
    acquiredAt: String(row.acquired_at),
    product: normalizeProduct(row),
  }));
}

export async function getUserTransactions(userId: string, limit = 12) {
  await ensureDatabase();
  const rows = await queryMany(
    "select * from transactions where user_id = ? order by created_at desc limit ?",
    [userId, limit],
  );
  return rows.map((row) => normalizeTransaction(row));
}

export async function getUserDeposits(userId: string, limit = 12) {
  await ensureDatabase();
  const rows = await queryMany(
    "select * from deposits where user_id = ? order by created_at desc limit ?",
    [userId, limit],
  );
  return rows.map((row) => normalizeDeposit(row));
}

export async function getDepositOutcomeById(userId: string, depositId: string) {
  await ensureDatabase();
  const [depositRow, transactionRow] = await Promise.all([
    queryOne("select * from deposits where id = ? and user_id = ? limit 1", [
      depositId,
      userId,
    ]),
    queryOne(
      `select * from transactions
       where user_id = ?
         and kind = 'deposit'
         and reference_id = ?
       order by created_at desc
       limit 1`,
      [userId, depositId],
    ),
  ]);

  if (!depositRow) {
    return null;
  }

  const deposit = normalizeDeposit(depositRow);
  const transactionMeta = fromJson<Record<string, unknown>>(
    transactionRow?.meta_json ?? null,
  );

  return {
    deposit,
    transactionId: transactionRow?.id ? String(transactionRow.id) : null,
    failureReason:
      typeof transactionMeta?.reason === "string"
        ? transactionMeta.reason
        : deposit.status === "failed"
          ? "Payment was declined by the issuing bank."
          : null,
  };
}

export async function getUserWithdrawals(userId: string, limit = 12) {
  await ensureDatabase();
  const rows = await queryMany(
    "select * from withdrawal_requests where user_id = ? order by created_at desc limit ?",
    [userId, limit],
  );
  return rows.map((row) => normalizeWithdrawal(row));
}

export async function createDeposit(input: {
  userId: string;
  amount: number;
  currency: SupportedCurrency;
  paymentMethod: PaymentMethodName;
  provider: PaymentProviderName;
  cardholderName?: string;
  cardNumber?: string;
  billingCountry?: string;
  cryptoNetwork?: CryptoNetwork | null;
}) {
  await ensureDatabase();

  if (input.amount <= 0) {
    throw new Error("Deposit amount must be greater than zero.");
  }

  if (input.provider !== "TransVoucher") {
    throw new Error("TransVoucher is the only active payment provider.");
  }

  const account = await getUserAndBalance(input.userId);

  if (!account) {
    throw new Error("Unable to load collector account.");
  }

  const depositId = createReadableId("DEP");
  const timestamp = nowIso();
  const paymentReference = getPaymentReference({
    paymentMethod: input.paymentMethod,
    cardNumber: input.cardNumber,
    cryptoNetwork: input.cryptoNetwork,
  });
  const digits = input.cardNumber?.replace(/\D+/g, "") ?? "";
  const shouldDecline =
    input.paymentMethod === "Credit Card" && digits.endsWith("0000");
  const balanceBefore = account.balance.available;
  const conversion = await convertAmount(input.amount, input.currency, "USD");
  const creditedAmountUsd = conversion.convertedAmount;
  const exchangeRate = conversion.exchangeRate;
  const balanceAfter = shouldDecline
    ? balanceBefore
    : Number((balanceBefore + creditedAmountUsd).toFixed(2));
  const cardholderName =
    input.cardholderName?.trim() ||
    (input.paymentMethod === "Crypto" ? "Crypto settlement" : input.paymentMethod);

  await execute(
    `insert into deposits (
      id, user_id, amount, original_amount, original_currency, credited_amount_usd,
      exchange_rate, payment_method, payment_provider, cardholder_name, card_masked,
      status, balance_before, balance_after, created_at, updated_at, completed_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [
      depositId,
      input.userId,
      creditedAmountUsd,
      input.amount,
      input.currency,
      creditedAmountUsd,
      exchangeRate,
      input.paymentMethod,
      input.provider,
      cardholderName,
      paymentReference,
      shouldDecline ? "failed" : "completed",
      balanceBefore,
      balanceAfter,
      timestamp,
      timestamp,
      shouldDecline ? null : timestamp,
    ],
  );

  const transactionId = await createTransactionRecord({
    userId: input.userId,
    kind: "deposit",
    amount: creditedAmountUsd,
    originalAmount: input.amount,
    originalCurrency: input.currency,
    displayCurrency: input.currency,
    creditedAmountUsd,
    exchangeRate,
    paymentMethod: input.paymentMethod,
    paymentProvider: input.provider,
    status: shouldDecline ? "failed" : "completed",
    referenceId: depositId,
    summary: shouldDecline ? "Deposit failed" : "Deposit completed",
    meta: {
      originalAmount: input.amount,
      originalCurrency: input.currency,
      creditedAmountUsd,
      exchangeRate,
      paymentMethod: input.paymentMethod,
      provider: input.provider,
      paymentReference,
      billingCountry: input.billingCountry ?? null,
      cryptoNetwork: input.cryptoNetwork ?? null,
      relatedOrderId: depositId,
      telegramUsername: account.user.telegramUsername,
    },
  });

  if (shouldDecline) {
    await notifySafely(() =>
      sendDepositFailureNotification({
        username: account.user.username,
        telegramUsername: account.user.telegramUsername,
        depositId,
        amount: input.amount,
        currency: input.currency,
        paymentMethod: `${input.paymentMethod} ${paymentReference}`,
        reason: "Payment was declined by the issuing bank.",
        timestamp,
      }),
    );

    revalidatePrivate(input.userId);
    return {
      ok: false as const,
      depositId,
      transactionId,
      reason: "Payment was declined by the issuing bank.",
      balanceBefore,
      balanceAfter,
      originalAmount: input.amount,
      originalCurrency: input.currency,
      creditedAmountUsd,
      exchangeRate,
      paymentMethod: input.paymentMethod,
      provider: input.provider,
      paymentReference,
      timestamp,
    };
  }

  await execute(
    `update balances set
      available = ?,
      total_deposited = total_deposited + ?,
      updated_at = ?
     where user_id = ?`,
    [balanceAfter, creditedAmountUsd, timestamp, input.userId],
  );

  await notifySafely(() =>
    sendDepositNotification({
      username: account.user.username,
      telegramUsername: account.user.telegramUsername,
      depositId,
      originalAmount: input.amount,
      originalCurrency: input.currency,
      creditedAmountUsd,
      exchangeRate,
      paymentMethod: input.paymentMethod,
      provider: input.provider,
      timestamp,
    }),
  );

  revalidatePrivate(input.userId);

  return {
    ok: true as const,
    depositId,
    transactionId,
    balanceBefore,
    balanceAfter,
    originalAmount: input.amount,
    originalCurrency: input.currency,
    creditedAmountUsd,
    exchangeRate,
    paymentMethod: input.paymentMethod,
    provider: input.provider,
    paymentReference,
    timestamp,
  };
}

export async function createWithdrawalRequest(input: {
  userId: string;
  amount: number;
  walletAddress?: string;
}) {
  await ensureDatabase();

  if (input.amount <= 0) {
    throw new Error("Withdrawal amount must be greater than zero.");
  }

  if (input.amount < 500) {
    throw new Error("Minimum withdrawal amount is $500.");
  }

  const account = await getUserAndBalance(input.userId);

  if (!account) {
    throw new Error("Unable to load collector account.");
  }

  if (!account.user.telegramId) {
    throw new Error("Add your Telegram ID in settings before requesting a withdrawal.");
  }
  const walletAddress = (input.walletAddress || account.user.withdrawalWallet || "").trim();
  if (!walletAddress) {
    throw new Error("Add your USDT BEP20 wallet address in settings before requesting a withdrawal.");
  }

  if (account.balance.available < input.amount) {
    await notifySafely(() =>
      sendTelegramNotification(
        buildTelegramFailureMessage({
          title: "Balance Validation Failed",
          username: account.user.username,
          telegramUsername: account.user.telegramUsername,
          amount: input.amount,
          currency: "USD",
          paymentMethod: "Archive Balance",
          reason: "Withdrawal blocked because available balance is below requested amount.",
          referenceId: createReadableId("WDR"),
          timestamp: nowIso(),
        }),
      ),
    );
    throw new Error("Insufficient balance for this withdrawal request.");
  }

  const withdrawalId = createReadableId("WDR");
  const timestamp = nowIso();
  const latestDeposit = await getLatestCompletedDeposit(input.userId);

  await execute(
    `insert into withdrawal_requests (
      id, user_id, amount, wallet_address, telegram_id, status, source_deposit_id,
      source_card_masked, source_cardholder_name, admin_note, telegram_chat_id,
      telegram_message_id, telegram_sync_status, telegram_synced_at, telegram_last_error,
      last_action_source, last_updated_by_admin_id, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      withdrawalId,
      input.userId,
      input.amount,
      walletAddress,
      account.user.telegramId,
      "pending",
      latestDeposit?.id ?? null,
      latestDeposit?.cardMasked ?? null,
      latestDeposit?.cardholderName ?? null,
      null,
      null,
      null,
      "pending",
      null,
      null,
      "system",
      null,
      timestamp,
      timestamp,
    ],
  );

  await execute(
    `update balances set
      available = available - ?,
      pending_withdrawal = pending_withdrawal + ?,
      updated_at = ?
     where user_id = ?`,
    [input.amount, input.amount, timestamp, input.userId],
  );

  await createTransactionRecord({
    userId: input.userId,
    kind: "withdrawal",
    amount: -input.amount,
    status: "pending",
    referenceId: withdrawalId,
    summary: "Withdrawal request submitted",
    meta: {
      walletAddress,
    },
  });

  await insertWithdrawalHistory({
    withdrawalId,
    actionType: "request-created",
    previousStatus: null,
    nextStatus: "pending",
    source: "system",
    note: "Withdrawal request submitted by collector.",
  });

  await notifySafely(() => syncWithdrawalTelegramMessage(withdrawalId));

  revalidatePrivate(input.userId);
  revalidateAdmin();

  return withdrawalId;
}

export async function createCheckoutPaymentSession(input: {
  userId: string;
  paymentMethod: Exclude<PaymentMethodName, "Archive Balance">;
  provider: Exclude<PaymentProviderName, "Internal Wallet">;
  currency: SupportedCurrency;
  items: CheckoutSessionLine[];
}) {
  await ensureDatabase();

  if (input.provider !== "TransVoucher") {
    throw new Error("TransVoucher is the only active payment provider.");
  }

  if (input.paymentMethod === "Crypto") {
    throw new Error("Crypto checkout is not available in the TransVoucher flow.");
  }

  const account = await getUserAndBalance(input.userId);

  if (!account) {
    throw new Error("Unable to load collector account.");
  }

  const { productMap } = await resolveCheckoutProducts(input.items);
  const pricing = calculateCheckoutTotals(input.items, productMap);
  const sessionId = randomUUID();
  const orderId = createReadableId("ORD");
  const transactionId = createReadableId("TXN");
  const timestamp = nowIso();
  const expiresAt = new Date(
    Date.now() + CHECKOUT_PAYMENT_SESSION_TTL_MINUTES * 60 * 1000,
  ).toISOString();
  const shippingName = account.user.name || account.user.username;
  const shippingEmail = account.user.email;
  const shippingAddress =
    pricing.shipping > 0
      ? "Archive delivery managed after verified payment confirmation."
      : "Digital delivery";
  const shippingCity = "Archive";
  const shippingPostalCode = "00000";
  const { successUrl, cancelUrl, redirectUrl } =
    buildTransVoucherReturnUrls(transactionId);
  const payment = await createTransVoucherPayment({
    amount: pricing.total,
    currency: input.currency,
    title: `ReboHrome Order ${orderId}`,
    description: `${input.items.length} archive collectible${
      input.items.length === 1 ? "" : "s"
    }`,
    successUrl,
    cancelUrl,
    redirectUrl,
    customerDetails: {
      username: account.user.username,
      telegramUsername: account.user.telegramUsername,
      email: account.user.email,
    },
    metadata: {
      type: "purchase",
      user_id: account.user.id,
      username: account.user.username,
      telegram_username: account.user.telegramUsername,
      internal_order_id: orderId,
      internal_transaction_id: transactionId,
      cart_id: sessionId,
    },
    defaultPaymentMethod: mapTransVoucherMethod(input.paymentMethod),
    paymentMethodForced: true,
  });
  const providerStatus = normalizeProviderStatus(payment.status);
  const mappedSessionStatus = mapProviderStatusToCheckoutSessionStatus(providerStatus);
  const mappedTransactionStatus = mapProviderStatusToTransactionStatus(providerStatus);
  const initialSessionStatus =
    mappedSessionStatus === "completed" ? "processing" : mappedSessionStatus;
  const initialTransactionStatus =
    mappedTransactionStatus === "completed" ? "processing" : mappedTransactionStatus;
  const paymentReference = buildTransVoucherPaymentReference({
    referenceId: payment.referenceId,
    transactionId: payment.transactionId,
  });

  await execute(
    `insert into orders (
      id, user_id, status, payment_state, subtotal, shipping, total, currency,
      shipping_name, shipping_email, shipping_address, shipping_city,
      shipping_postal_code, payment_method, payment_provider,
      transvoucher_transaction_id, transvoucher_reference_id, provider_status,
      failure_reason, remaining_balance, created_at, updated_at, paid_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      input.userId,
      "Pending",
      initialTransactionStatus === "failed" ? "failed" : "pending",
      pricing.subtotal,
      pricing.shipping,
      pricing.total,
      input.currency,
      shippingName,
      shippingEmail,
      shippingAddress,
      shippingCity,
      shippingPostalCode,
      input.paymentMethod,
      "TransVoucher",
      payment.transactionId,
      payment.referenceId,
      providerStatus || null,
      initialTransactionStatus === "failed"
        ? "Unable to initialize TransVoucher payment."
        : null,
      account.balance.available,
      timestamp,
      timestamp,
      null,
    ],
  );

  for (const item of input.items) {
    const product = productMap.get(item.productId)!;
    await execute(
      `insert into order_items (
        id, order_id, product_id, quantity, unit_price, delivery_type
      ) values (?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        orderId,
        product.id,
        item.quantity,
        product.price,
        item.deliveryType,
      ],
    );
  }

  await createTransactionRecord({
    id: transactionId,
    userId: input.userId,
    kind: "purchase",
    amount: -pricing.total,
    originalAmount: pricing.total,
    originalCurrency: input.currency,
    displayCurrency: input.currency,
    paymentMethod: input.paymentMethod,
    paymentProvider: "TransVoucher",
    transvoucherTransactionId: payment.transactionId,
    transvoucherReferenceId: payment.referenceId,
    paymentUrl: payment.paymentUrl,
    providerStatus: providerStatus || null,
    rawProviderResponse: toJson(payment.raw),
    status: initialTransactionStatus,
    referenceId: orderId,
    summary: "Awaiting TransVoucher payment confirmation",
    meta: {
      currency: input.currency,
      paymentMethod: input.paymentMethod,
      provider: "TransVoucher",
      paymentReference,
      paymentSessionId: sessionId,
      telegramUsername: account.user.telegramUsername,
      items: input.items,
    },
  });

  await execute(
    `insert into payment_sessions (
      id, user_id, payment_method, payment_provider, currency, subtotal,
      shipping, total, status, items_json, meta_json, order_id, transaction_id,
      transvoucher_transaction_id, transvoucher_reference_id, payment_url,
      provider_status, raw_provider_response, created_at, updated_at, expires_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      input.userId,
      input.paymentMethod,
      "TransVoucher",
      input.currency,
      pricing.subtotal,
      pricing.shipping,
      pricing.total,
      initialSessionStatus,
      toJson(input.items),
      toJson({
        internalOrderId: orderId,
        internalTransactionId: transactionId,
        successUrl,
        cancelUrl,
        redirectUrl,
      }),
      orderId,
      transactionId,
      payment.transactionId,
      payment.referenceId,
      payment.paymentUrl,
      providerStatus || null,
      toJson(payment.raw),
      timestamp,
      timestamp,
      expiresAt,
    ],
  );

  return {
    sessionId,
    paymentUrl: payment.paymentUrl,
    redirectPath: payment.paymentUrl,
  };
}

export async function createDepositPaymentSession(input: {
  userId: string;
  amount: number;
  paymentMethod: Exclude<PaymentMethodName, "Archive Balance">;
  provider: Exclude<PaymentProviderName, "Internal Wallet">;
  currency: SupportedCurrency;
}) {
  await ensureDatabase();

  if (input.amount <= 0) {
    throw new Error("Deposit amount must be greater than zero.");
  }

  if (input.provider !== "TransVoucher") {
    throw new Error("TransVoucher is the only active payment provider.");
  }

  if (input.paymentMethod === "Crypto") {
    throw new Error("Crypto deposits are not available in the TransVoucher flow.");
  }

  const account = await getUserAndBalance(input.userId);

  if (!account) {
    throw new Error("Unable to load collector account.");
  }

  const conversion = await convertAmount(input.amount, input.currency, "USD");
  const sessionId = randomUUID();
  const depositId = createReadableId("DEP");
  const transactionId = createReadableId("TXN");
  const timestamp = nowIso();
  const expiresAt = new Date(
    Date.now() + CHECKOUT_PAYMENT_SESSION_TTL_MINUTES * 60 * 1000,
  ).toISOString();
  const { successUrl, cancelUrl, redirectUrl } =
    buildTransVoucherReturnUrls(transactionId);
  const payment = await createTransVoucherPayment({
    amount: input.amount,
    currency: input.currency,
    title: `ReboHrome Deposit ${depositId}`,
    description: `Archive balance funding for ${account.user.username}`,
    successUrl,
    cancelUrl,
    redirectUrl,
    customerDetails: {
      username: account.user.username,
      telegramUsername: account.user.telegramUsername,
      email: account.user.email,
    },
    metadata: {
      type: "deposit",
      user_id: account.user.id,
      username: account.user.username,
      telegram_username: account.user.telegramUsername,
      internal_deposit_id: depositId,
      internal_transaction_id: transactionId,
    },
    defaultPaymentMethod: mapTransVoucherMethod(input.paymentMethod),
    paymentMethodForced: true,
  });
  const providerStatus = normalizeProviderStatus(payment.status);
  const mappedSessionStatus = mapProviderStatusToDepositSessionStatus(providerStatus);
  const mappedTransactionStatus = mapProviderStatusToTransactionStatus(providerStatus);
  const initialSessionStatus =
    mappedSessionStatus === "completed" ? "processing" : mappedSessionStatus;
  const initialTransactionStatus =
    mappedTransactionStatus === "completed" ? "processing" : mappedTransactionStatus;
  const paymentReference = buildTransVoucherPaymentReference({
    referenceId: payment.referenceId,
    transactionId: payment.transactionId,
  });

  await execute(
    `insert into deposits (
      id, user_id, amount, original_amount, original_currency, credited_amount_usd,
      exchange_rate, payment_method, payment_provider, transvoucher_transaction_id,
      transvoucher_reference_id, cardholder_name, card_masked, status, balance_before,
      balance_after, created_at, updated_at, completed_at, paid_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      depositId,
      input.userId,
      conversion.convertedAmount,
      input.amount,
      input.currency,
      conversion.convertedAmount,
      conversion.exchangeRate,
      input.paymentMethod,
      "TransVoucher",
      payment.transactionId,
      payment.referenceId,
      "TransVoucher hosted payment",
      paymentReference,
      initialTransactionStatus === "failed" ? "failed" : "processing",
      account.balance.available,
      account.balance.available,
      timestamp,
      timestamp,
      null,
      null,
    ],
  );

  await createTransactionRecord({
    id: transactionId,
    userId: input.userId,
    kind: "deposit",
    amount: conversion.convertedAmount,
    originalAmount: input.amount,
    originalCurrency: input.currency,
    displayCurrency: input.currency,
    creditedAmountUsd: conversion.convertedAmount,
    exchangeRate: conversion.exchangeRate,
    paymentMethod: input.paymentMethod,
    paymentProvider: "TransVoucher",
    transvoucherTransactionId: payment.transactionId,
    transvoucherReferenceId: payment.referenceId,
    paymentUrl: payment.paymentUrl,
    providerStatus: providerStatus || null,
    rawProviderResponse: toJson(payment.raw),
    status: initialTransactionStatus,
    referenceId: depositId,
    summary: "Awaiting TransVoucher deposit confirmation",
    meta: {
      originalAmount: input.amount,
      originalCurrency: input.currency,
      creditedAmountUsd: conversion.convertedAmount,
      exchangeRate: conversion.exchangeRate,
      paymentMethod: input.paymentMethod,
      provider: "TransVoucher",
      paymentReference,
      relatedOrderId: depositId,
      telegramUsername: account.user.telegramUsername,
    },
  });

  await execute(
    `insert into deposit_payment_sessions (
      id, user_id, payment_method, payment_provider, currency, original_amount,
      credited_amount_usd, exchange_rate, status, meta_json, deposit_id, transaction_id,
      transvoucher_transaction_id, transvoucher_reference_id, payment_url,
      provider_status, raw_provider_response, created_at, updated_at, expires_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      input.userId,
      input.paymentMethod,
      "TransVoucher",
      input.currency,
      input.amount,
      conversion.convertedAmount,
      conversion.exchangeRate,
      initialSessionStatus,
      toJson({
        internalDepositId: depositId,
        internalTransactionId: transactionId,
        successUrl,
        cancelUrl,
        redirectUrl,
      }),
      depositId,
      transactionId,
      payment.transactionId,
      payment.referenceId,
      payment.paymentUrl,
      providerStatus || null,
      toJson(payment.raw),
      timestamp,
      timestamp,
      expiresAt,
    ],
  );

  return {
    sessionId,
    paymentUrl: payment.paymentUrl,
    redirectPath: payment.paymentUrl,
  };
}

export async function getCheckoutPaymentSessionBundle(
  sessionId: string,
  userId: string,
) {
  await ensureDatabase();
  const row = await queryOne(
    "select * from payment_sessions where id = ? and user_id = ? limit 1",
    [sessionId, userId],
  );

  if (!row) {
    return null;
  }

  const session = normalizeCheckoutPaymentSession(row);
  const items = parseCheckoutSessionItems(session.itemsJson);
  const { productMap } = await resolveCheckoutProducts(items);

  return {
    session,
    items: items.map((item) => ({
      ...item,
      product: productMap.get(item.productId) ?? null,
      lineTotal: (productMap.get(item.productId)?.price ?? 0) * item.quantity,
    })),
  };
}

export async function getDepositPaymentSessionBundle(
  sessionId: string,
  userId: string,
) {
  await ensureDatabase();
  const row = await queryOne(
    "select * from deposit_payment_sessions where id = ? and user_id = ? limit 1",
    [sessionId, userId],
  );

  if (!row) {
    return null;
  }

  return {
    session: normalizeDepositPaymentSession(row),
  };
}

export async function finalizeCheckoutPaymentSession(input: {
  sessionId: string;
  userId: string;
  cardholderName?: string;
  cardNumber?: string;
  expiration?: string;
  cvv?: string;
  billingCountry?: string;
  cryptoNetwork?: CryptoNetwork | null;
}) {
  await ensureDatabase();
  const row = await queryOne(
    "select * from payment_sessions where id = ? and user_id = ? limit 1",
    [input.sessionId, input.userId],
  );

  if (!row) {
    throw new Error("Payment session not found.");
  }

  const session = normalizeCheckoutPaymentSession(row);

  if (session.status !== "pending") {
    throw new Error("This payment session can no longer be processed.");
  }

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await execute(
      "update payment_sessions set status = ?, updated_at = ? where id = ?",
      ["expired", nowIso(), session.id],
    );
    throw new Error("This secure payment session has expired.");
  }

  const result = await createCheckoutOrder({
    userId: input.userId,
    paymentMethod: session.paymentMethod,
    provider: session.paymentProvider,
    currency: session.currency,
    cardholderName: input.cardholderName,
    cardNumber: input.cardNumber,
    billingCountry: input.billingCountry,
    cryptoNetwork: input.cryptoNetwork ?? null,
    items: parseCheckoutSessionItems(session.itemsJson),
    paymentSessionId: session.id,
  });

  await execute(
    `update payment_sessions set
      status = ?,
      order_id = ?,
      transaction_id = ?,
      updated_at = ?
     where id = ?`,
    [
      result.ok ? "completed" : "failed",
      result.orderId,
      result.transactionId,
      nowIso(),
      session.id,
    ],
  );

  return result;
}

export async function finalizeDepositPaymentSession(input: {
  sessionId: string;
  userId: string;
  cardholderName?: string;
  cardNumber?: string;
  expiration?: string;
  cvv?: string;
  billingCountry?: string;
  cryptoNetwork?: CryptoNetwork | null;
}) {
  await ensureDatabase();
  const row = await queryOne(
    "select * from deposit_payment_sessions where id = ? and user_id = ? limit 1",
    [input.sessionId, input.userId],
  );

  if (!row) {
    throw new Error("Deposit payment session not found.");
  }

  const session = normalizeDepositPaymentSession(row);

  if (session.status !== "pending") {
    throw new Error("This deposit payment session can no longer be processed.");
  }

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await execute(
      "update deposit_payment_sessions set status = ?, updated_at = ? where id = ?",
      ["expired", nowIso(), session.id],
    );
    throw new Error("This secure payment session has expired.");
  }

  const result = await createDeposit({
    userId: input.userId,
    amount: session.originalAmount,
    currency: session.currency,
    paymentMethod: session.paymentMethod as Exclude<
      PaymentMethodName,
      "Archive Balance"
    >,
    provider: session.paymentProvider as Exclude<
      PaymentProviderName,
      "Internal Wallet"
    >,
    cardholderName: input.cardholderName,
    cardNumber: input.cardNumber,
    billingCountry: input.billingCountry,
    cryptoNetwork: input.cryptoNetwork ?? null,
  });

  await execute(
    `update deposit_payment_sessions set
      status = ?,
      deposit_id = ?,
      transaction_id = ?,
      meta_json = ?,
      updated_at = ?
     where id = ?`,
    [
      result.ok ? "completed" : "failed",
      result.depositId,
      result.transactionId,
      toJson({
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        originalAmount: result.originalAmount,
        originalCurrency: result.originalCurrency,
        creditedAmountUsd: result.creditedAmountUsd,
        exchangeRate: result.exchangeRate,
        paymentMethod: result.paymentMethod,
        provider: result.provider,
        paymentReference: result.paymentReference,
        timestamp: result.timestamp,
        reason: !result.ok ? result.reason : null,
      }),
      nowIso(),
      session.id,
    ],
  );

  return result;
}

export async function recordTransVoucherInvalidSignatureAttempt(input: {
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  route: string;
  timestamp: string;
}) {
  await ensureDatabase();
  await insertSecurityAuditEvent({
    eventType: "transvoucher_invalid_signature",
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp: input.timestamp,
  });
}

async function reconcileTransVoucherPurchase(input: {
  transaction: TransactionRecord;
  order: OrderRecord;
  session: CheckoutPaymentSessionRecord | null;
  providerStatus: string;
  providerTransactionId: string | null;
  providerReferenceId: string | null;
  paymentUrl: string | null;
  paidAt: string | null;
  rawProviderResponse: unknown;
}) {
  const timestamp = nowIso();
  const rawProviderResponse = toJson(input.rawProviderResponse);
  const paymentReference = buildTransVoucherPaymentReference({
    referenceId: input.providerReferenceId,
    transactionId: input.providerTransactionId,
  });
  const mergedMeta = {
    ...getTransactionMeta(input.transaction),
    provider: "TransVoucher",
    paymentReference,
    transvoucherTransactionId: input.providerTransactionId,
    transvoucherReferenceId: input.providerReferenceId,
    providerStatus: input.providerStatus,
    paymentUrl: input.paymentUrl,
    paidAt: input.paidAt,
  };

  if (isProviderCompletedStatus(input.providerStatus)) {
    let remainingBalance = input.order.remainingBalance ?? 0;

    if (input.order.paymentState !== "completed") {
      const account = await getUserAndBalance(input.order.userId);

      if (!account) {
        throw new Error("Unable to load collector account for TransVoucher reconciliation.");
      }

      const itemRows = await queryMany(
        `select
          order_items.product_id,
          order_items.quantity,
          order_items.delivery_type,
          products.*
         from order_items
         inner join products on products.id = order_items.product_id
         where order_items.order_id = ?`,
        [input.order.id],
      );

      const items = itemRows.map((row) => ({
        productId: String(row.product_id),
        quantity: Number(row.quantity),
        deliveryType: row.delivery_type as DeliveryType,
        product: normalizeProduct(row),
      }));

      for (const item of items) {
        if (item.product.stock < item.quantity) {
          throw new Error(`${item.product.title} no longer has enough stock to fulfill this payment.`);
        }
      }

      for (const item of items) {
        await execute(
          "update products set stock = stock - ?, updated_at = ? where id = ?",
          [item.quantity, timestamp, item.product.id],
        );

        await execute(
          `insert into owned_cards (
            id, user_id, product_id, order_id, quantity, acquired_at
          ) values (?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            input.order.userId,
            item.product.id,
            input.order.id,
            item.quantity,
            input.paidAt ?? timestamp,
          ],
        );
      }

      await execute(
        `update balances set
          total_spent = total_spent + ?,
          updated_at = ?
         where user_id = ?`,
        [input.order.total, timestamp, input.order.userId],
      );

      remainingBalance = account.balance.available;
      await clearUserCartItems(input.order.userId);

      await notifySafely(() =>
        sendPurchaseNotification({
          username: account.user.username,
          telegramUsername: account.user.telegramUsername,
          orderId: input.order.id,
          total: input.order.total,
          currency: input.order.currency,
          paymentMethod: input.order.paymentMethod,
          provider: "TransVoucher",
          transactionId: input.providerTransactionId,
          referenceId: input.providerReferenceId,
          items: items.map((item) => ({
            title: item.product.title,
            quantity: item.quantity,
          })),
          timestamp: input.paidAt ?? timestamp,
        }),
      );
    }

    await execute(
      `update orders set
        status = ?,
        payment_state = ?,
        failure_reason = null,
        remaining_balance = ?,
        transvoucher_transaction_id = ?,
        transvoucher_reference_id = ?,
        provider_status = ?,
        paid_at = ?,
        updated_at = ?
       where id = ?`,
      [
        input.order.shipping > 0 ? "Processing" : "Completed",
        "completed",
        remainingBalance,
        input.providerTransactionId,
        input.providerReferenceId,
        input.providerStatus,
        input.paidAt ?? timestamp,
        timestamp,
        input.order.id,
      ],
    );

    await execute(
      `update transactions set
        payment_provider = ?,
        transvoucher_transaction_id = ?,
        transvoucher_reference_id = ?,
        payment_url = ?,
        provider_status = ?,
        raw_provider_response = ?,
        status = ?,
        summary = ?,
        meta_json = ?,
        paid_at = ?,
        updated_at = ?
       where id = ?`,
      [
        "TransVoucher",
        input.providerTransactionId,
        input.providerReferenceId,
        input.paymentUrl,
        input.providerStatus,
        rawProviderResponse,
        "completed",
        "Card purchase completed",
        toJson(mergedMeta),
        input.paidAt ?? timestamp,
        timestamp,
        input.transaction.id,
      ],
    );

    if (input.session) {
      await execute(
        `update payment_sessions set
          status = ?,
          transvoucher_transaction_id = ?,
          transvoucher_reference_id = ?,
          payment_url = ?,
          provider_status = ?,
          raw_provider_response = ?,
          updated_at = ?
         where id = ?`,
        [
          "completed",
          input.providerTransactionId,
          input.providerReferenceId,
          input.paymentUrl,
          input.providerStatus,
          rawProviderResponse,
          timestamp,
          input.session.id,
        ],
      );
    }

    revalidateStorefront();
    revalidatePrivate(input.order.userId);
    revalidateAdmin();
    return;
  }

  if (isProviderFailedStatus(input.providerStatus)) {
    const failureReason =
      extractProviderFailureReason(input.rawProviderResponse) ??
      "Payment failed or was declined by TransVoucher.";

    if (
      input.order.paymentState !== "completed" &&
      input.order.paymentState !== "failed"
    ) {
      const user = await getUserById(input.order.userId);
      await notifySafely(() =>
        sendPurchaseFailureNotification({
          username: user?.username ?? "collector",
          telegramUsername: user?.telegramUsername ?? "@unknown",
          orderId: input.order.id,
          amount: input.order.total,
          currency: input.order.currency,
          paymentMethod: `${input.order.paymentMethod} ${paymentReference}`,
          provider: "TransVoucher",
          transactionId: input.providerTransactionId,
          referenceId: input.providerReferenceId,
          reason: failureReason,
          timestamp: input.paidAt ?? timestamp,
        }),
      );
    }

    if (input.order.paymentState !== "completed") {
      await execute(
        `update orders set
          status = ?,
          payment_state = ?,
          failure_reason = ?,
          transvoucher_transaction_id = ?,
          transvoucher_reference_id = ?,
          provider_status = ?,
          updated_at = ?
         where id = ?`,
        [
          "Declined",
          "failed",
          failureReason,
          input.providerTransactionId,
          input.providerReferenceId,
          input.providerStatus,
          timestamp,
          input.order.id,
        ],
      );
    }

    await execute(
      `update transactions set
        payment_provider = ?,
        transvoucher_transaction_id = ?,
        transvoucher_reference_id = ?,
        payment_url = ?,
        provider_status = ?,
        raw_provider_response = ?,
        status = ?,
        summary = ?,
        meta_json = ?,
        updated_at = ?
       where id = ?`,
      [
        "TransVoucher",
        input.providerTransactionId,
        input.providerReferenceId,
        input.paymentUrl,
        input.providerStatus,
        rawProviderResponse,
        "failed",
        "Purchase declined",
        toJson({
          ...mergedMeta,
          reason: failureReason,
        }),
        timestamp,
        input.transaction.id,
      ],
    );

    if (input.session) {
      await execute(
        `update payment_sessions set
          status = ?,
          transvoucher_transaction_id = ?,
          transvoucher_reference_id = ?,
          payment_url = ?,
          provider_status = ?,
          raw_provider_response = ?,
          updated_at = ?
         where id = ?`,
        [
          "failed",
          input.providerTransactionId,
          input.providerReferenceId,
          input.paymentUrl,
          input.providerStatus,
          rawProviderResponse,
          timestamp,
          input.session.id,
        ],
      );
    }

    revalidatePrivate(input.order.userId);
    revalidateAdmin();
    return;
  }

  if (input.order.paymentState !== "completed") {
    await execute(
      `update orders set
        status = ?,
        payment_state = ?,
        failure_reason = null,
        transvoucher_transaction_id = ?,
        transvoucher_reference_id = ?,
        provider_status = ?,
        updated_at = ?
       where id = ?`,
      [
        "Pending",
        "pending",
        input.providerTransactionId,
        input.providerReferenceId,
        input.providerStatus,
        timestamp,
        input.order.id,
      ],
    );
  }

  await execute(
    `update transactions set
      payment_provider = ?,
      transvoucher_transaction_id = ?,
      transvoucher_reference_id = ?,
      payment_url = ?,
      provider_status = ?,
      raw_provider_response = ?,
      status = ?,
      summary = ?,
      meta_json = ?,
      updated_at = ?
     where id = ?`,
    [
      "TransVoucher",
      input.providerTransactionId,
      input.providerReferenceId,
      input.paymentUrl,
      input.providerStatus,
      rawProviderResponse,
      mapProviderStatusToTransactionStatus(input.providerStatus),
      "TransVoucher payment status updated",
      toJson(mergedMeta),
      timestamp,
      input.transaction.id,
    ],
  );

  if (input.session) {
    await execute(
      `update payment_sessions set
        status = ?,
        transvoucher_transaction_id = ?,
        transvoucher_reference_id = ?,
        payment_url = ?,
        provider_status = ?,
        raw_provider_response = ?,
        updated_at = ?
       where id = ?`,
      [
        mapProviderStatusToCheckoutSessionStatus(input.providerStatus),
        input.providerTransactionId,
        input.providerReferenceId,
        input.paymentUrl,
        input.providerStatus,
        rawProviderResponse,
        timestamp,
        input.session.id,
      ],
    );
  }
}

async function reconcileTransVoucherDeposit(input: {
  transaction: TransactionRecord;
  deposit: DepositRecord;
  session: DepositPaymentSessionRecord | null;
  providerStatus: string;
  providerTransactionId: string | null;
  providerReferenceId: string | null;
  paymentUrl: string | null;
  paidAt: string | null;
  rawProviderResponse: unknown;
}) {
  const timestamp = nowIso();
  const rawProviderResponse = toJson(input.rawProviderResponse);
  const paymentReference = buildTransVoucherPaymentReference({
    referenceId: input.providerReferenceId,
    transactionId: input.providerTransactionId,
  });
  const mergedMeta = {
    ...getTransactionMeta(input.transaction),
    provider: "TransVoucher",
    paymentReference,
    transvoucherTransactionId: input.providerTransactionId,
    transvoucherReferenceId: input.providerReferenceId,
    providerStatus: input.providerStatus,
    paymentUrl: input.paymentUrl,
    paidAt: input.paidAt,
  };

  if (isProviderCompletedStatus(input.providerStatus)) {
    let balanceAfter = input.deposit.balanceAfter;

    if (input.deposit.status !== "completed") {
      const account = await getUserAndBalance(input.deposit.userId);

      if (!account) {
        throw new Error("Unable to load collector account for deposit reconciliation.");
      }

      balanceAfter = Number(
        (
          account.balance.available +
          (input.deposit.creditedAmountUsd ?? input.deposit.amount)
        ).toFixed(2),
      );

      await execute(
        `update balances set
          available = ?,
          total_deposited = total_deposited + ?,
          updated_at = ?
         where user_id = ?`,
        [
          balanceAfter,
          input.deposit.creditedAmountUsd ?? input.deposit.amount,
          timestamp,
          input.deposit.userId,
        ],
      );

      const user = await getUserById(input.deposit.userId);
      await notifySafely(() =>
        sendDepositNotification({
          username: user?.username ?? "collector",
          telegramUsername: user?.telegramUsername ?? "@unknown",
          depositId: input.deposit.id,
          originalAmount: input.deposit.originalAmount ?? input.deposit.amount,
          originalCurrency: input.deposit.originalCurrency ?? "USD",
          creditedAmountUsd:
            input.deposit.creditedAmountUsd ?? input.deposit.amount,
          exchangeRate: input.deposit.exchangeRate ?? 1,
          paymentMethod: input.deposit.paymentMethod,
          provider: "TransVoucher",
          transactionId: input.providerTransactionId,
          referenceId: input.providerReferenceId,
          timestamp: input.paidAt ?? timestamp,
        }),
      );
    }

    await execute(
      `update deposits set
        payment_provider = ?,
        transvoucher_transaction_id = ?,
        transvoucher_reference_id = ?,
        card_masked = ?,
        status = ?,
        balance_after = ?,
        completed_at = ?,
        paid_at = ?,
        updated_at = ?
       where id = ?`,
      [
        "TransVoucher",
        input.providerTransactionId,
        input.providerReferenceId,
        paymentReference,
        "completed",
        balanceAfter,
        input.paidAt ?? timestamp,
        input.paidAt ?? timestamp,
        timestamp,
        input.deposit.id,
      ],
    );

    await execute(
      `update transactions set
        payment_provider = ?,
        transvoucher_transaction_id = ?,
        transvoucher_reference_id = ?,
        payment_url = ?,
        provider_status = ?,
        raw_provider_response = ?,
        status = ?,
        summary = ?,
        meta_json = ?,
        paid_at = ?,
        updated_at = ?
       where id = ?`,
      [
        "TransVoucher",
        input.providerTransactionId,
        input.providerReferenceId,
        input.paymentUrl,
        input.providerStatus,
        rawProviderResponse,
        "completed",
        "Deposit completed",
        toJson(mergedMeta),
        input.paidAt ?? timestamp,
        timestamp,
        input.transaction.id,
      ],
    );

    if (input.session) {
      await execute(
        `update deposit_payment_sessions set
          status = ?,
          transvoucher_transaction_id = ?,
          transvoucher_reference_id = ?,
          payment_url = ?,
          provider_status = ?,
          raw_provider_response = ?,
          updated_at = ?
         where id = ?`,
        [
          "completed",
          input.providerTransactionId,
          input.providerReferenceId,
          input.paymentUrl,
          input.providerStatus,
          rawProviderResponse,
          timestamp,
          input.session.id,
        ],
      );
    }

    revalidatePrivate(input.deposit.userId);
    revalidateAdmin();
    return;
  }

  if (isProviderFailedStatus(input.providerStatus)) {
    const failureReason =
      extractProviderFailureReason(input.rawProviderResponse) ??
      "Payment failed or was declined by TransVoucher.";

    if (input.deposit.status !== "completed" && input.deposit.status !== "failed") {
      const user = await getUserById(input.deposit.userId);
      await notifySafely(() =>
        sendDepositFailureNotification({
          username: user?.username ?? "collector",
          telegramUsername: user?.telegramUsername ?? "@unknown",
          depositId: input.deposit.id,
          amount: input.deposit.originalAmount ?? input.deposit.amount,
          currency: input.deposit.originalCurrency ?? "USD",
          paymentMethod: `${input.deposit.paymentMethod} ${paymentReference}`,
          provider: "TransVoucher",
          transactionId: input.providerTransactionId,
          referenceId: input.providerReferenceId,
          reason: failureReason,
          timestamp: input.paidAt ?? timestamp,
        }),
      );
    }

    await execute(
      `update deposits set
        payment_provider = ?,
        transvoucher_transaction_id = ?,
        transvoucher_reference_id = ?,
        card_masked = ?,
        status = ?,
        balance_after = balance_before,
        updated_at = ?
       where id = ?`,
      [
        "TransVoucher",
        input.providerTransactionId,
        input.providerReferenceId,
        paymentReference,
        "failed",
        timestamp,
        input.deposit.id,
      ],
    );

    await execute(
      `update transactions set
        payment_provider = ?,
        transvoucher_transaction_id = ?,
        transvoucher_reference_id = ?,
        payment_url = ?,
        provider_status = ?,
        raw_provider_response = ?,
        status = ?,
        summary = ?,
        meta_json = ?,
        updated_at = ?
       where id = ?`,
      [
        "TransVoucher",
        input.providerTransactionId,
        input.providerReferenceId,
        input.paymentUrl,
        input.providerStatus,
        rawProviderResponse,
        "failed",
        "Deposit failed",
        toJson({
          ...mergedMeta,
          reason: failureReason,
        }),
        timestamp,
        input.transaction.id,
      ],
    );

    if (input.session) {
      await execute(
        `update deposit_payment_sessions set
          status = ?,
          transvoucher_transaction_id = ?,
          transvoucher_reference_id = ?,
          payment_url = ?,
          provider_status = ?,
          raw_provider_response = ?,
          updated_at = ?
         where id = ?`,
        [
          "failed",
          input.providerTransactionId,
          input.providerReferenceId,
          input.paymentUrl,
          input.providerStatus,
          rawProviderResponse,
          timestamp,
          input.session.id,
        ],
      );
    }

    revalidatePrivate(input.deposit.userId);
    revalidateAdmin();
    return;
  }

  await execute(
    `update deposits set
      payment_provider = ?,
      transvoucher_transaction_id = ?,
      transvoucher_reference_id = ?,
      card_masked = ?,
      status = ?,
      updated_at = ?
     where id = ?`,
    [
      "TransVoucher",
      input.providerTransactionId,
      input.providerReferenceId,
      paymentReference,
      "processing",
      timestamp,
      input.deposit.id,
    ],
  );

  await execute(
    `update transactions set
      payment_provider = ?,
      transvoucher_transaction_id = ?,
      transvoucher_reference_id = ?,
      payment_url = ?,
      provider_status = ?,
      raw_provider_response = ?,
      status = ?,
      summary = ?,
      meta_json = ?,
      updated_at = ?
     where id = ?`,
    [
      "TransVoucher",
      input.providerTransactionId,
      input.providerReferenceId,
      input.paymentUrl,
      input.providerStatus,
      rawProviderResponse,
      mapProviderStatusToTransactionStatus(input.providerStatus),
      "TransVoucher deposit status updated",
      toJson(mergedMeta),
      timestamp,
      input.transaction.id,
    ],
  );

  if (input.session) {
    await execute(
      `update deposit_payment_sessions set
        status = ?,
        transvoucher_transaction_id = ?,
        transvoucher_reference_id = ?,
        payment_url = ?,
        provider_status = ?,
        raw_provider_response = ?,
        updated_at = ?
       where id = ?`,
      [
        mapProviderStatusToDepositSessionStatus(input.providerStatus),
        input.providerTransactionId,
        input.providerReferenceId,
        input.paymentUrl,
        input.providerStatus,
        rawProviderResponse,
        timestamp,
        input.session.id,
      ],
    );
  }
}

async function applyTransVoucherPaymentStatus(input: {
  transactionId?: string | null;
  providerTransactionId?: string | null;
  providerReferenceId?: string | null;
  providerStatus: string;
  paymentUrl?: string | null;
  paidAt?: string | null;
  rawProviderResponse: unknown;
}) {
  await ensureDatabase();

  const transactionRow = input.transactionId
    ? await queryOne("select * from transactions where id = ? limit 1", [
        input.transactionId,
      ])
    : input.providerTransactionId
      ? await queryOne(
          "select * from transactions where transvoucher_transaction_id = ? limit 1",
          [input.providerTransactionId],
        )
      : null;

  if (!transactionRow) {
    return null;
  }

  const transaction = normalizeTransaction(transactionRow);

  if (transaction.kind === "purchase") {
    const [orderRow, sessionRow] = await Promise.all([
      queryOne("select * from orders where id = ? limit 1", [transaction.referenceId]),
      queryOne("select * from payment_sessions where transaction_id = ? limit 1", [
        transaction.id,
      ]),
    ]);

    if (!orderRow) {
      return null;
    }

    await reconcileTransVoucherPurchase({
      transaction,
      order: normalizeOrder(orderRow),
      session: sessionRow ? normalizeCheckoutPaymentSession(sessionRow) : null,
      providerStatus: normalizeProviderStatus(input.providerStatus),
      providerTransactionId:
        input.providerTransactionId ?? transaction.transvoucherTransactionId,
      providerReferenceId:
        input.providerReferenceId ?? transaction.transvoucherReferenceId,
      paymentUrl: input.paymentUrl ?? transaction.paymentUrl,
      paidAt: input.paidAt ?? transaction.paidAt,
      rawProviderResponse: input.rawProviderResponse,
    });
  } else if (transaction.kind === "deposit") {
    const [depositRow, sessionRow] = await Promise.all([
      queryOne("select * from deposits where id = ? limit 1", [transaction.referenceId]),
      queryOne(
        "select * from deposit_payment_sessions where transaction_id = ? limit 1",
        [transaction.id],
      ),
    ]);

    if (!depositRow) {
      return null;
    }

    await reconcileTransVoucherDeposit({
      transaction,
      deposit: normalizeDeposit(depositRow),
      session: sessionRow ? normalizeDepositPaymentSession(sessionRow) : null,
      providerStatus: normalizeProviderStatus(input.providerStatus),
      providerTransactionId:
        input.providerTransactionId ?? transaction.transvoucherTransactionId,
      providerReferenceId:
        input.providerReferenceId ?? transaction.transvoucherReferenceId,
      paymentUrl: input.paymentUrl ?? transaction.paymentUrl,
      paidAt: input.paidAt ?? transaction.paidAt,
      rawProviderResponse: input.rawProviderResponse,
    });
  }

  const updatedRow = await queryOne("select * from transactions where id = ? limit 1", [
    transaction.id,
  ]);

  return updatedRow ? normalizeTransaction(updatedRow) : transaction;
}

export async function refreshTransVoucherTransactionStatus(
  transactionId: string,
  userId?: string,
) {
  await ensureDatabase();
  const transactionRow = await queryOne(
    userId
      ? "select * from transactions where id = ? and user_id = ? limit 1"
      : "select * from transactions where id = ? limit 1",
    userId ? [transactionId, userId] : [transactionId],
  );

  if (!transactionRow) {
    return null;
  }

  const transaction = normalizeTransaction(transactionRow);

  if (transaction.paymentProvider !== "TransVoucher") {
    return transaction;
  }

  if (!transaction.transvoucherTransactionId) {
    return transaction;
  }

  const providerStatus = await getTransVoucherPaymentStatus(
    transaction.transvoucherTransactionId,
  );

  return applyTransVoucherPaymentStatus({
    transactionId: transaction.id,
    providerTransactionId: providerStatus.transactionId,
    providerReferenceId: providerStatus.referenceId,
    providerStatus: providerStatus.status,
    paymentUrl: providerStatus.paymentUrl,
    paidAt: providerStatus.paidAt,
    rawProviderResponse: providerStatus.raw,
  });
}

export async function getTransactionById(transactionId: string, userId?: string) {
  await ensureDatabase();
  const transactionRow = await queryOne(
    userId
      ? "select * from transactions where id = ? and user_id = ? limit 1"
      : "select * from transactions where id = ? limit 1",
    userId ? [transactionId, userId] : [transactionId],
  );

  return transactionRow ? normalizeTransaction(transactionRow) : null;
}

export function getTransactionResultTarget(transaction: TransactionRecord | null) {
  if (!transaction) {
    return null;
  }

  if (transaction.kind === "purchase") {
    if (transaction.status === "completed") {
      return `/success?order=${encodeURIComponent(transaction.referenceId)}`;
    }

    if (transaction.status === "failed") {
      return `/checkout/declined?order=${encodeURIComponent(transaction.referenceId)}`;
    }

    return `/checkout?pending=${encodeURIComponent(transaction.referenceId)}`;
  }

  if (transaction.kind === "deposit") {
    if (transaction.status === "completed") {
      return `/dashboard/deposit?receipt=${encodeURIComponent(transaction.referenceId)}`;
    }

    if (transaction.status === "failed") {
      return `/dashboard/deposit?failed=${encodeURIComponent(transaction.referenceId)}`;
    }

    return `/dashboard/deposit?pending=${encodeURIComponent(transaction.referenceId)}`;
  }

  return null;
}

function extractWebhookRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

export async function processTransVoucherWebhookPayload(
  payload: Record<string, unknown>,
) {
  await ensureDatabase();

  const eventType =
    typeof payload.type === "string"
      ? payload.type
      : typeof payload.event === "string"
        ? payload.event
        : "";
  const envelope = extractWebhookRecord(
    payload.data ?? payload.result ?? payload.payment_intent ?? payload.payment ?? payload,
  );
  const metadata = extractWebhookRecord(envelope.metadata ?? payload.metadata);
  const localTransactionId =
    typeof metadata.internal_transaction_id === "string"
      ? metadata.internal_transaction_id
      : null;
  const providerTransactionId =
    typeof envelope.transaction_id === "string"
      ? envelope.transaction_id
      : typeof envelope.transactionId === "string"
        ? envelope.transactionId
        : null;
  const providerReferenceId =
    typeof envelope.reference_id === "string"
      ? envelope.reference_id
      : typeof envelope.referenceId === "string"
        ? envelope.referenceId
        : null;
  const providerStatus =
    typeof envelope.status === "string"
      ? envelope.status
      : eventType === "payment_intent.succeeded"
        ? "succeeded"
        : eventType === "payment_intent.failed"
          ? "failed"
          : eventType === "payment_intent.processing"
            ? "processing"
            : eventType === "payment_intent.attempting"
              ? "attempting"
              : "pending";
  const paidAt =
    typeof envelope.paid_at === "string"
      ? envelope.paid_at
      : typeof envelope.paidAt === "string"
        ? envelope.paidAt
        : null;
  const paymentUrl =
    typeof envelope.payment_url === "string"
      ? envelope.payment_url
      : typeof envelope.paymentUrl === "string"
        ? envelope.paymentUrl
        : null;

  const transaction = await applyTransVoucherPaymentStatus({
    transactionId: localTransactionId,
    providerTransactionId,
    providerReferenceId,
    providerStatus,
    paymentUrl,
    paidAt,
    rawProviderResponse: payload,
  });

  return {
    ok: true as const,
    eventType,
    transactionId: transaction?.id ?? null,
    status: transaction?.status ?? null,
    skipped: !transaction,
  };
}

export async function getTransVoucherRedirectTarget(
  transactionId: string,
  userId?: string,
) {
  const transaction = await refreshTransVoucherTransactionStatus(transactionId, userId);
  return getTransactionResultTarget(transaction);
}

export async function replaceUserCartItems(
  userId: string,
  items: Array<{ productId: string; quantity: number; deliveryType: DeliveryType }>,
) {
  await ensureDatabase();
  await execute("delete from cart_items where user_id = ?", [userId]);

  const timestamp = nowIso();
  for (const item of items) {
    if (item.quantity <= 0) {
      continue;
    }

    await execute(
      `insert into cart_items (
        id, user_id, product_id, quantity, delivery_type, updated_at
      ) values (?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        userId,
        item.productId,
        item.quantity,
        item.deliveryType,
        timestamp,
      ],
    );
  }
}

export async function getUserCartItems(userId: string) {
  await ensureDatabase();
  const rows = await queryMany(
    "select product_id, quantity, delivery_type from cart_items where user_id = ? order by updated_at desc",
    [userId],
  );

  return rows.map((row) => ({
    productId: String(row.product_id),
    quantity: Number(row.quantity),
    deliveryType: row.delivery_type as DeliveryType,
  }));
}

export async function clearUserCartItems(userId: string) {
  await ensureDatabase();
  await execute("delete from cart_items where user_id = ?", [userId]);
}

export async function createCheckoutOrder(input: {
  userId: string;
  paymentMethod: PaymentMethodName;
  provider: PaymentProviderName;
  currency: SupportedCurrency;
  cardholderName?: string;
  cardNumber?: string;
  billingCountry?: string;
  cryptoNetwork?: CryptoNetwork | null;
  shippingName?: string;
  shippingEmail?: string;
  shippingAddress?: string;
  shippingCity?: string;
  shippingPostalCode?: string;
  paymentSessionId?: string | null;
  items: Array<{
    productId: string;
    quantity: number;
    deliveryType: DeliveryType;
  }>;
}) {
  await ensureDatabase();

  const account = await getUserAndBalance(input.userId);

  if (!account) {
    throw new Error("Unable to load collector account.");
  }

  const checkoutCurrency =
    input.paymentMethod === "Archive Balance" ? "USD" : input.currency;

  if (input.paymentMethod !== "Archive Balance" && input.provider !== "TransVoucher") {
    throw new Error("TransVoucher is the only active payment provider.");
  }

  const { productMap } = await resolveCheckoutProducts(input.items);
  const { subtotal, shipping, total } = calculateCheckoutTotals(
    input.items,
    productMap,
  );
  const orderId = createReadableId("ORD");
  const timestamp = nowIso();
  const paymentReference = getPaymentReference({
    paymentMethod: input.paymentMethod,
    cardNumber: input.cardNumber,
    cryptoNetwork: input.cryptoNetwork,
  });
  const paymentProvider =
    input.paymentMethod === "Archive Balance" ? "Internal Wallet" : input.provider;
  const shippingName =
    input.shippingName?.trim() || account.user.name || account.user.username;
  const shippingEmail =
    input.shippingEmail?.trim() || account.user.email;
  const shippingAddress =
    input.shippingAddress?.trim() ||
    (shipping > 0 ? "Archive delivery managed after payment confirmation." : "Digital delivery");
  const shippingCity = input.shippingCity?.trim() || "Archive";
  const shippingPostalCode = input.shippingPostalCode?.trim() || "00000";

  await execute(
    `insert into orders (
      id, user_id, status, payment_state, subtotal, shipping, total,
      shipping_name, shipping_email, shipping_address, shipping_city,
      shipping_postal_code, payment_method, payment_provider, currency,
      failure_reason, remaining_balance, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      input.userId,
      "Pending",
      "pending",
      subtotal,
      shipping,
      total,
      shippingName,
      shippingEmail,
      shippingAddress,
      shippingCity,
      shippingPostalCode,
      input.paymentMethod,
      paymentProvider,
      checkoutCurrency,
      null,
      account.balance.available,
      timestamp,
      timestamp,
    ],
  );

  for (const item of input.items) {
    const product = productMap.get(item.productId)!;
    await execute(
      `insert into order_items (
        id, order_id, product_id, quantity, unit_price, delivery_type
      ) values (?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        orderId,
        product.id,
        item.quantity,
        product.price,
        item.deliveryType,
      ],
    );
  }

  const digits = input.cardNumber?.replace(/\D+/g, "") ?? "";
  let failureReason: string | null = null;

  if (input.paymentMethod === "Archive Balance" && account.balance.available < total) {
    failureReason = "Insufficient archive balance";
  } else if (input.paymentMethod === "Credit Card" && digits.endsWith("0000")) {
    failureReason = "Payment was declined by the issuing bank.";
  }

  if (failureReason) {
    await execute(
      `update orders set
        status = ?,
        payment_state = ?,
        failure_reason = ?,
        remaining_balance = ?,
        updated_at = ?
       where id = ?`,
      ["Declined", "failed", failureReason, account.balance.available, timestamp, orderId],
    );

    const transactionId = await createTransactionRecord({
      userId: input.userId,
      kind: "purchase",
      amount: -total,
      originalAmount: total,
      originalCurrency: checkoutCurrency,
      displayCurrency: checkoutCurrency,
      paymentMethod: input.paymentMethod,
      paymentProvider,
      status: "failed",
      referenceId: orderId,
      summary: "Purchase declined",
      meta: {
        reason: failureReason,
        currency: checkoutCurrency,
        paymentMethod: input.paymentMethod,
        provider: paymentProvider,
        paymentReference,
        billingCountry: input.billingCountry ?? null,
        cryptoNetwork: input.cryptoNetwork ?? null,
        relatedOrderId: orderId,
        paymentSessionId: input.paymentSessionId ?? null,
        telegramUsername: account.user.telegramUsername,
      },
    });

    await notifySafely(() =>
      sendPurchaseFailureNotification({
        username: account.user.username,
        telegramUsername: account.user.telegramUsername,
        orderId,
        amount: total,
        currency: checkoutCurrency,
        paymentMethod: `${input.paymentMethod} ${paymentReference}`,
        reason: failureReason,
        timestamp,
      }),
    );

    revalidatePrivate(input.userId);

    return {
      ok: false as const,
      orderId,
      transactionId,
      reason: failureReason,
      paymentMethod: input.paymentMethod,
      provider: paymentProvider,
      currency: checkoutCurrency,
      paymentReference,
      remainingBalance: account.balance.available,
      timestamp,
      telegramUsername: account.user.telegramUsername,
    };
  }

  for (const item of input.items) {
    const product = productMap.get(item.productId)!;

    await execute(
      "update products set stock = stock - ?, updated_at = ? where id = ?",
      [item.quantity, timestamp, product.id],
    );

    await execute(
      `insert into owned_cards (
        id, user_id, product_id, order_id, quantity, acquired_at
      ) values (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), input.userId, product.id, orderId, item.quantity, timestamp],
    );
  }

  const status: OrderStatus = shipping > 0 ? "Processing" : "Completed";
  const remainingBalance =
    input.paymentMethod === "Archive Balance"
      ? account.balance.available - total
      : account.balance.available;

  if (input.paymentMethod === "Archive Balance") {
    await execute(
      `update balances set
        available = ?,
        total_spent = total_spent + ?,
        updated_at = ?
       where user_id = ?`,
      [remainingBalance, total, timestamp, input.userId],
    );
  } else {
    await execute(
      `update balances set
        total_spent = total_spent + ?,
        updated_at = ?
       where user_id = ?`,
      [total, timestamp, input.userId],
    );
  }

  await execute(
    `update orders set
      status = ?,
      payment_state = ?,
      remaining_balance = ?,
      updated_at = ?
     where id = ?`,
    [status, "completed", remainingBalance, timestamp, orderId],
  );

  const transactionId = await createTransactionRecord({
    userId: input.userId,
    kind: "purchase",
    amount: -total,
    originalAmount: total,
    originalCurrency: checkoutCurrency,
    displayCurrency: checkoutCurrency,
    paymentMethod: input.paymentMethod,
    paymentProvider,
    status: "completed",
    referenceId: orderId,
    summary: "Card purchase completed",
    meta: {
      currency: checkoutCurrency,
      paymentMethod: input.paymentMethod,
      provider: paymentProvider,
      paymentReference,
      billingCountry: input.billingCountry ?? null,
      cryptoNetwork: input.cryptoNetwork ?? null,
      relatedOrderId: orderId,
      paymentSessionId: input.paymentSessionId ?? null,
      telegramUsername: account.user.telegramUsername,
      items: input.items,
    },
  });

  await clearUserCartItems(input.userId);
  await notifySafely(() =>
    sendPurchaseNotification({
      username: account.user.username,
      telegramUsername: account.user.telegramUsername,
      orderId,
      total,
      currency: checkoutCurrency,
      paymentMethod: input.paymentMethod,
      provider: paymentProvider,
      items: input.items.map((item) => ({
        title: productMap.get(item.productId)?.title ?? item.productId,
        quantity: item.quantity,
      })),
      timestamp,
    }),
  );

  revalidateStorefront();
  revalidatePrivate(input.userId);
  revalidateAdmin();

  return {
    ok: true as const,
    orderId,
    transactionId,
    remainingBalance,
    paymentMethod: input.paymentMethod,
    provider: paymentProvider,
    currency: checkoutCurrency,
    paymentReference,
    timestamp,
    telegramUsername: account.user.telegramUsername,
  };
}

export async function getOrderById(orderId: string, userId?: string) {
  await ensureDatabase();
  const args: SqlValue[] = [orderId];
  let sql = "select * from orders where id = ?";

  if (userId) {
    sql += " and user_id = ?";
    args.push(userId);
  }

  sql += " limit 1";
  const orderRow = await queryOne(sql, args);

  if (!orderRow) {
    return null;
  }

  const itemRows = await queryMany(
    `select
      order_items.id,
      order_items.quantity,
      order_items.unit_price,
      order_items.delivery_type,
      products.*
     from order_items
     inner join products on products.id = order_items.product_id
     where order_items.order_id = ?`,
    [orderId],
  );

  const transactionRow = await queryOne(
    `select * from transactions
     where reference_id = ? and kind = 'purchase'
     order by created_at desc
     limit 1`,
    [orderId],
  );

  return {
    order: normalizeOrder(orderRow),
    items: itemRows.map((row) => ({
      id: String(row.id),
      quantity: Number(row.quantity),
      unitPrice: Number(row.unit_price),
      deliveryType: row.delivery_type as DeliveryType,
      product: normalizeProduct(row),
    })),
    transaction: transactionRow ? normalizeTransaction(transactionRow) : null,
    transactionMeta: transactionRow
      ? fromJson<Record<string, unknown>>(transactionRow.meta_json)
      : null,
  };
}

export async function getAdminStats() {
  await ensureDatabase();
  const [revenue, orders, users, withdrawals] = await Promise.all([
    queryOne("select coalesce(sum(total), 0) as value from orders where payment_state = 'completed'"),
    queryOne("select count(*) as value from orders"),
    queryOne("select count(*) as value from profiles where role = 'user'"),
    queryOne(
      `select count(*) as value
       from withdrawal_requests
       where status in ('pending', 'approved', 'processing')`,
    ),
  ]);

  return [
    {
      label: "Revenue",
      value: formatUsd(Number(revenue?.value ?? 0)),
      change: "Live",
    },
    {
      label: "Orders",
      value: `${Number(orders?.value ?? 0)}`,
      change: "Live",
    },
    {
      label: "Collectors",
      value: `${Number(users?.value ?? 0)}`,
      change: "Live",
    },
    {
      label: "Pending withdrawals",
      value: `${Number(withdrawals?.value ?? 0)}`,
      change: "Action required",
    },
  ];
}

export async function getAdminOrders() {
  await ensureDatabase();
  const rows = await queryMany(
    `select
      orders.*,
      users.username as customer,
      coalesce(sum(order_items.quantity), 0) as item_count
     from orders
     inner join users on users.id = orders.user_id
     left join order_items on order_items.order_id = orders.id
     group by orders.id
     order by orders.created_at desc`,
  );

  return rows.map((row) => ({
    ...normalizeOrder(row),
    customer: String(row.customer),
  }));
}

export async function getAdminProducts() {
  await ensureDatabase();
  const rows = await queryMany(
    `select * from products
     where archived = 0
     order by homepage_featured desc, featured desc, updated_at desc, title asc`,
  );
  return rows.map((row) => normalizeProduct(row));
}

export async function getAdminUsers() {
  await ensureDatabase();
  const rows = await queryMany(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.withdrawal_wallet, profiles.verified,
      balances.available, balances.pending_withdrawal, balances.total_deposited,
      balances.total_spent, balances.total_withdrawn, balances.updated_at as balance_updated_at
     from users
     inner join profiles on profiles.user_id = users.id
     inner join balances on balances.user_id = users.id
     order by users.created_at desc`,
  );

  return rows.map((row) => ({
    user: normalizeUser(row),
    balance: normalizeBalance({
      user_id: row.id,
      available: row.available,
      pending_withdrawal: row.pending_withdrawal,
      total_deposited: row.total_deposited,
      total_spent: row.total_spent,
      total_withdrawn: row.total_withdrawn,
      updated_at: row.balance_updated_at,
    }),
  }));
}

async function getAdminUserEntryById(userId: string) {
  const row = await queryOne(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.withdrawal_wallet, profiles.verified,
      balances.available, balances.pending_withdrawal, balances.total_deposited,
      balances.total_spent, balances.total_withdrawn, balances.updated_at as balance_updated_at
     from users
     inner join profiles on profiles.user_id = users.id
     inner join balances on balances.user_id = users.id
     where users.id = ?
     limit 1`,
    [userId],
  );

  if (!row) {
    return null;
  }

  return {
    user: normalizeUser(row),
    balance: normalizeBalance({
      user_id: row.id,
      available: row.available,
      pending_withdrawal: row.pending_withdrawal,
      total_deposited: row.total_deposited,
      total_spent: row.total_spent,
      total_withdrawn: row.total_withdrawn,
      updated_at: row.balance_updated_at,
    }),
  };
}

export async function updateAdminManagedUser(input: {
  userId: string;
  adminUserId: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  telegramUsername: string;
  telegramId: string;
  withdrawalWallet: string;
  verified: boolean;
}) {
  await ensureDatabase();

  const currentEntry = await getAdminUserEntryById(input.userId);

  if (!currentEntry) {
    throw new Error("User not found.");
  }

  if (
    input.userId === input.adminUserId &&
    (input.role !== "admin" || input.status !== "active")
  ) {
    throw new Error(
      "You cannot remove your own admin access or suspend your own account.",
    );
  }

  const telegramUsername = normalizeTelegramUsername(input.telegramUsername);

  if (!isValidTelegramUsername(telegramUsername)) {
    throw new Error("Telegram username must start with @ and use 5-32 valid characters.");
  }

  const owner = await queryOne(
    "select user_id from profiles where telegram_username = ? and user_id <> ? limit 1",
    [telegramUsername, input.userId],
  );

  if (owner) {
    throw new Error("Telegram username is already connected to another account.");
  }

  const timestamp = nowIso();

  await execute("update users set name = ?, status = ?, updated_at = ? where id = ?", [
    input.name.trim() || currentEntry.user.name || "Collector",
    input.status,
    timestamp,
    input.userId,
  ]);

  await execute(
    `update profiles set
      role = ?, telegram_username = ?, telegram_id = ?, withdrawal_wallet = ?,
      verified = ?, updated_at = ?
     where user_id = ?`,
    [
      input.role,
      telegramUsername,
      input.telegramId.trim() || null,
      input.withdrawalWallet.trim() || null,
      input.verified ? 1 : 0,
      timestamp,
      input.userId,
    ],
  );

  await logAdminAction(
    input.adminUserId,
    "update",
    "user",
    input.userId,
    `Updated user ${currentEntry.user.username}`,
    {
      metadata: {
        name: input.name.trim(),
        role: input.role,
        status: input.status,
        telegramUsername,
        verified: input.verified,
      },
    },
  );

  revalidatePrivate(input.userId);
  revalidateAdmin();

  return getAdminUserEntryById(input.userId);
}

export async function getAdminWithdrawalRequests() {
  await ensureDatabase();
  const rows = await queryMany(
    `select
      withdrawal_requests.*,
      users.username,
      profiles.telegram_username,
      balances.available,
      balances.pending_withdrawal,
      balances.total_withdrawn
     from withdrawal_requests
     inner join users on users.id = withdrawal_requests.user_id
     inner join profiles on profiles.user_id = users.id
     inner join balances on balances.user_id = users.id
     order by withdrawal_requests.created_at desc`,
  );

  if (rows.length === 0) {
    return [];
  }

  const withdrawalIds = rows.map((row) => String(row.id));
  const placeholders = withdrawalIds.map(() => "?").join(", ");
  const historyRows = await queryMany(
    `select * from withdrawal_status_history
     where withdrawal_id in (${placeholders})
     order by created_at desc`,
    withdrawalIds,
  );

  const historyByWithdrawalId = new Map<string, WithdrawalStatusHistoryRecord[]>();
  for (const row of historyRows) {
    const history = normalizeWithdrawalHistory(row);
    const list = historyByWithdrawalId.get(history.withdrawalId) ?? [];
    list.push(history);
    historyByWithdrawalId.set(history.withdrawalId, list);
  }

  return rows.map((row) => {
    const request = normalizeWithdrawal(row);
    return {
      request,
      username: String(row.username),
      telegramUsername: String(row.telegram_username),
      balance: {
        available: Number(row.available),
        pendingWithdrawal: Number(row.pending_withdrawal),
        totalWithdrawn: Number(row.total_withdrawn),
      },
      history: historyByWithdrawalId.get(request.id) ?? [],
    };
  });
}

export async function getAdminTransactions(limit = 20) {
  await ensureDatabase();
  const rows = await queryMany(
    `select transactions.*, users.username
     from transactions
     inner join users on users.id = transactions.user_id
     order by transactions.created_at desc
     limit ?`,
    [limit],
  );

  return rows.map((row) => ({
    transaction: normalizeTransaction(row),
    username: String(row.username),
    meta: fromJson<Record<string, unknown>>(row.meta_json),
  }));
}

export async function createProduct(
  input: Omit<ProductInput, "id" | "palette"> & {
    id?: string;
    palette?: ProductRecord["palette"];
    adminUserId?: string;
  },
) {
  await ensureDatabase();
  const id = input.id || createProductId(input.title);
  const palette = input.palette || getPaletteByRarity(input.rarity);
  const timestamp = nowIso();

  if (input.homepageFeatured) {
    await execute(
      "update products set homepage_featured = 0, featured_started_at = null where homepage_featured = 1",
    );
  }

  await execute(
    `insert into products (
      id, title, rarity, price, currency, stock, collection, category, description,
      tagline, default_delivery_type, delivery_digital, delivery_physical, edition,
      shape, image_url, image_path, image_updated_at, featured, homepage_featured, featured_started_at, showcase_float,
      showcase_rotation_seconds, status, archived, palette_glow, palette_glow_soft,
      palette_core, palette_ring, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [
      id,
      input.title,
      input.rarity,
      input.price,
      input.currency,
      input.stock,
      input.collection,
      input.category,
      input.description,
      input.tagline,
      input.defaultDeliveryType,
      input.deliveryDigital,
      input.deliveryPhysical,
      input.edition,
      input.shape,
      input.imageUrl,
      input.imagePath ?? null,
      input.imageUpdatedAt ?? null,
      input.featured ? 1 : 0,
      input.homepageFeatured ? 1 : 0,
      input.homepageFeatured ? timestamp : null,
      1,
      12,
      input.status,
      0,
      palette.glow,
      palette.glowSoft,
      palette.core,
      palette.ring,
      timestamp,
      timestamp,
    ],
  );

  if (input.adminUserId) {
    await logAdminAction(
      input.adminUserId,
      "create",
      "product",
      id,
      input.homepageFeatured
        ? `Created product ${input.title} and featured it on the homepage`
        : `Created product ${input.title}`,
    );
  }

  revalidateStorefront();
  revalidateAdmin();
  return {
    id,
    title: input.title,
  };
}

export async function updateProduct(
  id: string,
  input: Partial<Omit<ProductInput, "id" | "createdAt" | "updatedAt">> & {
    adminUserId?: string;
  },
) {
  await ensureDatabase();
  const currentRow = await queryOne(
    "select * from products where id = ? and archived = 0 limit 1",
    [id],
  );

  if (!currentRow) {
    throw new Error("Product not found.");
  }

  const current = normalizeProduct(currentRow);

  const next = {
    ...current,
    ...input,
    palette: input.rarity ? getPaletteByRarity(input.rarity) : current.palette,
  };

  const timestamp = nowIso();

  if (next.homepageFeatured) {
    await execute(
      "update products set homepage_featured = 0, featured_started_at = null where homepage_featured = 1 and id <> ?",
      [id],
    );
  }

  await execute(
    `update products set
      title = ?, rarity = ?, price = ?, currency = ?, stock = ?, collection = ?,
      category = ?, description = ?, tagline = ?, default_delivery_type = ?,
      delivery_digital = ?, delivery_physical = ?, edition = ?, shape = ?, image_url = ?,
      image_path = ?, image_updated_at = ?, featured = ?, homepage_featured = ?, featured_started_at = ?, showcase_float = ?,
      showcase_rotation_seconds = ?, status = ?, palette_glow = ?, palette_glow_soft = ?,
      palette_core = ?, palette_ring = ?, updated_at = ?
     where id = ?`,
    [
      next.title,
      next.rarity,
      next.price,
      next.currency,
      next.stock,
      next.collection,
      next.category,
      next.description,
      next.tagline,
      next.defaultDeliveryType,
      next.deliveryDigital,
      next.deliveryPhysical,
      next.edition,
      next.shape,
      next.imageUrl,
      next.imagePath ?? null,
      next.imageUpdatedAt ?? null,
      next.featured ? 1 : 0,
      next.homepageFeatured ? 1 : 0,
      next.homepageFeatured
        ? current.homepageFeatured
          ? current.featuredStartedAt ?? timestamp
          : timestamp
        : null,
      1,
      12,
      next.status,
      next.palette.glow,
      next.palette.glowSoft,
      next.palette.core,
      next.palette.ring,
      timestamp,
      id,
    ],
  );

  if (
    (current.imageUrl && current.imageUrl !== next.imageUrl) ||
    (current.imagePath && current.imagePath !== next.imagePath)
  ) {
    await removeManagedProductImage({
      imageUrl: current.imageUrl,
      imagePath: current.imagePath,
    }).catch((error) => {
      console.warn("Unable to remove previous product image after replacement.", error);
    });
  }

  if (input.adminUserId) {
    await logAdminAction(
      input.adminUserId,
      "update",
      "product",
      id,
      next.homepageFeatured && !current.homepageFeatured
        ? `Updated product ${next.title} and featured it on the homepage`
        : `Updated product ${next.title}`,
    );
  }

  revalidateStorefront();
  revalidateAdmin();
  return {
    ...next,
    featuredStartedAt: next.homepageFeatured
      ? current.homepageFeatured
        ? current.featuredStartedAt ?? timestamp
        : timestamp
      : null,
    updatedAt: timestamp,
  };
}

export async function setHomepageFeaturedProduct(id: string, adminUserId?: string) {
  await ensureDatabase();
  const currentRow = await queryOne(
    "select * from products where id = ? and archived = 0 limit 1",
    [id],
  );

  if (!currentRow) {
    throw new Error("Product not found.");
  }

  const current = normalizeProduct(currentRow);
  const timestamp = nowIso();

  await execute(
    "update products set homepage_featured = 0, featured_started_at = null where homepage_featured = 1",
  );
  await execute(
    "update products set homepage_featured = 1, featured_started_at = ?, updated_at = ? where id = ?",
    [timestamp, timestamp, id],
  );

  if (adminUserId) {
    await logAdminAction(
      adminUserId,
      "feature",
      "product",
      id,
      `Featured product ${current.title} on the homepage`,
    );
  }

  revalidateStorefront();
  revalidateAdmin();
  return {
    ...current,
    homepageFeatured: true,
    featuredStartedAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function deleteProduct(id: string, adminUserId?: string) {
  await ensureDatabase();
  const row = await queryOne("select * from products where id = ? limit 1", [id]);

  if (!row) {
    throw new Error("Product not found.");
  }

  const product = normalizeProduct(row);

  await execute(
    `update products set
      archived = 1,
      featured = 0,
      homepage_featured = 0,
      featured_started_at = null,
      updated_at = ?
     where id = ?`,
    [nowIso(), id],
  );

  if (product.imageUrl || product.imagePath) {
    await removeManagedProductImage({
      imageUrl: product.imageUrl,
      imagePath: product.imagePath,
    }).catch((error) => {
      console.warn("Unable to remove archived product image.", error);
    });
  }

  if (adminUserId) {
    await logAdminAction(
      adminUserId,
      "archive",
      "product",
      id,
      `Archived product ${product.title}`,
    );
  }

  revalidateStorefront();
  revalidateAdmin();
  return { id };
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  await ensureDatabase();
  await execute("update orders set status = ?, updated_at = ? where id = ?", [
    status,
    nowIso(),
    orderId,
  ]);
  revalidatePrivate();
  revalidateAdmin();
}

export async function updateWithdrawalStatus(input: {
  withdrawalId: string;
  status: WithdrawalRecord["status"];
  adminUserId: string;
  adminNote?: string;
  source?: WithdrawalActionSource;
}) {
  await ensureDatabase();
  const row = await queryOne(
    "select * from withdrawal_requests where id = ? limit 1",
    [input.withdrawalId],
  );

  if (!row) {
    throw new Error("Withdrawal request not found.");
  }

  const request = normalizeWithdrawal(row);
  const admin = await getAdminIdentity(input.adminUserId);
  const source = input.source ?? "dashboard";
  const nextNote = input.adminNote?.trim() || null;

  if (request.status === input.status) {
    if ((request.adminNote ?? null) === nextNote) {
      return request;
    }

    const noteTimestamp = nowIso();
    await execute(
      `update withdrawal_requests set
        admin_note = ?,
        telegram_sync_status = ?,
        telegram_synced_at = null,
        telegram_last_error = null,
        last_action_source = ?,
        last_updated_by_admin_id = ?,
        updated_at = ?
       where id = ?`,
      [
        nextNote,
        "pending",
        source,
        admin.id,
        noteTimestamp,
        request.id,
      ],
    );

    await logAdminAction(
      admin.id,
      "withdrawal-note",
      "withdrawal",
      request.id,
      `Updated note for withdrawal ${request.id}`,
      {
        source,
        previousStatus: request.status,
        nextStatus: request.status,
        metadata: {
          adminNote: nextNote,
        },
      },
    );

    await insertWithdrawalHistory({
      withdrawalId: request.id,
      actionType: "note-updated",
      previousStatus: request.status,
      nextStatus: request.status,
      source,
      adminUserId: admin.id,
      adminUsername: admin.username,
      adminTelegramUsername: admin.telegramUsername,
      note: nextNote,
    });

    revalidatePrivate(request.userId);
    revalidateAdmin();
    await notifySafely(() => syncWithdrawalTelegramMessage(request.id));

    const updatedRow = await queryOne(
      "select * from withdrawal_requests where id = ? limit 1",
      [request.id],
    );
    return updatedRow ? normalizeWithdrawal(updatedRow) : request;
  }

  if (isFinalWithdrawalStatus(request.status)) {
    throw new Error(`Withdrawal ${request.id} is already ${request.status}.`);
  }

  if (!canTransitionWithdrawalStatus(request.status, input.status)) {
    throw new Error(
      `Invalid withdrawal transition: ${request.status} -> ${input.status}.`,
    );
  }

  const timestamp = nowIso();
  const balance = await getBalanceByUserId(request.userId);
  const owner = await getUserById(request.userId);

  if (!balance) {
    throw new Error("Balance not found.");
  }

  if (input.status === "completed") {
    await execute(
      `update balances set
        pending_withdrawal = pending_withdrawal - ?,
        total_withdrawn = total_withdrawn + ?,
        updated_at = ?
       where user_id = ?`,
      [request.amount, request.amount, timestamp, request.userId],
    );

    await execute(
      `update transactions set status = 'completed', updated_at = ?
       where reference_id = ? and kind = 'withdrawal'`,
      [timestamp, request.id],
    );
  }

  if (input.status === "declined") {
    await execute(
      `update balances set
        available = available + ?,
        pending_withdrawal = pending_withdrawal - ?,
        updated_at = ?
       where user_id = ?`,
      [request.amount, request.amount, timestamp, request.userId],
    );

    await execute(
      `update transactions set status = 'failed', updated_at = ?
       where reference_id = ? and kind = 'withdrawal'`,
      [timestamp, request.id],
    );
  }

  if (input.status === "approved" || input.status === "processing") {
    await execute(
      `update transactions set status = 'pending', updated_at = ?
       where reference_id = ? and kind = 'withdrawal'`,
      [timestamp, request.id],
    );
  }

  await execute(
    `update withdrawal_requests set
      status = ?,
      admin_note = ?,
      telegram_sync_status = ?,
      telegram_synced_at = null,
      telegram_last_error = null,
      last_action_source = ?,
      last_updated_by_admin_id = ?,
      updated_at = ?
     where id = ?`,
    [
      input.status,
      nextNote,
      "pending",
      source,
      admin.id,
      timestamp,
      request.id,
    ],
  );

  const transactionRow = await queryOne(
    `select meta_json from transactions
     where reference_id = ? and kind = 'withdrawal'
     limit 1`,
    [request.id],
  );
  const nextMeta = {
    ...(fromJson<Record<string, unknown>>(transactionRow?.meta_json ?? null) ?? {}),
    walletAddress: request.walletAddress,
    telegramUsername: owner?.telegramUsername ?? null,
    adminTelegramUsername: admin.telegramUsername,
    adminUsername: admin.username,
    adminNote: nextNote,
    previousStatus: request.status,
    status: input.status,
    source,
    updatedAt: timestamp,
  };

  await execute(
    `update transactions set meta_json = ?, updated_at = ?
     where reference_id = ? and kind = 'withdrawal'`,
    [toJson(nextMeta), timestamp, request.id],
  );

  await logAdminAction(
    input.adminUserId,
      "withdrawal-status",
      "withdrawal",
      request.id,
      `Set withdrawal ${request.id} to ${input.status}`,
      {
      source,
      previousStatus: request.status,
      nextStatus: input.status,
        metadata: {
          amount: request.amount,
          walletAddress: request.walletAddress,
          adminNote: nextNote,
        },
      },
  );

  await insertWithdrawalHistory({
    withdrawalId: request.id,
    actionType: source === "telegram" ? `telegram-${input.status}` : input.status,
    previousStatus: request.status,
    nextStatus: input.status,
    source,
    adminUserId: admin.id,
    adminUsername: admin.username,
    adminTelegramUsername: admin.telegramUsername,
    note: nextNote,
  });

  if (input.status === "declined") {
    await notifySafely(() =>
      sendWithdrawalFailureNotification({
        username: owner?.username ?? "unknown",
        telegramUsername: owner?.telegramUsername ?? "@unknown",
        amount: request.amount,
        walletAddress: request.walletAddress,
        requestId: request.id,
        reason: nextNote || "Manual admin rejection.",
        timestamp,
      }),
    );
  }

  revalidatePrivate(request.userId);
  revalidateAdmin();

  await notifySafely(() => syncWithdrawalTelegramMessage(request.id));

  const updatedRow = await queryOne(
    "select * from withdrawal_requests where id = ? limit 1",
    [request.id],
  );
  return updatedRow ? normalizeWithdrawal(updatedRow) : request;
}

export async function saveUploadedImage(file: File) {
  if (!file || file.size === 0) {
    return null;
  }

  validateProductImageFile(file);

  const isProductionRuntime =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV);

  if (isProductionRuntime || isSupabaseStorageAvailable()) {
    const uploaded = await uploadImageToSupabaseStorage(file);
    return {
      imageUrl: uploaded.publicUrl,
      imagePath: uploaded.objectPath,
      imageUpdatedAt: new Date().toISOString(),
    };
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await import("fs/promises").then(({ mkdir }) =>
    mkdir(uploadsDir, { recursive: true }),
  );

  const bytes = await file.arrayBuffer();
  const extension = path.extname(file.name) || ".png";
  const filename = `${randomUUID()}${extension}`;
  const filePath = path.join(uploadsDir, filename);
  await writeFile(filePath, Buffer.from(bytes));

  return {
    imageUrl: `/uploads/${filename}`,
    imagePath: `uploads/${filename}`,
    imageUpdatedAt: new Date().toISOString(),
  };
}

export async function removeManagedProductImage(input: {
  imageUrl?: string | null;
  imagePath?: string | null;
}) {
  if (!input.imageUrl && !input.imagePath) {
    return;
  }

  if (isSupabaseManagedImageUrl(input.imageUrl) || input.imagePath) {
    await removeImageFromSupabaseStorage(input);
    return;
  }

  const imageUrl = input.imageUrl;

  if (!imageUrl) {
    return;
  }

  if (!imageUrl.startsWith("/uploads/")) {
    return;
  }

  const uploadsDir = path.join(process.cwd(), "public");
  const relativePath = imageUrl.replace(/^\/+/, "");
  const filePath = path.join(uploadsDir, relativePath);

  try {
    await unlink(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("no such file") && !message.includes("enoent")) {
      throw error;
    }
  }
}
