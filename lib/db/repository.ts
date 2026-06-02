import { readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { createHash, randomBytes, randomInt, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import {
  ADMIN_SEED_PASSWORD,
  ADMIN_SEED_TELEGRAM,
  ADMIN_SEED_USERNAME,
  ADMIN_TELEGRAM_CHAT_ID,
  ADMIN_TELEGRAM_IDS,
  APP_BASE_URL,
  TELEGRAM_CHANNEL_CHAT_ID,
  TELEGRAM_CALLBACK_SECRET,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME,
  XROCKET_DEFAULT_CURRENCY,
  XROCKET_DEFAULT_NETWORK,
} from "@/lib/server-config";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { convertAmount } from "@/lib/currency-service";
import {
  answerTelegramCallbackQuery,
  editTelegramMessage,
  sendTelegramAdminMessage,
  sendTelegramChannelPhotoFile,
  sendTelegramMessage,
  sendTelegramUserMessage,
  type TelegramReplyMarkup,
  type TelegramUpdate,
} from "@/lib/telegram";
import {
  createXRocketWithdrawal,
  extractXRocketStatus,
  extractXRocketTxHash,
  extractXRocketWithdrawalId,
  getXRocketWithdrawalInfo,
  isXRocketFailedStatus,
  isXRocketPaidStatus,
} from "@/lib/xrocket";
import {
  buildPlaceholderEmail,
  calculateWithdrawalPayout,
  createProductId,
  createReadableId,
  formatCurrency,
  formatUsd,
  formatUtcDateTime,
  getPayoutTierProgress,
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
  type PaymentReconciliationStatus,
  type ProductInput,
  type ProductRecord,
  type Rarity,
  type SupportedCurrency,
  type TransactionRecord,
  type TelegramSyncStatus,
  type UserRecord,
  type UserRole,
  type UserStatus,
  type ActivePaymentSessionRecord,
  type ArchiveLedgerRecord,
  type BroadcastRecord,
  type UserNotificationRecord,
  type VaultIntegrityReport,
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
type MaintenanceModeConfig = {
  enabled: boolean;
  title: string;
  message: string;
  estimatedReturnAt: string | null;
  internalNote: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
  updatedByUsername: string | null;
  lastEnabledAt: string | null;
  lastEnabledByUserId: string | null;
  lastEnabledByUsername: string | null;
  lastDisabledAt: string | null;
  lastDisabledByUserId: string | null;
  lastDisabledByUsername: string | null;
};

let initialized = false;
let initializationPromise: Promise<void> | null = null;

const REQUIRED_TABLES = [
  "users",
  "profiles",
  "telegram_identities",
  "telegram_verification_codes",
  "telegram_users",
  "telegram_verifications",
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
  "user_notifications",
  "broadcasts",
  "broadcast_deliveries",
  "archive_ledger",
  "vault_integrity_events",
  "provider_health_logs",
  "webhook_events",
  "security_audit_events",
] as const;

type SecurityAuditEventType =
  | "users_page_visit"
  | "user_registered"
  | "user_login"
  | "user_email_changed"
  | "admin_created_user"
  | "admin_deleted_user"
  | "archive_rules_accepted"
  | "broadcast_created"
  | "broadcast_sent"
  | "broadcast_deleted"
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
const TELEGRAM_VERIFICATION_TTL_MINUTES = 10;
const TELEGRAM_VERIFICATION_MAX_ATTEMPTS = 5;
const TELEGRAM_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;
const TELEGRAM_VERIFICATION_MAX_RESENDS_PER_HOUR = 5;
const TELEGRAM_VERIFICATION_PURPOSE_REGISTRATION = "registration";
const SYSTEM_SETTING_KEY_MAINTENANCE_MODE = "maintenance_mode";
const SYSTEM_SETTING_KEY_TRANSVOUCHER_RECONCILIATION_BASELINE =
  "transvoucher_reconciliation_baseline_at";
const DEFAULT_MAINTENANCE_TITLE = "We'll be back soon.";
const DEFAULT_MAINTENANCE_MESSAGE =
  "ReboHrome is currently undergoing scheduled maintenance. Our archive will reopen shortly.";

function nowIso() {
  return new Date().toISOString();
}

function getDefaultMaintenanceModeConfig(): MaintenanceModeConfig {
  return {
    enabled: false,
    title: DEFAULT_MAINTENANCE_TITLE,
    message: DEFAULT_MAINTENANCE_MESSAGE,
    estimatedReturnAt: null,
    internalNote: null,
    updatedAt: null,
    updatedByUserId: null,
    updatedByUsername: null,
    lastEnabledAt: null,
    lastEnabledByUserId: null,
    lastEnabledByUsername: null,
    lastDisabledAt: null,
    lastDisabledByUserId: null,
    lastDisabledByUsername: null,
  };
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
    approved: ["processing", "completed", "declined"],
    processing: ["completed", "declined"],
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

function hashVerificationCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function createVerificationCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeTelegramNumericId(value: string | number | null | undefined) {
  const next = String(value ?? "").trim();
  return /^\d+$/.test(next) ? next : "";
}

function isValidUsdtBep20Wallet(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function maskWallet(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 12
    ? `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`
    : trimmed;
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

function normalizeMaintenanceModeConfig(
  value: Partial<MaintenanceModeConfig> | null | undefined,
): MaintenanceModeConfig {
  const defaults = getDefaultMaintenanceModeConfig();

  return {
    ...defaults,
    ...value,
    enabled: Boolean(value?.enabled),
    title: String(value?.title ?? defaults.title).trim() || defaults.title,
    message: String(value?.message ?? defaults.message).trim() || defaults.message,
    estimatedReturnAt: value?.estimatedReturnAt
      ? String(value.estimatedReturnAt)
      : null,
    internalNote: value?.internalNote ? String(value.internalNote) : null,
    updatedAt: value?.updatedAt ? String(value.updatedAt) : null,
    updatedByUserId: value?.updatedByUserId ? String(value.updatedByUserId) : null,
    updatedByUsername: value?.updatedByUsername ? String(value.updatedByUsername) : null,
    lastEnabledAt: value?.lastEnabledAt ? String(value.lastEnabledAt) : null,
    lastEnabledByUserId: value?.lastEnabledByUserId
      ? String(value.lastEnabledByUserId)
      : null,
    lastEnabledByUsername: value?.lastEnabledByUsername
      ? String(value.lastEnabledByUsername)
      : null,
    lastDisabledAt: value?.lastDisabledAt ? String(value.lastDisabledAt) : null,
    lastDisabledByUserId: value?.lastDisabledByUserId
      ? String(value.lastDisabledByUserId)
      : null,
    lastDisabledByUsername: value?.lastDisabledByUsername
      ? String(value.lastDisabledByUsername)
      : null,
  };
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
  const integrityStatus = String(
    row.vault_integrity_status ?? "Unstable",
  ) as UserRecord["vaultIntegrityStatus"];
  return {
    id: String(row.id),
    username: String(row.username),
    email: String(row.email),
    name: String(row.name),
    role: String(row.role) as UserRecord["role"],
    status: String(row.status) as UserRecord["status"],
    telegramUsername: String(row.telegram_username),
    telegramId: row.telegram_id ? String(row.telegram_id) : null,
    telegramChatId: row.telegram_chat_id ? String(row.telegram_chat_id) : null,
    telegramVerified: asBoolean(row.telegram_verified ?? row.verified ?? 0),
    telegramVerifiedAt: row.telegram_verified_at ? String(row.telegram_verified_at) : null,
    withdrawalWallet: row.withdrawal_wallet ? String(row.withdrawal_wallet) : null,
    verified: asBoolean(row.verified ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
    requirePasswordReset: asBoolean(row.require_password_reset ?? 0),
    isDeleted: asBoolean(row.is_deleted ?? 0),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    deletedBy: row.deleted_by ? String(row.deleted_by) : null,
    vaultIntegrityScore: Number(row.vault_integrity_score ?? 0),
    vaultIntegrityStatus: ["Unstable", "Basic", "Verified", "Excellent"].includes(
      integrityStatus,
    )
      ? integrityStatus
      : "Unstable",
    vaultIntegrityUpdatedAt: row.vault_integrity_updated_at
      ? String(row.vault_integrity_updated_at)
      : null,
    archiveRulesAcceptedAt: row.archive_rules_accepted_at
      ? String(row.archive_rules_accepted_at)
      : null,
    latestTermsAcceptedAt: row.latest_terms_accepted_at
      ? String(row.latest_terms_accepted_at)
      : null,
  };
}

function normalizeUserNotification(row: DbRow): UserNotificationRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    broadcastId: row.broadcast_id ? String(row.broadcast_id) : null,
    type: String(row.type ?? row.kind ?? "system_update"),
    title: String(row.title),
    body: String(row.body),
    ctaLabel: row.cta_label ? String(row.cta_label) : null,
    ctaUrl: row.cta_url ? String(row.cta_url) : null,
    showAsPopup: asBoolean(row.show_as_popup ?? 0),
    dismissedAt: row.dismissed_at ? String(row.dismissed_at) : null,
    readAt: row.read_at ? String(row.read_at) : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    createdAt: String(row.created_at),
  };
}

function normalizeBroadcast(row: DbRow): BroadcastRecord {
  return {
    id: String(row.id),
    broadcastId: String(row.broadcast_id),
    title: String(row.title),
    body: String(row.body),
    previewText: row.preview_text ? String(row.preview_text) : null,
    type: String(row.type),
    priority: String(row.priority ?? "normal"),
    ctaLabel: row.cta_label ? String(row.cta_label) : null,
    ctaUrl: row.cta_url ? String(row.cta_url) : null,
    targetType: String(row.target_type),
    targetFilters: row.target_filters ? String(row.target_filters) : null,
    channels: String(row.channels),
    status: String(row.status),
    scheduledAt: row.scheduled_at ? String(row.scheduled_at) : null,
    sentAt: row.sent_at ? String(row.sent_at) : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    telegramChannelEnabled: asBoolean(row.telegram_channel_enabled ?? 1),
    telegramChannelId: row.telegram_channel_id ? String(row.telegram_channel_id) : null,
    telegramChannelMessageId: row.telegram_channel_message_id
      ? String(row.telegram_channel_message_id)
      : null,
    telegramChannelStatus: row.telegram_channel_status
      ? String(row.telegram_channel_status)
      : null,
    telegramChannelError: row.telegram_channel_error
      ? String(row.telegram_channel_error)
      : null,
    telegramChannelSentAt: row.telegram_channel_sent_at
      ? String(row.telegram_channel_sent_at)
      : null,
    telegramChannelCaption: row.telegram_channel_caption
      ? String(row.telegram_channel_caption)
      : null,
    telegramChannelTranslated: asBoolean(row.telegram_channel_translated ?? 0),
    telegramChannelImagePath: row.telegram_channel_image_path
      ? String(row.telegram_channel_image_path)
      : null,
    showAsPopup: asBoolean(row.show_as_popup ?? 0),
    popupPosition: String(row.popup_position ?? "bottom-left"),
    allowUserDismiss: asBoolean(row.allow_user_dismiss ?? 0),
    isActive: asBoolean(row.is_active ?? 1),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeArchiveLedger(row: DbRow): ArchiveLedgerRecord {
  return {
    id: String(row.id),
    ledgerId: String(row.ledger_id),
    eventType: String(row.event_type),
    userId: row.user_id ? String(row.user_id) : null,
    adminId: row.admin_id ? String(row.admin_id) : null,
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    relatedOrderId: row.related_order_id ? String(row.related_order_id) : null,
    relatedTransactionId: row.related_transaction_id
      ? String(row.related_transaction_id)
      : null,
    relatedProductId: row.related_product_id ? String(row.related_product_id) : null,
    title: String(row.title),
    description: String(row.description),
    metadata: row.metadata ? String(row.metadata) : null,
    previousHash: row.previous_hash ? String(row.previous_hash) : null,
    eventHash: String(row.event_hash),
    createdAt: String(row.created_at),
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
    providerCheckedAt: row.provider_checked_at ? String(row.provider_checked_at) : null,
    processedAt: row.processed_at ? String(row.processed_at) : null,
    creditedAt: row.credited_at ? String(row.credited_at) : null,
    nextCheckAt: row.next_check_at ? String(row.next_check_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    reconciliationAttempts: Number(row.reconciliation_attempts ?? 0),
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
    requestedAmount: Number(row.requested_amount ?? row.amount),
    basePayoutPercent: Number(row.base_payout_percent ?? 60),
    bonusPayoutPercent: Number(row.bonus_payout_percent ?? 0),
    finalPayoutPercent: Number(row.final_payout_percent ?? 60),
    payoutAmount: Number(row.payout_amount ?? row.amount),
    walletAddress: String(row.wallet_usdt_bep20 ?? row.wallet_address),
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
    statusUpdatedBy: row.status_updated_by ? String(row.status_updated_by) : null,
    statusUpdatedAt: row.status_updated_at ? String(row.status_updated_at) : null,
    payoutProvider: row.payout_provider ? String(row.payout_provider) : null,
    payoutCurrency: row.payout_currency ? String(row.payout_currency) : null,
    payoutNetwork: row.payout_network ? String(row.payout_network) : null,
    payoutAddress: row.payout_address ? String(row.payout_address) : null,
    xrocketWithdrawalId: row.xrocket_withdrawal_id
      ? String(row.xrocket_withdrawal_id)
      : null,
    xrocketStatus: row.xrocket_status ? String(row.xrocket_status) : null,
    xrocketRawResponse: row.xrocket_raw_response
      ? String(row.xrocket_raw_response)
      : null,
    xrocketSentAt: row.xrocket_sent_at ? String(row.xrocket_sent_at) : null,
    xrocketConfirmedAt: row.xrocket_confirmed_at
      ? String(row.xrocket_confirmed_at)
      : null,
    payoutTxHash: row.payout_tx_hash ? String(row.payout_tx_hash) : null,
    payoutError: row.payout_error ? String(row.payout_error) : null,
    payoutAttempts: Number(row.payout_attempts ?? 0),
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

function normalizeActiveCheckoutSession(row: DbRow): ActivePaymentSessionRecord {
  return {
    id: String(row.id),
    type: "purchase",
    provider: String(row.payment_provider),
    transactionId: row.transaction_id ? String(row.transaction_id) : null,
    providerTransactionId: row.transvoucher_transaction_id
      ? String(row.transvoucher_transaction_id)
      : null,
    paymentUrl: row.payment_url ? String(row.payment_url) : null,
    amount: Number(row.total),
    currency: String(row.currency) as SupportedCurrency,
    status: String(row.status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    expiresAt: String(row.expires_at),
  };
}

function normalizeActiveDepositSession(row: DbRow): ActivePaymentSessionRecord {
  return {
    id: String(row.id),
    type: "deposit",
    provider: String(row.payment_provider),
    transactionId: row.transaction_id ? String(row.transaction_id) : null,
    providerTransactionId: row.transvoucher_transaction_id
      ? String(row.transvoucher_transaction_id)
      : null,
    paymentUrl: row.payment_url ? String(row.payment_url) : null,
    amount: Number(row.original_amount),
    currency: String(row.currency) as SupportedCurrency,
    status: String(row.status),
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

async function tableExists(tableName: string) {
  const row = await queryOne(
    `select name from sqlite_master
     where type = 'table'
       and name = ?
     limit 1`,
    [tableName],
  );

  return Boolean(row);
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

async function ensureSystemSettingsTable() {
  await execute(
    `create table if not exists system_settings (
      key text primary key,
      value text not null,
      updated_by text,
      updated_at text not null
    )`,
  );
}

async function ensurePaymentReconciliationRunsTable() {
  await execute(
    `create table if not exists payment_reconciliation_runs (
      id text primary key,
      provider text not null,
      started_at text not null,
      finished_at text,
      checked_count integer not null default 0,
      succeeded_count integer not null default 0,
      failed_count integer not null default 0,
      expired_count integer not null default 0,
      pending_count integer not null default 0,
      skipped_count integer not null default 0,
      error_count integer not null default 0,
      last_error text,
      trigger_source text not null default 'cron'
    )`,
  );
}

async function ensureArchiveTrustTables() {
  await execute(
    `create table if not exists archive_ledger (
      id text primary key,
      ledger_id text not null unique,
      event_type text not null,
      user_id text,
      admin_id text,
      entity_type text not null,
      entity_id text not null,
      related_order_id text,
      related_transaction_id text,
      related_product_id text,
      title text not null,
      description text not null,
      metadata text,
      previous_hash text,
      event_hash text not null,
      created_at text not null
    )`,
  );
  await execute(
    `create table if not exists vault_integrity_events (
      id text primary key,
      user_id text not null,
      event_type text not null,
      score_delta integer not null default 0,
      reason text not null,
      created_at text not null
    )`,
  );
  await execute(
    `create table if not exists broadcasts (
      id text primary key,
      broadcast_id text not null unique,
      title text not null,
      body text not null,
      preview_text text,
      type text not null,
      priority text not null default 'normal',
      cta_label text,
      cta_url text,
      target_type text not null,
      target_filters text,
      channels text not null,
      status text not null,
      scheduled_at text,
      sent_at text,
      expires_at text,
      created_by text,
      updated_by text,
      internal_note text,
      telegram_channel_enabled integer not null default 1,
      telegram_channel_id text,
      telegram_channel_message_id text,
      telegram_channel_status text,
      telegram_channel_error text,
      telegram_channel_sent_at text,
      telegram_channel_caption text,
      telegram_channel_translated integer not null default 0,
      telegram_channel_image_path text,
      show_as_popup integer not null default 0,
      popup_position text not null default 'bottom-left',
      allow_user_dismiss integer not null default 0,
      is_active integer not null default 1,
      deleted_at text,
      created_at text not null,
      updated_at text not null
    )`,
  );
  await execute(
    `create table if not exists telegram_admin_sessions (
      id text primary key,
      telegram_admin_id text not null,
      command text not null,
      step text not null,
      payload text,
      expires_at text not null,
      created_at text not null,
      updated_at text not null
    )`,
  );
  await execute(
    `create table if not exists broadcast_deliveries (
      id text primary key,
      broadcast_id text not null,
      user_id text not null,
      channel text not null,
      status text not null,
      delivered_at text,
      read_at text,
      skipped_reason text,
      error_message text,
      telegram_message_id text,
      created_at text not null,
      updated_at text not null
    )`,
  );
  await execute(
    `create table if not exists user_notifications (
      id text primary key,
      user_id text not null,
      broadcast_id text,
      type text not null,
      title text not null,
      body text not null,
      cta_label text,
      cta_url text,
      show_as_popup integer not null default 0,
      dismissed_at text,
      read_at text,
      expires_at text,
      created_at text not null
    )`,
  );
  await execute(
    `create table if not exists provider_health_logs (
      id text primary key,
      provider text not null,
      status text not null,
      latency_ms integer,
      success integer not null default 0,
      error_message text,
      checked_at text not null
    )`,
  );
  await execute(
    `create table if not exists webhook_events (
      id text primary key,
      provider text not null,
      event_type text,
      provider_transaction_id text,
      valid_signature integer not null default 0,
      duplicate integer not null default 0,
      processed integer not null default 0,
      error text,
      received_at text not null
    )`,
  );
}

async function getSystemSettingValue(key: string) {
  await ensureSystemSettingsTable();
  const row = await queryOne(
    "select value from system_settings where key = ? limit 1",
    [key],
  );
  return row?.value ? String(row.value) : null;
}

async function setSystemSettingValue(input: {
  key: string;
  value: string;
  updatedBy?: string | null;
}) {
  await ensureSystemSettingsTable();
  await execute(
    `insert into system_settings (key, value, updated_by, updated_at)
     values (?, ?, ?, ?)
     on conflict(key) do update set
       value = excluded.value,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
    [input.key, input.value, input.updatedBy ?? null, nowIso()],
  );
}

async function getTransVoucherReconciliationBaselineAt() {
  return getSystemSettingValue(
    SYSTEM_SETTING_KEY_TRANSVOUCHER_RECONCILIATION_BASELINE,
  );
}

export async function resetTransVoucherReconciliationBaseline(input?: {
  updatedBy?: string | null;
}) {
  await ensureDatabase();
  const baselineAt = nowIso();
  await setSystemSettingValue({
    key: SYSTEM_SETTING_KEY_TRANSVOUCHER_RECONCILIATION_BASELINE,
    value: baselineAt,
    updatedBy: input?.updatedBy ?? "system",
  });
  revalidateAdmin();
  return baselineAt;
}

async function ensureApplicationColumns() {
  await ensureColumn("users", "require_password_reset integer not null default 0");
  await ensureColumn("users", "is_deleted integer not null default 0");
  await ensureColumn("users", "deleted_at text");
  await ensureColumn("users", "deleted_by text");
  await ensureColumn("users", "vault_integrity_score integer not null default 0");
  await ensureColumn("users", "vault_integrity_status text not null default 'Unstable'");
  await ensureColumn("users", "vault_integrity_updated_at text");
  await ensureColumn("users", "archive_rules_accepted_at text");
  await ensureColumn("users", "latest_terms_accepted_at text");
  await ensureColumn("transactions", "provider_checked_at text");
  await ensureColumn("transactions", "processed_at text");
  await ensureColumn("transactions", "credited_at text");
  await ensureColumn("transactions", "next_check_at text");
  await ensureColumn("transactions", "last_error text");
  await ensureColumn("transactions", "reconciliation_attempts integer not null default 0");
  await ensureColumn("transactions", "environment text not null default 'production'");
  await ensureColumn("withdrawal_requests", "requested_amount integer");
  await ensureColumn("withdrawal_requests", "base_payout_percent integer not null default 60");
  await ensureColumn("withdrawal_requests", "bonus_payout_percent integer not null default 0");
  await ensureColumn("withdrawal_requests", "final_payout_percent integer not null default 60");
  await ensureColumn("withdrawal_requests", "payout_amount integer");
  await ensureColumn("withdrawal_requests", "wallet_usdt_bep20 text");
  await ensureColumn("withdrawal_requests", "status_updated_by text");
  await ensureColumn("withdrawal_requests", "status_updated_at text");
  await ensureColumn("withdrawal_requests", "payout_provider text");
  await ensureColumn("withdrawal_requests", "payout_currency text not null default 'USDT'");
  await ensureColumn("withdrawal_requests", "payout_network text");
  await ensureColumn("withdrawal_requests", "payout_address text");
  await ensureColumn("withdrawal_requests", "xrocket_withdrawal_id text");
  await ensureColumn("withdrawal_requests", "xrocket_status text");
  await ensureColumn("withdrawal_requests", "xrocket_raw_response text");
  await ensureColumn("withdrawal_requests", "xrocket_sent_at text");
  await ensureColumn("withdrawal_requests", "xrocket_confirmed_at text");
  await ensureColumn("withdrawal_requests", "payout_tx_hash text");
  await ensureColumn("withdrawal_requests", "payout_error text");
  await ensureColumn("withdrawal_requests", "payout_attempts integer not null default 0");
  await ensureColumn("broadcasts", "telegram_channel_enabled integer not null default 1");
  await ensureColumn("broadcasts", "telegram_channel_id text");
  await ensureColumn("broadcasts", "telegram_channel_message_id text");
  await ensureColumn("broadcasts", "telegram_channel_status text");
  await ensureColumn("broadcasts", "telegram_channel_error text");
  await ensureColumn("broadcasts", "telegram_channel_sent_at text");
  await ensureColumn("broadcasts", "telegram_channel_caption text");
  await ensureColumn("broadcasts", "telegram_channel_translated integer not null default 0");
  await ensureColumn("broadcasts", "telegram_channel_image_path text");
  await ensureColumn("notifications", "broadcast_id text");
  await ensureColumn("notifications", "cta_label text");
  await ensureColumn("notifications", "cta_url text");
  await ensureColumn("notifications", "expires_at text");
  await ensureColumn("notifications", "show_as_popup integer not null default 0");
  await ensureColumn("notifications", "dismissed_at text");
  await ensurePaymentReconciliationRunsTable();
  await ensureArchiveTrustTables();
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

function getVaultIntegrityStatus(score: number): UserRecord["vaultIntegrityStatus"] {
  if (score >= 90) {
    return "Excellent";
  }
  if (score >= 70) {
    return "Verified";
  }
  if (score >= 40) {
    return "Basic";
  }
  return "Unstable";
}

function buildArchiveLedgerHash(input: {
  eventType: string;
  entityId: string;
  metadata: string;
  previousHash: string | null;
  createdAt: string;
}) {
  return createHash("sha256")
    .update(
      [
        input.eventType,
        input.entityId,
        input.metadata,
        input.previousHash ?? "",
        input.createdAt,
      ].join("|"),
    )
    .digest("hex");
}

export async function appendArchiveLedgerEntry(input: {
  eventType: string;
  userId?: string | null;
  adminId?: string | null;
  entityType: string;
  entityId: string;
  relatedOrderId?: string | null;
  relatedTransactionId?: string | null;
  relatedProductId?: string | null;
  title: string;
  description: string;
  metadata?: Record<string, unknown> | null;
}) {
  await ensureDatabase();
  await ensureArchiveTrustTables();
  const createdAt = nowIso();
  const previousRow = await queryOne(
    "select event_hash from archive_ledger order by created_at desc, id desc limit 1",
  );
  const previousHash = previousRow?.event_hash
    ? String(previousRow.event_hash)
    : null;
  const metadata = toJson(input.metadata ?? {});
  const eventHash = buildArchiveLedgerHash({
    eventType: input.eventType,
    entityId: input.entityId,
    metadata,
    previousHash,
    createdAt,
  });
  const id = randomUUID();
  const ledgerId = createReadableId("ARCH");

  await execute(
    `insert into archive_ledger (
      id, ledger_id, event_type, user_id, admin_id, entity_type, entity_id,
      related_order_id, related_transaction_id, related_product_id, title,
      description, metadata, previous_hash, event_hash, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      ledgerId,
      input.eventType,
      input.userId ?? null,
      input.adminId ?? null,
      input.entityType,
      input.entityId,
      input.relatedOrderId ?? null,
      input.relatedTransactionId ?? null,
      input.relatedProductId ?? null,
      input.title,
      input.description,
      metadata,
      previousHash,
      eventHash,
      createdAt,
    ],
  );

  return {
    id,
    ledgerId,
    eventHash,
  };
}

export async function calculateVaultIntegrityReport(
  userId: string,
): Promise<VaultIntegrityReport> {
  await ensureDatabase();
  const account = await getUserAndBalance(userId);

  if (!account) {
    throw new Error("Unable to load archive profile.");
  }

  const user = account.user;
  const ownedCards = await queryOne(
    "select count(*) as count from owned_cards where user_id = ?",
    [userId],
  );
  const factors: string[] = [];
  const issues: string[] = [];
  let score = 20;

  if (user.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
    score += 15;
    factors.push("Email added and valid");
  } else {
    issues.push("Add a valid email address");
  }

  if (user.telegramVerified) {
    score += 20;
    factors.push("Telegram account verified");
  } else {
    issues.push("Verify Telegram account");
  }

  if (user.name && user.name !== user.username) {
    score += 10;
    factors.push("Profile details completed");
  } else {
    issues.push("Complete profile details");
  }

  if (user.requirePasswordReset) {
    issues.push("Complete the required password reset");
  } else {
    score += 10;
    factors.push("Account security settings completed");
  }

  if (user.status === "active") {
    score += 10;
    factors.push("No active account restrictions");
  } else if (user.status === "under_review") {
    score -= 10;
    issues.push("Account is under review");
  } else if (user.status === "frozen" || user.status === "blocked") {
    score -= 25;
    issues.push("Account access is currently restricted");
  }

  if (Number(ownedCards?.count ?? 0) > 0) {
    score += 10;
    factors.push("Collection activity exists");
  }

  if (user.archiveRulesAcceptedAt) {
    score += 10;
    factors.push("Archive Economy Rules accepted");
  } else {
    issues.push("Review and accept Archive Economy Rules");
  }

  if (user.latestTermsAcceptedAt) {
    score += 5;
    factors.push("Latest platform policies accepted");
  } else {
    issues.push("Accept the latest platform policies");
  }

  score = Math.min(100, Math.max(0, score));

  return {
    score,
    status: getVaultIntegrityStatus(score),
    factors,
    issues,
    updatedAt: user.vaultIntegrityUpdatedAt,
  };
}

export async function recalculateVaultIntegrity(userId: string) {
  await ensureDatabase();
  const report = await calculateVaultIntegrityReport(userId);
  const updatedAt = nowIso();
  await execute(
    `update users set
      vault_integrity_score = ?,
      vault_integrity_status = ?,
      vault_integrity_updated_at = ?,
      updated_at = ?
     where id = ?`,
    [report.score, report.status, updatedAt, updatedAt, userId],
  );
  await execute(
    `insert into vault_integrity_events (
      id, user_id, event_type, score_delta, reason, created_at
    ) values (?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      userId,
      "vault_integrity_recalculated",
      0,
      `Vault Integrity recalculated as ${report.status} (${report.score}%).`,
      updatedAt,
    ],
  );

  return {
    ...report,
    updatedAt,
  };
}

export async function acceptArchiveRules(userId: string) {
  await ensureDatabase();
  const timestamp = nowIso();
  await execute(
    `update users set
      archive_rules_accepted_at = ?,
      latest_terms_accepted_at = coalesce(latest_terms_accepted_at, ?),
      updated_at = ?
     where id = ?`,
    [timestamp, timestamp, timestamp, userId],
  );
  await appendArchiveLedgerEntry({
    eventType: "archive_rules_accepted",
    userId,
    entityType: "user",
    entityId: userId,
    title: "Archive Economy Rules accepted",
    description:
      "Collector reviewed and accepted the latest Archive Economy Rules.",
    metadata: {
      acceptedAt: timestamp,
    },
  });
  await recalculateVaultIntegrity(userId);
  revalidatePrivate(userId);
  return timestamp;
}

function normalizeBroadcastChannels(channels: string[]) {
  const allowed = new Set(["website", "telegram", "email"]);
  const unique = Array.from(
    new Set(channels.map((item) => item.trim()).filter((item) => allowed.has(item))),
  );
  return unique.length > 0 ? unique : ["website"];
}

async function resolveBroadcastTargetUsers(input: {
  targetType: string;
  targetFilters?: Record<string, unknown> | null;
}) {
  if (input.targetType === "admin_notice_only" || input.targetType === "telegram_channel") {
    return [];
  }

  const filters = input.targetFilters ?? {};
  const args: SqlValue[] = [];
  const where = ["coalesce(users.is_deleted, 0) = 0"];

  if (input.targetType === "telegram_verified_users" || input.targetType === "verified_users") {
    where.push("coalesce(profiles.telegram_verified, 0) = 1");
  } else if (input.targetType === "pending_withdrawals") {
    where.push(
      `exists (
        select 1 from withdrawal_requests
        where withdrawal_requests.user_id = users.id
          and withdrawal_requests.status in ('pending', 'approved', 'processing')
      )`,
    );
  } else if (input.targetType === "pending_payments") {
    where.push(
      `exists (
        select 1 from transactions
        where transactions.user_id = users.id
          and transactions.status in ('pending', 'attempting', 'processing')
      )`,
    );
  } else if (input.targetType === "successful_deposits") {
    where.push(
      `exists (
        select 1 from deposits
        where deposits.user_id = users.id and deposits.status = 'completed'
      )`,
    );
  } else if (input.targetType === "zero_balance") {
    where.push("coalesce(balances.available, 0) = 0");
  } else if (input.targetType === "balance_above") {
    where.push("coalesce(balances.available, 0) >= ?");
    args.push(Number(filters.balanceAbove ?? 0));
  } else if (input.targetType === "role") {
    where.push("profiles.role = ?");
    args.push(String(filters.role ?? "user"));
  } else if (input.targetType === "account_status") {
    where.push("users.status = ?");
    args.push(String(filters.status ?? "active"));
  } else if (input.targetType === "accepted_archive_rules") {
    where.push("users.archive_rules_accepted_at is not null");
  } else if (input.targetType === "not_accepted_archive_rules") {
    where.push("users.archive_rules_accepted_at is null");
  } else if (input.targetType === "specific_usernames") {
    const usernames = Array.isArray(filters.usernames)
      ? filters.usernames.map((item) => normalizeUsername(String(item))).filter(Boolean)
      : [];
    if (usernames.length === 0) {
      return [];
    }
    where.push(`users.username in (${usernames.map(() => "?").join(", ")})`);
    args.push(...usernames);
  } else if (input.targetType === "specific_user_ids") {
    const ids = Array.isArray(filters.userIds)
      ? filters.userIds.map((item) => String(item).trim()).filter(Boolean)
      : [];
    if (ids.length === 0) {
      return [];
    }
    where.push(`users.id in (${ids.map(() => "?").join(", ")})`);
    args.push(...ids);
  }

  const rows = await queryMany(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.telegram_chat_id, profiles.telegram_verified, profiles.telegram_verified_at,
      profiles.withdrawal_wallet, profiles.verified
     from users
     inner join profiles on profiles.user_id = users.id
     inner join balances on balances.user_id = users.id
     where ${where.join(" and ")}
     order by users.created_at desc`,
    args,
  );

  return rows.map((row) => normalizeUser(row));
}

function buildBroadcastTelegramMessage(input: {
  title: string;
  body: string;
  type: string;
}) {
  return [
    "<b>ReboHrome Archive Notice</b>",
    "",
    `Title: ${escapeTelegramHtml(input.title)}`,
    `Type: ${escapeTelegramHtml(input.type.replace(/_/g, " "))}`,
    "",
    escapeTelegramHtml(input.body),
  ].join("\n");
}

function hasCyrillic(value: string) {
  return /[А-Яа-яЁё]/.test(value);
}

function looksEnglish(value: string) {
  return /[A-Za-z]/.test(value) && !hasCyrillic(value);
}

function normalizeTranslationKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "");
}

function createRussianFallbackTitle(title: string) {
  const normalized = normalizeTranslationKey(title);
  if (normalized.includes("transvoucher")) {
    return "Исправление TransVoucher";
  }
  if (normalized.includes("payment")) {
    return "Обновление платежей";
  }
  if (normalized.includes("withdrawal")) {
    return "Обновление выводов";
  }
  if (normalized.includes("maintenance")) {
    return "Техническое обслуживание";
  }
  return "Уведомление ReboHrome";
}

function createRussianFallbackBody(body: string) {
  const normalized = normalizeTranslationKey(body);
  if (normalized === "we fix" || normalized.includes("fix")) {
    return "Мы уже работаем над обновлением. Пожалуйста, следите за статусом в ReboHrome.";
  }
  if (normalized.includes("payment")) {
    return "Мы обновляем платежный маршрут и синхронизацию с провайдером. Пожалуйста, следите за статусом в ReboHrome.";
  }
  return "Новое архивное уведомление доступно в ReboHrome. Пожалуйста, ознакомьтесь с обновлением на платформе.";
}

function translateBroadcastToRussian(input: { title: string; body: string }) {
  const title = input.title.trim();
  const body = input.body.trim();

  if (!looksEnglish(`${title} ${body}`)) {
    return {
      title,
      body,
      translated: false,
    };
  }

  const normalizedTitle = normalizeTranslationKey(title);
  const normalizedBody = normalizeTranslationKey(body);
  const titleTranslations: Record<string, string> = {
    "transvoucher stop": "TransVoucher временно остановлен",
    "transvoucher fix": "Исправление TransVoucher",
    "new archive drop is live": "Новый архивный дроп уже доступен",
    "scheduled maintenance": "Плановое техническое обслуживание",
    "payment verification update": "Обновление проверки платежей",
    "withdrawal review update": "Обновление проверки выводов",
    "archive rules updated": "Правила архива обновлены",
    "security notice": "Уведомление безопасности",
  };
  const bodyTranslations: Record<string, string> = {
    "we fix": "Мы уже работаем над обновлением. Пожалуйста, следите за статусом в ReboHrome.",
    "we are temporarily updating payment routing. please do not create duplicate payments while provider sync is active.":
      "Мы временно обновляем платежную маршрутизацию. Пожалуйста, не создавайте повторные платежи, пока синхронизация провайдера активна.",
    "a new set of digital collectibles is now available in the marketplace.":
      "Новый набор цифровых коллекционных карт уже доступен в маркетплейсе.",
    "rebohrome will be under maintenance while we update archive systems.":
      "ReboHrome будет временно недоступен, пока мы обновляем архивные системы.",
    "we are improving payment verification and provider synchronization.":
      "Мы улучшаем проверку платежей и синхронизацию с платежным провайдером.",
    "withdrawal requests are reviewed manually and processed according to archive rules.":
      "Заявки на вывод проверяются вручную и обрабатываются согласно правилам архива.",
    "please review the latest archive economy rules before continuing withdrawal activity.":
      "Пожалуйста, ознакомьтесь с актуальными правилами архива перед продолжением операций вывода.",
    "please verify your telegram account and review your account security settings.":
      "Пожалуйста, подтвердите Telegram аккаунт и проверьте настройки безопасности профиля.",
  };

  return {
    title: titleTranslations[normalizedTitle] ?? createRussianFallbackTitle(title),
    body: bodyTranslations[normalizedBody] ?? createRussianFallbackBody(body),
    translated: Boolean(
      titleTranslations[normalizedTitle] || bodyTranslations[normalizedBody],
    ),
  };
}

function buildTelegramChannelReplyMarkup(input: {
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}) {
  const baseUrl = APP_BASE_URL.replace(/\/+$/, "");
  const rawUrl = input.ctaUrl?.trim();
  const url = rawUrl
    ? rawUrl.startsWith("/")
      ? `${baseUrl}${rawUrl}`
      : rawUrl
    : "https://www.rebohrome.com";
  return {
    inline_keyboard: [
      [
        {
          text: input.ctaLabel?.trim() || "Open ReboHrome",
          url,
        },
      ],
    ],
  } satisfies TelegramReplyMarkup;
}

function translateBroadcastToEnglish(input: { title: string; body: string }) {
  const title = input.title.trim();
  const body = input.body.trim();
  const normalizedTitle = title.toLowerCase();
  const normalizedBody = body.toLowerCase();
  const titleTranslations: Record<string, string> = {
    "transvoucher временно остановлен": "TransVoucher maintenance",
    "новый архивный дроп уже доступен": "New archive drop is live",
    "плановое техническое обслуживание": "Scheduled maintenance",
    "обновление проверки платежей": "Payment verification update",
    "обновление проверки выводов": "Withdrawal review update",
    "правила архива обновлены": "Archive rules updated",
    "уведомление безопасности": "Security notice",
  };
  const bodyTranslations: Record<string, string> = {
    "мы уже работаем над обновлением. пожалуйста, следите за статусом в rebohrome.":
      "We are already working on the update. Please follow the status in ReboHrome.",
    "мы временно обновляем платежную маршрутизацию. пожалуйста, не создавайте повторные платежи, пока синхронизация провайдера активна.":
      "We are temporarily updating payment routing. Please do not create duplicate payments while provider sync is active.",
    "новый набор цифровых коллекционных карт уже доступен в маркетплейсе.":
      "A new set of digital collectibles is now available in the marketplace.",
    "rebohrome будет временно недоступен, пока мы обновляем архивные системы.":
      "ReboHrome will be under maintenance while we update archive systems.",
    "мы улучшаем проверку платежей и синхронизацию с платежным провайдером.":
      "We are improving payment verification and provider synchronization.",
    "заявки на вывод проверяются вручную и обрабатываются согласно правилам архива.":
      "Withdrawal requests are reviewed manually and processed according to archive rules.",
    "пожалуйста, ознакомьтесь с актуальными правилами архива перед продолжением операций вывода.":
      "Please review the latest Archive Economy Rules before continuing withdrawal activity.",
    "пожалуйста, подтвердите telegram аккаунт и проверьте настройки безопасности профиля.":
      "Please verify your Telegram account and review your account security settings.",
  };

  return {
    title: titleTranslations[normalizedTitle] ?? title,
    body: bodyTranslations[normalizedBody] ?? body,
  };
}

function buildTelegramBilingualCaption(input: {
  title: string;
  body: string;
}) {
  const originalTitle = input.title.trim() || "ReboHrome notification";
  const originalBody =
    input.body.trim() || "A new ReboHrome archive notice is available.";
  const russian = translateBroadcastToRussian({
    title: originalTitle,
    body: originalBody,
  });
  const english = translateBroadcastToEnglish({
    title: originalTitle,
    body: originalBody,
  });
  const originalHasCyrillic = hasCyrillic(`${originalTitle} ${originalBody}`);
  const titleEn = originalHasCyrillic ? english.title : originalTitle;
  const bodyEn = originalHasCyrillic ? english.body : originalBody;
  const titleRu = originalHasCyrillic ? originalTitle : russian.title;
  const bodyRu = originalHasCyrillic ? originalBody : russian.body;

  return [
    "<b>🔔 ReboHrome Notification</b>",
    "",
    `<b>EN 🇺🇸 — ${escapeTelegramHtml(titleEn).slice(0, 120)}</b>`,
    `<blockquote>${escapeTelegramHtml(bodyEn).slice(0, 450)}</blockquote>`,
    "",
    `<b>RU 🇷🇺 — ${escapeTelegramHtml(titleRu || originalTitle).slice(0, 120)}</b>`,
    `<blockquote>${escapeTelegramHtml(bodyRu || originalBody).slice(0, 450)}</blockquote>`,
    "",
    "━━━━━━━━━━━━━━",
    "",
    "<i>ReboHrome Archive</i>",
  ].join("\n");
}

function getTelegramChannelCaptionPreview(input: {
  title: string;
  body: string;
}) {
  const originalTitle = input.title.trim() || "ReboHrome notification";
  const originalBody =
    input.body.trim() || "A new ReboHrome archive notice is available.";
  const russian = translateBroadcastToRussian({
    title: originalTitle,
    body: originalBody,
  });
  const english = translateBroadcastToEnglish({
    title: originalTitle,
    body: originalBody,
  });
  const originalHasCyrillic = hasCyrillic(`${originalTitle} ${originalBody}`);

  return {
    titleEn: originalHasCyrillic ? english.title : originalTitle,
    bodyEn: originalHasCyrillic ? english.body : originalBody,
    titleRu: originalHasCyrillic ? originalTitle : russian.title,
    bodyRu: originalHasCyrillic ? originalBody : russian.body,
    translated: !originalHasCyrillic,
    caption: buildTelegramBilingualCaption({
      title: originalTitle,
      body: originalBody,
    }),
  };
}

async function sendBroadcastTelegramChannelPost(input: {
  title: string;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}) {
  const preview = getTelegramChannelCaptionPreview({
    title: input.title,
    body: input.body,
  });
  const replyMarkup = buildTelegramChannelReplyMarkup({
    ctaLabel: input.ctaLabel,
    ctaUrl: input.ctaUrl,
  });
  const photoPath = path.join(
    process.cwd(),
    "public",
    "broadcast",
    "rebohrome-notification.png",
  );

  const result = await sendTelegramChannelPhotoFile(preview.caption, {
    photoPath,
    filename: "rebohrome-notification.png",
    replyMarkup,
  });

  return {
    ...result,
    caption: preview.caption,
    translated: preview.translated,
    imagePath: "public/broadcast/rebohrome-notification.png",
    channelId: TELEGRAM_CHANNEL_CHAT_ID,
    messageId: result.result?.message_id ? String(result.result.message_id) : null,
  };
}

export async function createBroadcast(input: {
  adminUserId: string;
  title: string;
  body: string;
  previewText?: string | null;
  type: string;
  priority?: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  targetType: string;
  targetFilters?: Record<string, unknown> | null;
  channels: string[];
  status?: "draft" | "scheduled" | "sending" | "sent";
  scheduledAt?: string | null;
  expiresAt?: string | null;
  internalNote?: string | null;
  showAsPopup?: boolean;
  popupPosition?: string;
  allowUserDismiss?: boolean;
}) {
  await ensureDatabase();
  await ensureArchiveTrustTables();
  const timestamp = nowIso();
  const id = randomUUID();
  const broadcastId = createReadableId("BRC");
  const channels = normalizeBroadcastChannels(input.channels);
  const status = input.status ?? (input.scheduledAt ? "scheduled" : "draft");

  await execute(
    `insert into broadcasts (
      id, broadcast_id, title, body, preview_text, type, priority, cta_label,
      cta_url, target_type, target_filters, channels, status, scheduled_at,
      sent_at, expires_at, created_by, updated_by, internal_note, show_as_popup,
      popup_position, allow_user_dismiss, is_active, deleted_at, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      broadcastId,
      input.title,
      input.body,
      input.previewText ?? null,
      input.type,
      input.priority ?? "normal",
      input.ctaLabel ?? null,
      input.ctaUrl ?? null,
      input.targetType,
      toJson(input.targetFilters ?? {}),
      toJson(channels),
      status,
      input.scheduledAt ?? null,
      null,
      input.expiresAt ?? null,
      input.adminUserId,
      input.adminUserId,
      input.internalNote ?? null,
      input.showAsPopup ? 1 : 0,
      input.popupPosition ?? "bottom-left",
      input.allowUserDismiss ? 1 : 0,
      1,
      null,
      timestamp,
      timestamp,
    ],
  );

  await appendArchiveLedgerEntry({
    eventType: "broadcast_created",
    adminId: input.adminUserId,
    entityType: "broadcast",
    entityId: id,
    title: "Broadcast created",
    description: `Admin created archive broadcast ${broadcastId}.`,
    metadata: {
      broadcastId,
      targetType: input.targetType,
      channels,
      status,
    },
  });

  return getBroadcastById(id);
}

export async function getBroadcastById(id: string) {
  await ensureDatabase();
  const row = await queryOne("select * from broadcasts where id = ? limit 1", [id]);
  return row ? normalizeBroadcast(row) : null;
}

export async function getAdminBroadcasts() {
  await ensureDatabase();
  await ensureArchiveTrustTables();
  const rows = await queryMany(
    `select * from broadcasts
     where deleted_at is null
     order by created_at desc`,
  );
  return rows.map((row) => normalizeBroadcast(row));
}

export async function getAdminBroadcastDebugStats() {
  await ensureDatabase();
  await ensureArchiveTrustTables();
  const broadcasts = await getAdminBroadcasts();
  const stats = [];

  for (const broadcast of broadcasts) {
    const targetUsers = await resolveBroadcastTargetUsers({
      targetType: broadcast.targetType,
      targetFilters: fromJson<Record<string, unknown>>(broadcast.targetFilters),
    });
    const [websiteRow, telegramRow] = await Promise.all([
      queryOne(
        `select count(*) as count from broadcast_deliveries
         where broadcast_id = ? and channel = 'website'`,
        [broadcast.id],
      ),
      queryOne(
        `select count(*) as count from broadcast_deliveries
         where broadcast_id = ? and channel = 'telegram'`,
        [broadcast.id],
      ),
    ]);
    const activePopupEligible =
      broadcast.showAsPopup &&
      broadcast.isActive &&
      !broadcast.deletedAt &&
      ["sent", "sending"].includes(broadcast.status) &&
      (!broadcast.expiresAt || broadcast.expiresAt > nowIso())
        ? targetUsers.filter((user) =>
            broadcast.targetType === "telegram_verified_users" ||
            broadcast.targetType === "verified_users"
              ? user.telegramVerified
              : true,
          ).length
        : 0;

    stats.push({
      broadcastId: broadcast.id,
      targetCount: targetUsers.length,
      websiteDeliveries: Number(websiteRow?.count ?? 0),
      telegramDeliveries: Number(telegramRow?.count ?? 0),
      activePopupEligible,
    });
  }

  return stats;
}

export async function getAdminArchiveLedger(input?: {
  query?: string | null;
  eventType?: string | null;
  limit?: number;
}) {
  await ensureDatabase();
  await ensureArchiveTrustTables();
  const where: string[] = ["1 = 1"];
  const args: SqlValue[] = [];
  const query = input?.query?.trim();
  if (query) {
    where.push(
      `(ledger_id like ? or user_id like ? or entity_id like ? or related_order_id like ? or related_transaction_id like ?)`,
    );
    const value = `%${query}%`;
    args.push(value, value, value, value, value);
  }
  if (input?.eventType) {
    where.push("event_type = ?");
    args.push(input.eventType);
  }
  const rows = await queryMany(
    `select * from archive_ledger
     where ${where.join(" and ")}
     order by created_at desc
     limit ?`,
    [...args, Math.min(Math.max(input?.limit ?? 100, 1), 250)],
  );
  return rows.map((row) => normalizeArchiveLedger(row));
}

export async function verifyArchiveLedgerEntry(id: string) {
  await ensureDatabase();
  const row = await queryOne("select * from archive_ledger where id = ? limit 1", [id]);
  if (!row) {
    return null;
  }
  const record = normalizeArchiveLedger(row);
  const expected = buildArchiveLedgerHash({
    eventType: record.eventType,
    entityId: record.entityId,
    metadata: record.metadata ?? "{}",
    previousHash: record.previousHash,
    createdAt: record.createdAt,
  });
  return {
    record,
    valid: expected === record.eventHash,
    expectedHash: expected,
  };
}

type ProviderIntelligenceRange = "24h" | "7d" | "30d" | "all";

function resolveProviderWindow(range: ProviderIntelligenceRange = "24h") {
  const now = Date.now();
  if (range === "7d") {
    return {
      range,
      label: "Last 7 days",
      from: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  if (range === "30d") {
    return {
      range,
      label: "Last 30 days",
      from: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  if (range === "all") {
    return {
      range,
      label: "All time",
      from: null,
    };
  }
  return {
    range: "24h" as const,
    label: "Last 24 hours",
    from: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
  };
}

function buildProviderFilters(input: {
  from: string | null;
  environment: "production" | "test" | "development" | "all";
}) {
  const where = ["payment_provider = 'TransVoucher'"];
  const args: SqlValue[] = [];
  if (input.from) {
    where.push("created_at >= ?");
    args.push(input.from);
  }
  if (input.environment !== "all") {
    where.push("coalesce(environment, 'production') = ?");
    args.push(input.environment);
  }
  return {
    clause: where.join(" and "),
    args,
  };
}

export async function getProviderIntelligence(input?: {
  range?: ProviderIntelligenceRange;
  environment?: "production" | "test" | "development" | "all";
}) {
  await ensureDatabase();
  await ensurePaymentReconciliationRunsTable();
  await ensureArchiveTrustTables();
  const selectedWindow = resolveProviderWindow(input?.range ?? "24h");
  const environment = input?.environment ?? "production";
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const filter = buildProviderFilters({
    from: selectedWindow.from,
    environment,
  });
  const reconciliationWhere = selectedWindow.from
    ? "provider = 'TransVoucher' and started_at >= ?"
    : "provider = 'TransVoucher'";
  const reconciliationArgs = selectedWindow.from ? [selectedWindow.from] : [];
  const webhookWhere = selectedWindow.from
    ? "provider = 'TransVoucher' and received_at >= ?"
    : "provider = 'TransVoucher'";
  const webhookArgs = selectedWindow.from ? [selectedWindow.from] : [];
  const [
    lastRun,
    created,
    succeeded,
    failed,
    expired,
    pending,
    pending15,
    pending60,
    lastWebhook,
    invalidWebhooks,
    duplicateWebhooks,
    failedReasons,
    reconciliationTotals,
  ] = await Promise.all([
    queryOne(
      `select * from payment_reconciliation_runs
       where provider = 'TransVoucher'
       order by started_at desc
       limit 1`,
    ),
    queryOne(`select count(*) as count from transactions where ${filter.clause}`, filter.args),
    queryOne(
      `select count(*) as count from transactions where ${filter.clause} and status = 'completed'`,
      filter.args,
    ),
    queryOne(
      `select count(*) as count from transactions where ${filter.clause} and status = 'failed'`,
      filter.args,
    ),
    queryOne(
      `select count(*) as count from transactions where ${filter.clause} and status = 'expired'`,
      filter.args,
    ),
    queryOne(
      `select count(*) as count from transactions
       where ${filter.clause}
         and status in ('pending', 'attempting', 'processing')`,
      filter.args,
    ),
    queryOne(
      `select count(*) as count from transactions
       where payment_provider = 'TransVoucher'
         and coalesce(environment, 'production') = ?
         and status in ('pending', 'attempting', 'processing')
         and created_at >= ?
         and created_at < ?`,
      [environment, dayAgo, new Date(Date.now() - 15 * 60 * 1000).toISOString()],
    ),
    queryOne(
      `select count(*) as count from transactions
       where payment_provider = 'TransVoucher'
         and coalesce(environment, 'production') = ?
         and status in ('pending', 'attempting', 'processing')
         and created_at >= ?
         and created_at < ?`,
      [environment, dayAgo, new Date(Date.now() - 60 * 60 * 1000).toISOString()],
    ),
    queryOne(
      `select * from webhook_events
       where provider = 'TransVoucher'
       order by received_at desc
       limit 1`,
    ),
    queryOne(
      `select count(*) as count from webhook_events where ${webhookWhere} and valid_signature = 0`,
      webhookArgs,
    ),
    queryOne(
      `select count(*) as count from webhook_events where ${webhookWhere} and duplicate = 1`,
      webhookArgs,
    ),
    queryMany(
      `select coalesce(last_error, provider_status, 'unknown') as reason, count(*) as count
       from transactions
       where ${filter.clause} and status = 'failed'
       group by coalesce(last_error, provider_status, 'unknown')
       order by count desc
       limit 6`,
      filter.args,
    ),
    queryOne(
      `select
        coalesce(sum(checked_count), 0) as checked,
        coalesce(sum(succeeded_count), 0) as succeeded,
        coalesce(sum(failed_count), 0) as failed,
        coalesce(sum(expired_count), 0) as expired,
        coalesce(sum(skipped_count), 0) as skipped
       from payment_reconciliation_runs
       where ${reconciliationWhere}`,
      reconciliationArgs,
    ),
  ]);

  async function successRate(since: string | null) {
    const successFilter = buildProviderFilters({
      from: since,
      environment,
    });
    const row = await queryOne(
      `select
        sum(case when status = 'completed' then 1 else 0 end) as succeeded,
        sum(case when status in ('completed', 'failed', 'expired') then 1 else 0 end) as completed_attempts
       from transactions
       where ${successFilter.clause}`,
      successFilter.args,
    );
    const completedAttempts = Number(row?.completed_attempts ?? 0);
    return completedAttempts > 0
      ? Math.round((Number(row?.succeeded ?? 0) / completedAttempts) * 100)
      : 0;
  }

  const [success24h, success7d, success30d] = await Promise.all([
    successRate(dayAgo),
    successRate(weekAgo),
    successRate(monthAgo),
  ]);
  const createdCount = Number(created?.count ?? 0);
  const succeededCount = Number(succeeded?.count ?? 0);
  const failedCount = Number(failed?.count ?? 0);
  const pendingCount = Number(pending?.count ?? 0);
  const expiredCount = Number(expired?.count ?? 0);
  const completedAttempts = succeededCount + failedCount + expiredCount;
  const selectedSuccessRate =
    completedAttempts > 0 ? Math.round((succeededCount / completedAttempts) * 100) : 0;
  const pending15Count = Number(pending15?.count ?? 0);
  const hasRecentReconciliationError = Boolean(
    lastRun?.last_error &&
      lastRun?.started_at &&
      (!selectedWindow.from || String(lastRun.started_at) >= selectedWindow.from),
  );
  const status =
    createdCount === 0
      ? "No recent activity"
      : (completedAttempts >= 5 && selectedSuccessRate < 70) ||
          pending15Count > 10 ||
          hasRecentReconciliationError
        ? "Degraded"
        : "Operational";

  return {
    provider: "TransVoucher",
    status,
    window: selectedWindow.label,
    range: selectedWindow.range,
    environment: environment === "all" ? "All environments" : "Production",
    lastApiCheck: lastRun?.started_at ? String(lastRun.started_at) : null,
    lastWebhookReceived: lastWebhook?.received_at ? String(lastWebhook.received_at) : null,
    lastReconciliationRun: lastRun?.started_at ? String(lastRun.started_at) : null,
    funnel: {
      created: createdCount,
      succeeded: succeededCount,
      failed: failedCount,
      expired: expiredCount,
      pending: pendingCount,
    },
    successRate: {
      last24h: success24h,
      last7d: success7d,
      last30d: success30d,
    },
    pendingTooLong: {
      over15m: pending15Count,
      over1h: Number(pending60?.count ?? 0),
    },
    reconciliation: {
      checked: Number(reconciliationTotals?.checked ?? 0),
      succeeded: Number(reconciliationTotals?.succeeded ?? 0),
      failed: Number(reconciliationTotals?.failed ?? 0),
      expired: Number(reconciliationTotals?.expired ?? 0),
      skipped: Number(reconciliationTotals?.skipped ?? 0),
      lastError: lastRun?.last_error ? String(lastRun.last_error) : null,
    },
    webhook: {
      invalidSignatureCount: Number(invalidWebhooks?.count ?? 0),
      duplicateCount: Number(duplicateWebhooks?.count ?? 0),
    },
    failedReasons: failedReasons.map((row) => ({
      reason: String(row.reason),
      count: Number(row.count ?? 0),
    })),
  };
}

export async function sendBroadcastNow(input: {
  broadcastId: string;
  adminUserId: string;
}) {
  await ensureDatabase();
  const broadcast = await getBroadcastById(input.broadcastId);

  if (!broadcast) {
    throw new Error("Broadcast not found.");
  }

  if (broadcast.deletedAt || !broadcast.isActive) {
    throw new Error("Broadcast is not active.");
  }

  const timestamp = nowIso();
  const channels = fromJson<string[]>(broadcast.channels) ?? ["website"];
  const targetUsers = await resolveBroadcastTargetUsers({
    targetType: broadcast.targetType,
    targetFilters: fromJson<Record<string, unknown>>(broadcast.targetFilters),
  });
  let delivered = 0;
  let failed = 0;
  let skipped = 0;
  let telegramChannelStatus: "not_requested" | "delivered" | "skipped" | "failed" =
    "not_requested";

  await execute(
    "update broadcasts set status = 'sending', updated_at = ? where id = ?",
    [timestamp, broadcast.id],
  );

  if (channels.includes("telegram")) {
    try {
      const channelResult = await sendBroadcastTelegramChannelPost({
        title: broadcast.title,
        body: broadcast.body,
        ctaLabel: broadcast.ctaLabel,
        ctaUrl: broadcast.ctaUrl,
      });
      telegramChannelStatus = channelResult.skipped ? "skipped" : "delivered";
      await execute(
        `update broadcasts set
          telegram_channel_enabled = 1,
          telegram_channel_id = ?,
          telegram_channel_message_id = ?,
          telegram_channel_status = ?,
          telegram_channel_error = null,
          telegram_channel_sent_at = ?,
          telegram_channel_caption = ?,
          telegram_channel_translated = ?,
          telegram_channel_image_path = ?,
          updated_at = ?
         where id = ?`,
        [
          channelResult.channelId || TELEGRAM_CHANNEL_CHAT_ID,
          channelResult.messageId,
          telegramChannelStatus,
          timestamp,
          channelResult.caption,
          channelResult.translated ? 1 : 0,
          channelResult.imagePath,
          timestamp,
          broadcast.id,
        ],
      );
      if (channelResult.skipped) {
        skipped += 1;
      }
    } catch (error) {
      telegramChannelStatus = "failed";
      failed += 1;
      await execute(
        `update broadcasts set
          telegram_channel_enabled = 1,
          telegram_channel_id = ?,
          telegram_channel_status = 'failed',
          telegram_channel_error = ?,
          telegram_channel_sent_at = null,
          telegram_channel_caption = ?,
          telegram_channel_translated = ?,
          telegram_channel_image_path = ?,
          updated_at = ?
         where id = ?`,
        [
          TELEGRAM_CHANNEL_CHAT_ID,
          error instanceof Error ? error.message : "Telegram channel delivery failed.",
          getTelegramChannelCaptionPreview({
            title: broadcast.title,
            body: broadcast.body,
          }).caption,
          looksEnglish(`${broadcast.title} ${broadcast.body}`) ? 1 : 0,
          "public/broadcast/rebohrome-notification.png",
          timestamp,
          broadcast.id,
        ],
      );
      console.warn("[broadcast] Telegram channel post failed.", error);
    }
  }

  for (const user of targetUsers) {
    if (channels.includes("website")) {
      const notificationId = randomUUID();
      await execute(
        `insert into user_notifications (
          id, user_id, broadcast_id, type, title, body, cta_label, cta_url,
          show_as_popup, dismissed_at, read_at, expires_at, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          notificationId,
          user.id,
          broadcast.id,
          broadcast.type,
          broadcast.title,
          broadcast.body,
          broadcast.ctaLabel,
          broadcast.ctaUrl,
          broadcast.showAsPopup ? 1 : 0,
          null,
          null,
          broadcast.expiresAt,
          timestamp,
        ],
      );
      await execute(
        `insert into broadcast_deliveries (
          id, broadcast_id, user_id, channel, status, delivered_at, read_at,
          skipped_reason, error_message, telegram_message_id, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          broadcast.id,
          user.id,
          "website",
          "delivered",
          timestamp,
          null,
          null,
          null,
          null,
          timestamp,
          timestamp,
        ],
      );
      delivered += 1;
    }

    if (channels.includes("telegram")) {
      if (!user.telegramVerified || !user.telegramChatId) {
        await execute(
          `insert into broadcast_deliveries (
            id, broadcast_id, user_id, channel, status, delivered_at, read_at,
            skipped_reason, error_message, telegram_message_id, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            broadcast.id,
            user.id,
            "telegram",
            "skipped",
            null,
            null,
            "Telegram is not verified or chat_id is missing.",
            null,
            null,
            timestamp,
            timestamp,
          ],
        );
        skipped += 1;
        continue;
      }

      try {
        const result = await sendTelegramUserMessage(
          user.telegramChatId,
          buildBroadcastTelegramMessage({
            title: broadcast.title,
            body: broadcast.body,
            type: broadcast.type,
          }),
          broadcast.ctaUrl
            ? {
                replyMarkup: {
                  inline_keyboard: [
                    [
                      {
                        text: broadcast.ctaLabel ?? "Open",
                        url: broadcast.ctaUrl,
                      },
                    ],
                  ],
                },
              }
            : undefined,
        );
        await execute(
          `insert into broadcast_deliveries (
            id, broadcast_id, user_id, channel, status, delivered_at, read_at,
            skipped_reason, error_message, telegram_message_id, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            broadcast.id,
            user.id,
            "telegram",
            result.skipped ? "skipped" : "delivered",
            result.skipped ? null : timestamp,
            null,
            result.skipped ? "Telegram bot token is not configured." : null,
            null,
            result.result?.message_id ? String(result.result.message_id) : null,
            timestamp,
            timestamp,
          ],
        );
        if (result.skipped) {
          skipped += 1;
        } else {
          delivered += 1;
        }
      } catch (error) {
        await execute(
          `insert into broadcast_deliveries (
            id, broadcast_id, user_id, channel, status, delivered_at, read_at,
            skipped_reason, error_message, telegram_message_id, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            broadcast.id,
            user.id,
            "telegram",
            "failed",
            null,
            null,
            null,
            error instanceof Error ? error.message : "Telegram delivery failed.",
            null,
            timestamp,
            timestamp,
          ],
        );
        failed += 1;
      }
    }
  }

  const status = failed > 0 && delivered > 0 ? "partially_failed" : failed > 0 ? "failed" : "sent";
  await execute(
    "update broadcasts set status = ?, sent_at = ?, updated_at = ? where id = ?",
    [status, timestamp, timestamp, broadcast.id],
  );
  await appendArchiveLedgerEntry({
    eventType: "broadcast_sent",
    adminId: input.adminUserId,
    entityType: "broadcast",
    entityId: broadcast.id,
    title: "Broadcast sent",
    description: `Archive broadcast ${broadcast.broadcastId} was delivered.`,
    metadata: {
      targetCount: targetUsers.length,
      channels,
      delivered,
      failed,
      skipped,
      telegramChannelStatus,
    },
  });
  await notifySafely(() =>
    sendTelegramAdminMessage(
      [
        "<b>Broadcast Sent</b>",
        "",
        `Title: ${escapeTelegramHtml(broadcast.title)}`,
        `Type: ${escapeTelegramHtml(broadcast.type)}`,
        `Audience: ${escapeTelegramHtml(broadcast.targetType)}`,
        `Channels: ${escapeTelegramHtml(channels.join(", "))}`,
        `Delivered: ${delivered}`,
        `Failed: ${failed}`,
        `Skipped: ${skipped}`,
        `Time: ${escapeTelegramHtml(formatUtcDateTime(timestamp))} UTC`,
      ].join("\n"),
    ),
  );
  revalidatePath("/notifications");
  revalidateAdmin();
  return { delivered, failed, skipped, targetCount: targetUsers.length, status };
}

export async function retryBroadcastTelegramChannel(input: {
  broadcastId: string;
  adminUserId: string;
}) {
  await ensureDatabase();
  const broadcast = await getBroadcastById(input.broadcastId);

  if (!broadcast) {
    throw new Error("Broadcast not found.");
  }

  if (broadcast.deletedAt || !broadcast.isActive) {
    throw new Error("Broadcast is not active.");
  }

  const channels = fromJson<string[]>(broadcast.channels) ?? [];
  if (!channels.includes("telegram")) {
    throw new Error("Broadcast does not have Telegram delivery enabled.");
  }

  const timestamp = nowIso();
  let channelResult: Awaited<ReturnType<typeof sendBroadcastTelegramChannelPost>>;

  try {
    channelResult = await sendBroadcastTelegramChannelPost({
      title: broadcast.title,
      body: broadcast.body,
      ctaLabel: broadcast.ctaLabel,
      ctaUrl: broadcast.ctaUrl,
    });
  } catch (error) {
    await execute(
      `update broadcasts set
        telegram_channel_status = 'failed',
        telegram_channel_error = ?,
        updated_at = ?
       where id = ?`,
      [
        error instanceof Error ? error.message : "Telegram channel delivery failed.",
        timestamp,
        broadcast.id,
      ],
    );
    throw error;
  }

  await execute(
    `update broadcasts set
      status = 'sent',
      sent_at = coalesce(sent_at, ?),
      telegram_channel_enabled = 1,
      telegram_channel_id = ?,
      telegram_channel_message_id = ?,
      telegram_channel_status = ?,
      telegram_channel_error = null,
      telegram_channel_sent_at = ?,
      telegram_channel_caption = ?,
      telegram_channel_translated = ?,
      telegram_channel_image_path = ?,
      updated_at = ?
     where id = ?`,
    [
      timestamp,
      channelResult.channelId || TELEGRAM_CHANNEL_CHAT_ID,
      channelResult.messageId,
      channelResult.skipped ? "skipped" : "delivered",
      timestamp,
      channelResult.caption,
      channelResult.translated ? 1 : 0,
      channelResult.imagePath,
      timestamp,
      broadcast.id,
    ],
  );

  await appendArchiveLedgerEntry({
    eventType: "broadcast_sent",
    adminId: input.adminUserId,
    entityType: "broadcast",
    entityId: broadcast.id,
    title: "Telegram channel broadcast retried",
    description: `Telegram channel post for ${broadcast.broadcastId} was delivered.`,
    metadata: {
      broadcastId: broadcast.broadcastId,
      channel: "telegram",
      retryOnly: true,
      timestamp,
    },
  });

  revalidateAdmin();
  return { ok: true as const, broadcastId: broadcast.id };
}

export async function deleteBroadcast(input: {
  broadcastId: string;
  adminUserId: string;
}) {
  await ensureDatabase();
  const timestamp = nowIso();
  await execute(
    `update broadcasts set
      is_active = 0,
      deleted_at = ?,
      updated_by = ?,
      updated_at = ?
     where id = ?`,
    [timestamp, input.adminUserId, timestamp, input.broadcastId],
  );
  await appendArchiveLedgerEntry({
    eventType: "broadcast_deleted",
    adminId: input.adminUserId,
    entityType: "broadcast",
    entityId: input.broadcastId,
    title: "Broadcast removed",
    description: "Admin removed an archive broadcast and disabled any popup.",
    metadata: { deletedAt: timestamp },
  });
  revalidatePath("/notifications");
  revalidateAdmin();
}

export async function getUserNotifications(userId: string) {
  await ensureDatabase();
  await ensureArchiveTrustTables();
  const rows = await queryMany(
    `select * from user_notifications
     where user_id = ?
       and (expires_at is null or expires_at > ?)
     order by created_at desc`,
    [userId, nowIso()],
  );
  return rows.map((row) => normalizeUserNotification(row));
}

export async function getUnreadNotificationCount(userId: string) {
  await ensureDatabase();
  const row = await queryOne(
    `select count(*) as count from user_notifications
     where user_id = ?
       and read_at is null
       and (expires_at is null or expires_at > ?)`,
    [userId, nowIso()],
  );
  return Number(row?.count ?? 0);
}

export async function markNotificationRead(input: {
  userId: string;
  notificationId?: string | null;
  all?: boolean;
}) {
  await ensureDatabase();
  const timestamp = nowIso();
  if (input.all) {
    await execute(
      "update user_notifications set read_at = coalesce(read_at, ?) where user_id = ?",
      [timestamp, input.userId],
    );
  } else if (input.notificationId) {
    await execute(
      "update user_notifications set read_at = coalesce(read_at, ?) where user_id = ? and id = ?",
      [timestamp, input.userId, input.notificationId],
    );
  }
  revalidatePath("/notifications");
}

export async function getActiveUserPopups(userId: string) {
  await ensureDatabase();
  const user = await getUserById(userId);

  if (!user || !user.telegramVerified || user.isDeleted || user.status === "blocked") {
    return [];
  }

  const timestamp = nowIso();
  const notificationRows = await queryMany(
    `select user_notifications.*
     from user_notifications
     inner join broadcasts on broadcasts.id = user_notifications.broadcast_id
     where user_notifications.user_id = ?
       and broadcasts.is_active = 1
       and broadcasts.deleted_at is null
       and broadcasts.show_as_popup = 1
       and broadcasts.status in ('sent', 'sending')
       and user_notifications.show_as_popup = 1
       and (broadcasts.expires_at is null or broadcasts.expires_at > ?)
       and (
         broadcasts.allow_user_dismiss = 0
         or user_notifications.dismissed_at is null
     )
     order by user_notifications.created_at desc
     limit 1`,
    [userId, timestamp],
  );
  if (notificationRows.length > 0) {
    return notificationRows.map((row) => normalizeUserNotification(row));
  }

  const broadcastRows = await queryMany(
    `select broadcasts.*
     from broadcasts
     where broadcasts.is_active = 1
       and broadcasts.deleted_at is null
       and broadcasts.show_as_popup = 1
       and broadcasts.status in ('sent', 'sending')
       and (broadcasts.expires_at is null or broadcasts.expires_at > ?)
       and (
         broadcasts.target_type not in ('telegram_verified_users', 'verified_users')
         or ? = 1
       )
     order by broadcasts.created_at desc
     limit 1`,
    [timestamp, user.telegramVerified ? 1 : 0],
  );

  return broadcastRows.map((row) => {
    const broadcast = normalizeBroadcast(row);
    return {
      id: broadcast.id,
      userId,
      broadcastId: broadcast.id,
      type: broadcast.type,
      title: broadcast.title,
      body: broadcast.body,
      ctaLabel: broadcast.ctaLabel,
      ctaUrl: broadcast.ctaUrl,
      showAsPopup: true,
      dismissedAt: null,
      readAt: null,
      expiresAt: broadcast.expiresAt,
      createdAt: broadcast.createdAt,
    };
  });
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
    await ensureApplicationColumns();
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
      profiles.telegram_chat_id, profiles.telegram_verified, profiles.telegram_verified_at,
      profiles.withdrawal_wallet, profiles.verified
     from users
     inner join profiles on profiles.user_id = users.id
     where users.username = ?
       and coalesce(users.is_deleted, 0) = 0
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
      user_id, role, telegram_username, telegram_id, telegram_chat_id,
      telegram_verified, telegram_verified_at, telegram_linked_at, withdrawal_wallet,
      verified, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      "admin",
      normalizeTelegramUsername(ADMIN_SEED_TELEGRAM),
      null,
      null,
      1,
      timestamp,
      timestamp,
      null,
      1,
      timestamp,
      timestamp,
    ],
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
      profiles.telegram_chat_id, profiles.telegram_verified, profiles.telegram_verified_at,
      profiles.withdrawal_wallet, profiles.verified
     from users
     inner join profiles on profiles.user_id = users.id
     where users.id = ?
     limit 1`,
    [userId],
  );
}

async function getUserRowByTelegramHandle(telegramUsername: string) {
  const handle = normalizeTelegramUsername(telegramUsername);
  return queryOne(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.telegram_chat_id, profiles.telegram_verified, profiles.telegram_verified_at,
      profiles.withdrawal_wallet, profiles.verified
     from users
     inner join profiles on profiles.user_id = users.id
     where profiles.telegram_username = ? or profiles.telegram_id = ?
     limit 1`,
    [handle, handle],
  );
}

async function getUserRowByTelegramId(telegramId: string | number) {
  return queryOne(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.telegram_chat_id, profiles.telegram_verified, profiles.telegram_verified_at,
      profiles.withdrawal_wallet, profiles.verified
     from users
     inner join profiles on profiles.user_id = users.id
     where profiles.telegram_id = ?
     limit 1`,
    [String(telegramId)],
  );
}

async function getUserRowByUsername(username: string) {
  return queryOne(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.telegram_chat_id, profiles.telegram_verified, profiles.telegram_verified_at,
      profiles.withdrawal_wallet, profiles.verified
     from users
     inner join profiles on profiles.user_id = users.id
     where users.username = ?
     limit 1`,
    [normalizeUsername(username)],
  );
}

async function getTelegramIdentityRowByUsername(telegramUsername: string) {
  return queryOne(
    `select * from telegram_identities
     where telegram_username = ?
     order by updated_at desc
     limit 1`,
    [normalizeTelegramUsername(telegramUsername)],
  );
}

async function getTelegramIdentityRowByTelegramId(telegramId: string) {
  return queryOne(
    "select * from telegram_identities where telegram_id = ? limit 1",
    [normalizeTelegramNumericId(telegramId)],
  );
}

async function getTelegramVerificationCodeRowById(verificationId: string) {
  return queryOne(
    "select * from telegram_verification_codes where id = ? limit 1",
    [verificationId],
  );
}

async function assertRegistrationAvailability(input: {
  username: string;
  email: string;
  telegramUsername: string;
  telegramId?: string | null;
  ignoreVerificationId?: string | null;
}) {
  const [existingUser, existingEmail, existingTelegram] = await Promise.all([
    queryOne("select id from users where username = ? limit 1", [input.username]),
    queryOne("select id from users where email = ? limit 1", [input.email]),
    queryOne("select user_id from profiles where telegram_username = ? limit 1", [
      input.telegramUsername,
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

  if (input.telegramId) {
    const existingTelegramId = await queryOne(
      "select user_id from profiles where telegram_id = ? limit 1",
      [input.telegramId],
    );

    if (existingTelegramId) {
      throw new Error("This Telegram account is already connected to another account.");
    }
  }

  const pendingVerification = await queryOne(
    `select id, username, email
     from telegram_verification_codes
     where purpose = ?
       and telegram_username = ?
       and consumed_at is null
       and verified_at is null
       and expires_at >= ?
       and (? is null or id <> ?)
     order by created_at desc
     limit 1`,
    [
      TELEGRAM_VERIFICATION_PURPOSE_REGISTRATION,
      input.telegramUsername,
      nowIso(),
      input.ignoreVerificationId ?? null,
      input.ignoreVerificationId ?? null,
    ],
  );

  if (
    pendingVerification &&
    (String(pendingVerification.username) !== input.username ||
      String(pendingVerification.email) !== input.email)
  ) {
    throw new Error(
      "A verification is already in progress for this Telegram username. Please finish it or wait for it to expire.",
    );
  }
}

function assertPasswordStrength(password: string) {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error("Password must include at least one letter and one number.");
  }
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
    normalized === "rejected"
  ) {
    return "failed";
  }

  if (normalized === "expired" || normalized === "timeout") {
    return "expired";
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

function isProviderExpiredStatus(status: string) {
  return mapProviderStatusToTransactionStatus(status) === "expired";
}

function isProviderTerminalFailureStatus(status: string) {
  return isProviderFailedStatus(status) || isProviderExpiredStatus(status);
}

function getNextTransVoucherCheckAt(createdAt: string, checkedAt = nowIso()) {
  const createdMs = new Date(createdAt).getTime();
  const checkedMs = new Date(checkedAt).getTime();
  const ageMinutes = Number.isFinite(createdMs)
    ? Math.max(0, (checkedMs - createdMs) / 60_000)
    : 60;

  if (ageMinutes < 15) {
    return new Date(checkedMs + 60_000).toISOString();
  }

  if (ageMinutes < 60) {
    return new Date(checkedMs + 5 * 60_000).toISOString();
  }

  return new Date(checkedMs + 15 * 60_000).toISOString();
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
  requestedAmount: number;
  basePayoutPercent: number;
  bonusPayoutPercent: number;
  finalPayoutPercent: number;
  payoutAmount: number;
  totalDeposited: number;
  requestId: string;
  status: WithdrawalStatus;
  updatedAt: string;
  updatedBy: string;
  sourceDepositId: string | null;
  sourceCardMasked: string | null;
  sourceCardholderName: string | null;
  syncStatus: TelegramSyncStatus;
}) {
  const progress = getPayoutTierProgress(input.totalDeposited);

  return [
    "<b>New Withdrawal Request</b>",
    "",
    `User: ${input.telegramUsername}`,
    `Username: ${input.username}`,
    `Telegram ID: ${input.telegramId}`,
    `Wallet: <code>${input.walletAddress}</code>`,
    "",
    `Requested Amount: ${formatUsd(input.requestedAmount)}`,
    "",
    "Payout Calculation:",
    `Base Percent: ${input.basePayoutPercent}%`,
    `User Bonus: +${input.bonusPayoutPercent}%`,
    `Final Percent: ${input.finalPayoutPercent}%`,
    `Final Payout Amount: ${formatUsd(input.payoutAmount)}`,
    "",
    `Total Deposited: ${formatUsd(input.totalDeposited)}`,
    `Progress: ${formatUsd(input.totalDeposited)} / ${formatUsd(progress.nextThreshold)}`,
    "",
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
  await sendTelegramAdminMessage(
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

  await sendTelegramAdminMessage(
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
  await sendTelegramAdminMessage(
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
  await sendTelegramAdminMessage(
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
  await sendTelegramAdminMessage(
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
  if (TELEGRAM_BOT_TOKEN && ADMIN_TELEGRAM_CHAT_ID) {
    return true;
  }

  if (!missingSecurityTelegramWarningLogged) {
    console.warn(
      "Telegram security notifications are disabled because TELEGRAM_BOT_TOKEN or ADMIN_TELEGRAM_CHAT_ID is missing.",
    );
    missingSecurityTelegramWarningLogged = true;
  }

  return false;
}

async function sendSecurityTelegramNotification(message: string) {
  if (!canSendSecurityTelegramNotification()) {
    return;
  }

  await notifySafely(() => sendTelegramAdminMessage(message));
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

function buildVerificationCodeTelegramMessage(code: string) {
  return [
    "<b>Your ReboHrome verification code:</b>",
    "",
    `<code>${escapeTelegramHtml(code)}</code>`,
    "",
    "This code expires in 10 minutes.",
    "If you did not request this, ignore this message.",
    "",
    "Do not share this code with anyone.",
  ].join("\n");
}

function buildUserEmailChangedAdminTelegramMessage(input: {
  username: string;
  telegramUsername: string;
  oldEmail: string;
  newEmail: string;
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  timestamp: string;
}) {
  return [
    "<b>User Email Changed</b>",
    "",
    `Username: ${escapeTelegramHtml(getSecurityFieldValue(input.username))}`,
    `Telegram: ${escapeTelegramHtml(getSecurityFieldValue(input.telegramUsername))}`,
    `Old email: ${escapeTelegramHtml(getSecurityFieldValue(input.oldEmail))}`,
    `New email: ${escapeTelegramHtml(getSecurityFieldValue(input.newEmail))}`,
    `IP: ${escapeTelegramHtml(getSecurityFieldValue(input.ipAddress))}`,
    `Country: ${escapeTelegramHtml(getSecurityFieldValue(input.country))}`,
    `User Agent: ${escapeTelegramHtml(truncateForTelegram(input.userAgent, 280))}`,
    `Language: ${escapeTelegramHtml(getSecurityFieldValue(input.language))}`,
    `Time: ${escapeTelegramHtml(formatTelegramTimestamp(input.timestamp))}`,
  ].join("\n");
}

function buildUserEmailChangedTelegramMessage(input: {
  oldEmail: string;
  newEmail: string;
}) {
  return [
    "<b>Your ReboHrome account email was changed.</b>",
    "",
    `Old email: ${escapeTelegramHtml(input.oldEmail)}`,
    `New email: ${escapeTelegramHtml(input.newEmail)}`,
    "",
    "If this was not you, contact support immediately.",
  ].join("\n");
}

function buildMaintenanceModeTelegramMessage(input: {
  enabled: boolean;
  adminUsername: string;
  estimatedReturnAt?: string | null;
  internalNote?: string | null;
  timestamp: string;
}) {
  const lines = [
    input.enabled
      ? "<b>Maintenance Mode Enabled</b>"
      : "<b>Maintenance Mode Disabled</b>",
    "",
    `${input.enabled ? "Enabled" : "Disabled"} by: ${escapeTelegramHtml(
      getSecurityFieldValue(input.adminUsername),
    )}`,
  ];

  if (input.enabled && input.estimatedReturnAt) {
    lines.push(
      `Estimated return: ${escapeTelegramHtml(
        formatTelegramTimestamp(input.estimatedReturnAt),
      )}`,
    );
  }

  if (input.enabled && input.internalNote) {
    lines.push(`Reason: ${escapeTelegramHtml(input.internalNote)}`);
  }

  lines.push(`Time: ${escapeTelegramHtml(formatTelegramTimestamp(input.timestamp))}`);
  return lines.join("\n");
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

export async function trackUserEmailChanged(input: SecurityAuditEventInput) {
  await ensureDatabase();
  await insertSecurityAuditEvent({
    ...input,
    eventType: "user_email_changed",
  });
}

async function resolveMaintenanceAdminUsername(userId: string | null) {
  if (!userId) {
    return null;
  }

  const row = await queryOne("select username from users where id = ? limit 1", [userId]);
  return row?.username ? String(row.username) : null;
}

async function getMaintenanceModeSettingRow() {
  if (!(await tableExists("system_settings"))) {
    return null;
  }

  return queryOne(
    "select * from system_settings where key = ? limit 1",
    [SYSTEM_SETTING_KEY_MAINTENANCE_MODE],
  );
}

export async function getMaintenanceModeConfig() {
  await ensureDatabase();
  const defaults = getDefaultMaintenanceModeConfig();
  const row = await getMaintenanceModeSettingRow();

  if (!row?.value) {
    return defaults;
  }

  const parsed = fromJson<Partial<MaintenanceModeConfig>>(row.value) ?? {};
  const base = normalizeMaintenanceModeConfig({
    ...parsed,
    updatedByUserId: row.updated_by ? String(row.updated_by) : parsed.updatedByUserId,
    updatedAt: row.updated_at ? String(row.updated_at) : parsed.updatedAt,
  });

  const [updatedByUsername, lastEnabledByUsername, lastDisabledByUsername] =
    await Promise.all([
      resolveMaintenanceAdminUsername(base.updatedByUserId),
      resolveMaintenanceAdminUsername(base.lastEnabledByUserId),
      resolveMaintenanceAdminUsername(base.lastDisabledByUserId),
    ]);

  return normalizeMaintenanceModeConfig({
    ...base,
    updatedByUsername,
    lastEnabledByUsername,
    lastDisabledByUsername,
  });
}

export async function updateMaintenanceModeConfig(input: {
  adminUserId: string;
  adminUsername: string;
  enabled: boolean;
  title?: string | null;
  message?: string | null;
  estimatedReturnAt?: string | null;
  internalNote?: string | null;
  ipAddress?: string | null;
  route?: string | null;
}) {
  await ensureDatabase();
  await ensureSystemSettingsTable();

  const previous = await getMaintenanceModeConfig();
  const timestamp = nowIso();
  const next = normalizeMaintenanceModeConfig({
    ...previous,
    enabled: input.enabled,
    title: input.title ?? previous.title,
    message: input.message ?? previous.message,
    estimatedReturnAt: input.estimatedReturnAt ?? null,
    internalNote: input.internalNote ?? null,
    updatedAt: timestamp,
    updatedByUserId: input.adminUserId,
    updatedByUsername: input.adminUsername,
    lastEnabledAt:
      input.enabled && !previous.enabled ? timestamp : previous.lastEnabledAt,
    lastEnabledByUserId:
      input.enabled && !previous.enabled
        ? input.adminUserId
        : previous.lastEnabledByUserId,
    lastEnabledByUsername:
      input.enabled && !previous.enabled
        ? input.adminUsername
        : previous.lastEnabledByUsername,
    lastDisabledAt:
      !input.enabled && previous.enabled ? timestamp : previous.lastDisabledAt,
    lastDisabledByUserId:
      !input.enabled && previous.enabled
        ? input.adminUserId
        : previous.lastDisabledByUserId,
    lastDisabledByUsername:
      !input.enabled && previous.enabled
        ? input.adminUsername
        : previous.lastDisabledByUsername,
  });

  await execute(
    `insert into system_settings (
      key, value, updated_by, updated_at
    ) values (?, ?, ?, ?)
    on conflict(key) do update set
      value = excluded.value,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at`,
    [
      SYSTEM_SETTING_KEY_MAINTENANCE_MODE,
      toJson(next),
      input.adminUserId,
      timestamp,
    ],
  );

  const stateChanged = previous.enabled !== next.enabled;
  const action = stateChanged
    ? next.enabled
      ? "maintenance_enabled"
      : "maintenance_disabled"
    : "maintenance_updated";
  const message = stateChanged
    ? next.enabled
      ? "Enabled maintenance mode."
      : "Disabled maintenance mode."
    : "Updated maintenance mode settings.";

  await logAdminAction(
    input.adminUserId,
    action,
    "system_setting",
    SYSTEM_SETTING_KEY_MAINTENANCE_MODE,
    message,
    {
      metadata: {
        ipAddress: input.ipAddress ?? null,
        route: input.route ?? null,
        previousState: previous,
        nextState: next,
      },
    },
  );

  await sendSecurityTelegramNotification(
    buildMaintenanceModeTelegramMessage({
      enabled: next.enabled,
      adminUsername: input.adminUsername,
      estimatedReturnAt: next.estimatedReturnAt,
      internalNote: next.internalNote,
      timestamp,
    }),
  );

  revalidatePath("/maintenance");
  revalidatePath("/login");
  revalidatePath("/contact");
  revalidateStorefront();
  revalidatePrivate();
  revalidateAdmin();

  return next;
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
    case "reject":
      return "declined";
    case "complete":
    case "paid":
      return "completed";
    default:
      throw new Error("Unsupported withdrawal action.");
  }
}

function normalizeTelegramWithdrawalAction(actionType: string) {
  const normalized = actionType.trim().toLowerCase();
  if (normalized === "reject") {
    return "decline";
  }
  if (normalized === "paid") {
    return "complete";
  }
  return normalized;
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
      balances.total_deposited,
      updater.username as updated_by_username,
      updater_profiles.telegram_username as updated_by_telegram_username
     from withdrawal_requests
     inner join users on users.id = withdrawal_requests.user_id
     inner join profiles on profiles.user_id = users.id
     inner join balances on balances.user_id = users.id
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
    totalDeposited: Number(row.total_deposited ?? 0),
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
        { id: "decline", label: "Reject" },
      ] as const;
    case "approved":
      return [
        { id: "processing", label: "Processing" },
        { id: "complete", label: "Mark Paid" },
        { id: "decline", label: "Reject" },
      ] as const;
    case "processing":
      return [
        { id: "complete", label: "Mark Paid" },
        { id: "decline", label: "Reject" },
      ] as const;
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
    const callbackAction =
      actionType === "decline" ? "reject" : actionType === "complete" ? "paid" : actionType;
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
      callbackData: `withdrawal:${callbackAction}:${input.withdrawalId}`,
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

  if (!ADMIN_TELEGRAM_CHAT_ID) {
    await updateWithdrawalTelegramSyncState({
      withdrawalId,
      syncStatus: "error",
      lastError: "Missing ADMIN_TELEGRAM_CHAT_ID configuration.",
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
    requestedAmount: context.request.requestedAmount,
    basePayoutPercent: context.request.basePayoutPercent,
    bonusPayoutPercent: context.request.bonusPayoutPercent,
    finalPayoutPercent: context.request.finalPayoutPercent,
    payoutAmount: context.request.payoutAmount,
    totalDeposited: context.totalDeposited,
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
        chatId: ADMIN_TELEGRAM_CHAT_ID,
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

async function upsertTelegramUserFromStart(input: {
  telegramId: string;
  telegramUsername: string;
  chatId: string;
  firstName?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
}) {
  const timestamp = nowIso();
  const telegramId = normalizeTelegramNumericId(input.telegramId);

  if (!telegramId) {
    throw new Error("Telegram /start payload is missing a valid numeric Telegram ID.");
  }

  const existingIdentity = await getTelegramIdentityRowByTelegramId(telegramId);
  const matchingProfile =
    (await queryOne(
      `select user_id from profiles
       where telegram_id = ? or telegram_username = ?
       limit 1`,
      [telegramId, input.telegramUsername],
    )) ?? null;
  const linkedUserId = existingIdentity?.linked_user_id
    ? String(existingIdentity.linked_user_id)
    : matchingProfile?.user_id
      ? String(matchingProfile.user_id)
      : null;

  await execute(
    `insert into telegram_identities (
      id, telegram_id, telegram_username, chat_id, first_name, last_name,
      language_code, linked_user_id, is_linked, first_seen_at, last_seen_at,
      created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(telegram_id) do update set
      telegram_username = excluded.telegram_username,
      chat_id = excluded.chat_id,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      language_code = excluded.language_code,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at`,
    [
      existingIdentity?.id ? String(existingIdentity.id) : randomUUID(),
      telegramId,
      input.telegramUsername,
      input.chatId,
      input.firstName ?? null,
      input.lastName ?? null,
      input.languageCode ?? null,
      linkedUserId,
      linkedUserId ? 1 : 0,
      existingIdentity?.first_seen_at ? String(existingIdentity.first_seen_at) : timestamp,
      timestamp,
      existingIdentity?.created_at ? String(existingIdentity.created_at) : timestamp,
      timestamp,
    ],
  );

  await execute(
    `insert into telegram_users (
      telegram_username, telegram_chat_id, first_name, last_name, last_seen_at, created_at
    ) values (?, ?, ?, ?, ?, ?)
    on conflict(telegram_username) do update set
      telegram_chat_id = excluded.telegram_chat_id,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      last_seen_at = excluded.last_seen_at`,
    [
      input.telegramUsername,
      input.chatId,
      input.firstName ?? null,
      input.lastName ?? null,
      timestamp,
      timestamp,
    ],
  );

  await execute(
    `update profiles set
      telegram_id = ?,
      telegram_chat_id = ?,
      telegram_verified = 1,
      telegram_verified_at = coalesce(telegram_verified_at, ?),
      telegram_linked_at = coalesce(telegram_linked_at, ?),
      verified = 1,
      updated_at = ?
     where telegram_username = ? or telegram_id = ?`,
    [telegramId, input.chatId, timestamp, timestamp, timestamp, input.telegramUsername, telegramId],
  );

  if (linkedUserId) {
    await execute(
      `update profiles set
        telegram_username = ?,
        telegram_id = ?,
        telegram_chat_id = ?,
        telegram_verified = 1,
        telegram_verified_at = coalesce(telegram_verified_at, ?),
        telegram_linked_at = coalesce(telegram_linked_at, ?),
        verified = 1,
        updated_at = ?
       where user_id = ?`,
      [
        input.telegramUsername,
        telegramId,
        input.chatId,
        timestamp,
        timestamp,
        timestamp,
        linkedUserId,
      ],
    );
  }
}

export async function getAdminByTelegramUsername(telegramUsername: string) {
  await ensureDatabase();
  const row = await getUserRowByTelegramHandle(telegramUsername);

  if (!row) {
    return null;
  }

  const user = normalizeUser(row);
  return user.role === "admin" ? user : null;
}

async function getAdminByTelegramMessageSender(message: NonNullable<TelegramUpdate["message"]>) {
  const telegramId = message.from?.id ? String(message.from.id) : "";
  const messageUsername = message.from?.username
    ? normalizeTelegramUsername(message.from.username)
    : null;
  const adminIdAllowedByEnv =
    telegramId && ADMIN_TELEGRAM_IDS.length > 0 && ADMIN_TELEGRAM_IDS.includes(telegramId);

  if (telegramId) {
    const rowByTelegramId = await getUserRowByTelegramId(telegramId);
    if (rowByTelegramId) {
      const user = normalizeUser(rowByTelegramId);
      if (user.role === "admin") {
        return {
          admin: user,
          label: messageUsername ?? user.telegramUsername ?? telegramId,
          authorized: true,
        };
      }
    }
  }

  if (messageUsername) {
    const admin = await getAdminByTelegramUsername(messageUsername);
    if (admin) {
      return {
        admin,
        label: messageUsername,
        authorized: true,
      };
    }
  }

  if (adminIdAllowedByEnv) {
    const seedRow = await getUserRowByUsername(ADMIN_SEED_USERNAME);
    if (seedRow) {
      const seedAdmin = normalizeUser(seedRow);
      if (seedAdmin.role === "admin") {
        return {
          admin: seedAdmin,
          label: messageUsername ?? telegramId,
          authorized: true,
        };
      }
    }
  }

  return {
    admin: null,
    label: messageUsername ?? message.from?.first_name ?? telegramId,
    authorized: false,
  };
}

async function getAdminByTelegramCallbackSender(callback: NonNullable<TelegramUpdate["callback_query"]>) {
  const telegramId = String(callback.from.id);
  const callbackUsername = callback.from.username
    ? normalizeTelegramUsername(callback.from.username)
    : null;
  const adminIdAllowedByEnv =
    ADMIN_TELEGRAM_IDS.length > 0 && ADMIN_TELEGRAM_IDS.includes(telegramId);

  const rowByTelegramId = await getUserRowByTelegramId(telegramId);
  if (rowByTelegramId) {
    const user = normalizeUser(rowByTelegramId);
    if (user.role === "admin") {
      return {
        admin: user,
        label: callbackUsername ?? user.telegramUsername ?? telegramId,
        authorized: true,
      };
    }
  }

  if (callbackUsername) {
    const admin = await getAdminByTelegramUsername(callbackUsername);
    if (admin) {
      return {
        admin,
        label: callbackUsername,
        authorized: true,
      };
    }
  }

  if (adminIdAllowedByEnv) {
    const seedRow = await getUserRowByUsername(ADMIN_SEED_USERNAME);
    if (seedRow) {
      const seedAdmin = normalizeUser(seedRow);
      if (seedAdmin.role === "admin") {
        return {
          admin: seedAdmin,
          label: callbackUsername ?? telegramId,
          authorized: true,
        };
      }
    }
  }

  return {
    admin: null,
    label: callbackUsername ?? callback.from.first_name ?? telegramId,
    authorized: false,
  };
}

async function processWithdrawalDirectCallback(callback: NonNullable<TelegramUpdate["callback_query"]>) {
  const parts = String(callback.data ?? "").split(":");
  const [, rawAction, withdrawalId] = parts;
  const actionType = normalizeTelegramWithdrawalAction(rawAction ?? "");

  if (parts.length !== 3 || !actionType || !withdrawalId) {
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Malformed withdrawal action.",
      showAlert: true,
    });
    return { ok: false as const, error: "Malformed withdrawal callback data." };
  }

  let targetStatus: WithdrawalStatus;
  try {
    targetStatus = getWithdrawalTargetStatus(actionType);
  } catch {
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Unsupported withdrawal action.",
      showAlert: true,
    });
    return { ok: false as const, error: "Unsupported withdrawal action." };
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

  const sender = await getAdminByTelegramCallbackSender(callback);
  const chatId = String(callback.message?.chat.id ?? "");
  const chatAllowed =
    !ADMIN_TELEGRAM_CHAT_ID || !chatId || chatId === String(ADMIN_TELEGRAM_CHAT_ID);

  if (!sender.authorized || !sender.admin || !chatAllowed) {
    await insertWithdrawalHistory({
      withdrawalId,
      actionType: `unauthorized-${actionType}`,
      previousStatus: context.request.status,
      nextStatus: context.request.status,
      source: "telegram-unauthorized",
      adminUsername: sender.label,
      note: `Unauthorized Telegram callback attempt from ${sender.label}.`,
    });
    revalidateAdmin();
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Not authorized",
      showAlert: true,
    });
    return { ok: false as const, error: "Unauthorized callback sender." };
  }

  if (!canTransitionWithdrawalStatus(context.request.status, targetStatus)) {
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: `Cannot change ${context.request.status} to ${targetStatus}.`,
      showAlert: true,
    });
    return { ok: false as const, error: "Invalid withdrawal transition." };
  }

  await updateWithdrawalStatus({
    withdrawalId,
    status: targetStatus,
    adminUserId: sender.admin.id,
    adminNote: `Telegram action by ${sender.label}: ${rawAction}`,
    source: "telegram",
  });

  await answerTelegramCallbackSafely({
    callbackQueryId: callback.id,
    text: `${formatCleanOperationalWithdrawalStatus(targetStatus)} applied`,
    showAlert: false,
  });

  return { ok: true as const, withdrawalId, status: targetStatus };
}

function parseTelegramSendsCommand(text: string) {
  const payload = text.replace(/^\/sends(?:@\w+)?\s*/i, "").trim();
  if (!payload) {
    return null;
  }

  const pipeParts = payload.split("|").map((part) => part.trim()).filter(Boolean);
  if (pipeParts.length >= 2) {
    return {
      title: pipeParts[0],
      body: pipeParts.slice(1).join(" | "),
    };
  }

  const lines = payload.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length >= 2) {
    return {
      title: lines[0],
      body: lines.slice(1).join("\n"),
    };
  }

  return null;
}

type TelegramBroadcastDraftPayload = {
  title?: string;
  body?: string;
  targetType?: "all_users" | "telegram_verified_users" | "admin_notice_only";
  showAsPopup?: boolean;
  channelEnabled?: boolean;
};

function getTelegramAdminIdFromMessage(message: NonNullable<TelegramUpdate["message"]>) {
  return message.from?.id ? String(message.from.id) : "";
}

function getTelegramAdminIdFromCallback(callback: NonNullable<TelegramUpdate["callback_query"]>) {
  return callback.from.id ? String(callback.from.id) : "";
}

function getBroadcastTargetLabel(targetType?: string) {
  if (targetType === "all_users") {
    return "All users";
  }
  if (targetType === "telegram_verified_users") {
    return "Verified users";
  }
  if (targetType === "admin_notice_only") {
    return "Admin notice only";
  }
  return "Not selected";
}

function buildTelegramBroadcastDraftPreview(payload: TelegramBroadcastDraftPayload) {
  const title = payload.title ?? "Broadcast title";
  const body = payload.body ?? "Broadcast message";
  return [
    buildTelegramBilingualCaption({ title, body }),
    "",
    `<b>Target:</b> ${escapeTelegramHtml(getBroadcastTargetLabel(payload.targetType))}`,
    `<b>Popup:</b> ${payload.showAsPopup ? "Yes" : "No"}`,
    `<b>Channel:</b> ${payload.channelEnabled === false ? "No" : "Yes"}`,
  ].join("\n");
}

async function saveTelegramBroadcastSession(input: {
  telegramAdminId: string;
  step: string;
  payload: TelegramBroadcastDraftPayload;
}) {
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const existing = await queryOne(
    `select id from telegram_admin_sessions
     where telegram_admin_id = ? and command = 'sends'
     limit 1`,
    [input.telegramAdminId],
  );

  if (existing?.id) {
    await execute(
      `update telegram_admin_sessions set
        step = ?,
        payload = ?,
        expires_at = ?,
        updated_at = ?
       where id = ?`,
      [input.step, toJson(input.payload), expiresAt, timestamp, String(existing.id)],
    );
    return String(existing.id);
  }

  const id = randomUUID();
  await execute(
    `insert into telegram_admin_sessions (
      id, telegram_admin_id, command, step, payload, expires_at, created_at, updated_at
    ) values (?, ?, 'sends', ?, ?, ?, ?, ?)`,
    [id, input.telegramAdminId, input.step, toJson(input.payload), expiresAt, timestamp, timestamp],
  );
  return id;
}

async function getTelegramBroadcastSession(telegramAdminId: string) {
  const row = await queryOne(
    `select * from telegram_admin_sessions
     where telegram_admin_id = ? and command = 'sends'
     limit 1`,
    [telegramAdminId],
  );

  if (!row) {
    return null;
  }

  if (String(row.expires_at) < nowIso()) {
    await execute("delete from telegram_admin_sessions where id = ?", [String(row.id)]);
    return {
      expired: true as const,
      id: String(row.id),
      step: String(row.step),
      payload: fromJson<TelegramBroadcastDraftPayload>(row.payload) ?? {},
    };
  }

  return {
    expired: false as const,
    id: String(row.id),
    step: String(row.step),
    payload: fromJson<TelegramBroadcastDraftPayload>(row.payload) ?? {},
  };
}

async function clearTelegramBroadcastSession(telegramAdminId: string) {
  await execute(
    "delete from telegram_admin_sessions where telegram_admin_id = ? and command = 'sends'",
    [telegramAdminId],
  );
}

async function startTelegramSendsConversation(message: NonNullable<TelegramUpdate["message"]>) {
  const telegramAdminId = getTelegramAdminIdFromMessage(message);
  await saveTelegramBroadcastSession({
    telegramAdminId,
    step: "title",
    payload: {},
  });
  await notifySafely(() =>
    sendTelegramUserMessage(message.chat.id, "Send broadcast title."),
  );
  return { ok: true as const, event: "sends-started" };
}

async function processTelegramSendsSessionMessage(
  message: NonNullable<TelegramUpdate["message"]>,
) {
  const telegramAdminId = getTelegramAdminIdFromMessage(message);
  const session = await getTelegramBroadcastSession(telegramAdminId);

  if (!session) {
    return null;
  }

  if (session.expired) {
    await notifySafely(() =>
      sendTelegramUserMessage(
        message.chat.id,
        "Broadcast draft expired. Send /sends to start again.",
      ),
    );
    return { ok: true as const, event: "sends-expired" };
  }

  const text = String(message.text ?? "").trim();
  if (!text || text.length > 1200) {
    await notifySafely(() =>
      sendTelegramUserMessage(message.chat.id, "Please send text under 1200 characters."),
    );
    return { ok: true as const, event: "sends-invalid-text" };
  }

  if (session.step === "title") {
    const payload = { ...session.payload, title: text.slice(0, 140) };
    await saveTelegramBroadcastSession({
      telegramAdminId,
      step: "body",
      payload,
    });
    await notifySafely(() =>
      sendTelegramUserMessage(message.chat.id, "Send broadcast message."),
    );
    return { ok: true as const, event: "sends-title-saved" };
  }

  if (session.step === "body") {
    const payload = { ...session.payload, body: text.slice(0, 900) };
    await saveTelegramBroadcastSession({
      telegramAdminId,
      step: "target",
      payload,
    });
    await notifySafely(() =>
      sendTelegramUserMessage(message.chat.id, "Choose target audience.", {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "All users", callback_data: "broadcast_target:all_users" },
              { text: "Verified users", callback_data: "broadcast_target:telegram_verified_users" },
            ],
            [{ text: "Admin notice only", callback_data: "broadcast_target:admin_notice_only" }],
          ],
        },
      }),
    );
    return { ok: true as const, event: "sends-body-saved" };
  }

  await notifySafely(() =>
    sendTelegramUserMessage(message.chat.id, "Please use the buttons to continue."),
  );
  return { ok: true as const, event: "sends-awaiting-callback" };
}

async function processTelegramSendsCommand(message: NonNullable<TelegramUpdate["message"]>) {
  const sender = await getAdminByTelegramMessageSender(message);
  const chatAllowed =
    !ADMIN_TELEGRAM_CHAT_ID || String(message.chat.id) === String(ADMIN_TELEGRAM_CHAT_ID);

  if (!sender.authorized || !sender.admin || !chatAllowed) {
    await notifySafely(() =>
      sendTelegramUserMessage(message.chat.id, "Not authorized"),
    );
    return { ok: false as const, error: "Unauthorized /sends sender." };
  }

  const parsed = parseTelegramSendsCommand(message.text ?? "");
  if (!parsed) {
    return startTelegramSendsConversation(message);
  }

  const broadcast = await createBroadcast({
    adminUserId: sender.admin.id,
    title: parsed.title,
    body: parsed.body,
    type: "admin_notice",
    priority: "normal",
    ctaLabel: "Open ReboHrome",
    ctaUrl: "https://www.rebohrome.com",
    targetType: "telegram_channel",
    channels: ["telegram"],
    status: "draft",
  });

  if (!broadcast) {
    await notifySafely(() =>
      sendTelegramUserMessage(message.chat.id, "Broadcast preview could not be created."),
    );
    return { ok: false as const, error: "Broadcast preview could not be created." };
  }

  await notifySafely(() =>
    sendTelegramUserMessage(message.chat.id, buildTelegramBilingualCaption(parsed), {
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: "Send broadcast",
              callback_data: `bc_send:${broadcast.id}`,
            },
            {
              text: "Cancel",
              callback_data: `bc_cancel:${broadcast.id}`,
            },
          ],
        ],
      },
    }),
  );

  return { ok: true as const, broadcastId: broadcast.id, event: "sends-preview" };
}

async function processTelegramBroadcastSessionCallback(
  callback: NonNullable<TelegramUpdate["callback_query"]>,
) {
  const sender = await getAdminByTelegramCallbackSender(callback);
  const chatId = callback.message?.chat.id;
  const telegramAdminId = getTelegramAdminIdFromCallback(callback);

  if (!sender.authorized || !sender.admin || !chatId) {
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Not authorized",
      showAlert: true,
    });
    return { ok: false as const, error: "Unauthorized broadcast session callback." };
  }

  const data = String(callback.data ?? "");

  if (data === "broadcast_cancel") {
    await clearTelegramBroadcastSession(telegramAdminId);
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Broadcast canceled.",
      showAlert: false,
    });
    await notifySafely(() => sendTelegramUserMessage(chatId, "Broadcast canceled."));
    return { ok: true as const, event: "sends-canceled" };
  }

  const session = await getTelegramBroadcastSession(telegramAdminId);
  if (!session || session.expired) {
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Draft expired.",
      showAlert: true,
    });
    await notifySafely(() =>
      sendTelegramUserMessage(chatId, "Broadcast draft expired. Send /sends to start again."),
    );
    return { ok: true as const, event: "sends-expired" };
  }

  if (data.startsWith("broadcast_target:")) {
    const [, target] = data.split(":");
    const targetType =
      target === "verified_users" ? "telegram_verified_users" : target;
    const payload = {
      ...session.payload,
      targetType: ["all_users", "telegram_verified_users", "admin_notice_only"].includes(targetType)
        ? (targetType as TelegramBroadcastDraftPayload["targetType"])
        : "telegram_verified_users",
    };
    await saveTelegramBroadcastSession({
      telegramAdminId,
      step: "popup",
      payload,
    });
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Target saved.",
      showAlert: false,
    });
    await notifySafely(() =>
      sendTelegramUserMessage(chatId, "Show as persistent popup?", {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "Yes", callback_data: "broadcast_popup:yes" },
              { text: "No", callback_data: "broadcast_popup:no" },
            ],
          ],
        },
      }),
    );
    return { ok: true as const, event: "sends-target-saved" };
  }

  if (data.startsWith("broadcast_popup:")) {
    const payload = {
      ...session.payload,
      showAsPopup: data.endsWith(":yes"),
    };
    await saveTelegramBroadcastSession({
      telegramAdminId,
      step: "channel",
      payload,
    });
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Popup choice saved.",
      showAlert: false,
    });
    await notifySafely(() =>
      sendTelegramUserMessage(chatId, "Duplicate to Telegram channel?", {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "Yes", callback_data: "broadcast_channel:yes" },
              { text: "No", callback_data: "broadcast_channel:no" },
            ],
          ],
        },
      }),
    );
    return { ok: true as const, event: "sends-popup-saved" };
  }

  if (data.startsWith("broadcast_channel:")) {
    const payload = {
      ...session.payload,
      channelEnabled: data.endsWith(":yes"),
    };
    await saveTelegramBroadcastSession({
      telegramAdminId,
      step: "preview",
      payload,
    });
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Channel choice saved.",
      showAlert: false,
    });
    await notifySafely(() =>
      sendTelegramUserMessage(chatId, buildTelegramBroadcastDraftPreview(payload), {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "Send broadcast", callback_data: "broadcast_send" },
              { text: "Cancel", callback_data: "broadcast_cancel" },
            ],
          ],
        },
      }),
    );
    return { ok: true as const, event: "sends-preview" };
  }

  if (data === "broadcast_send") {
    const payload = session.payload;
    if (!payload.title || !payload.body || !payload.targetType) {
      await answerTelegramCallbackSafely({
        callbackQueryId: callback.id,
        text: "Draft is incomplete.",
        showAlert: true,
      });
      return { ok: false as const, error: "Incomplete broadcast draft." };
    }

    const channels = [
      payload.targetType === "admin_notice_only" ? null : "website",
      payload.channelEnabled === false ? null : "telegram",
    ].filter((item): item is string => Boolean(item));

    const broadcast = await createBroadcast({
      adminUserId: sender.admin.id,
      title: payload.title,
      body: payload.body,
      type: "admin_notice",
      priority: "normal",
      ctaLabel: "Open ReboHrome",
      ctaUrl: "https://www.rebohrome.com",
      targetType: payload.targetType,
      targetFilters: {
        createdFrom: "telegram_bot",
        telegramAdminId,
        telegramAdminUsername: callback.from.username ?? null,
      },
      channels: channels.length > 0 ? channels : ["telegram"],
      status: "draft",
      internalNote: `Created from Telegram bot by ${callback.from.username ?? telegramAdminId}.`,
      showAsPopup:
        payload.targetType === "telegram_verified_users" && Boolean(payload.showAsPopup),
      allowUserDismiss: false,
    });

    if (!broadcast) {
      await answerTelegramCallbackSafely({
        callbackQueryId: callback.id,
        text: "Failed to create broadcast.",
        showAlert: true,
      });
      return { ok: false as const, error: "Failed to create website broadcast." };
    }

    try {
      const result = await sendBroadcastNow({
        broadcastId: broadcast.id,
        adminUserId: sender.admin.id,
      });
      await clearTelegramBroadcastSession(telegramAdminId);
      await answerTelegramCallbackSafely({
        callbackQueryId: callback.id,
        text: "Broadcast sent.",
        showAlert: false,
      });
      await notifySafely(() =>
        sendTelegramUserMessage(
          chatId,
          [
            "<b>Broadcast sent</b>",
            "",
            `Target: ${escapeTelegramHtml(getBroadcastTargetLabel(payload.targetType))}`,
            `Delivered: ${result.delivered}`,
            `Failed: ${result.failed}`,
            `Skipped: ${result.skipped}`,
          ].join("\n"),
        ),
      );
      return { ok: true as const, event: "sends-sent", broadcastId: broadcast.id };
    } catch (error) {
      await answerTelegramCallbackSafely({
        callbackQueryId: callback.id,
        text: "Broadcast failed.",
        showAlert: true,
      });
      await notifySafely(() =>
        sendTelegramUserMessage(
          chatId,
          `Website broadcast created, but delivery failed: ${escapeTelegramHtml(
            error instanceof Error ? error.message : "Unknown error",
          )}`,
        ),
      );
      return { ok: false as const, error: "Broadcast delivery failed." };
    }
  }

  await answerTelegramCallbackSafely({
    callbackQueryId: callback.id,
    text: "Unsupported broadcast action.",
    showAlert: true,
  });
  return { ok: false as const, error: "Unsupported broadcast session action." };
}

async function processBroadcastTelegramCallback(callback: NonNullable<TelegramUpdate["callback_query"]>) {
  const [action, broadcastId] = String(callback.data ?? "").split(":");
  const sender = await getAdminByTelegramCallbackSender(callback);
  const chatId = String(callback.message?.chat.id ?? "");
  const chatAllowed =
    !ADMIN_TELEGRAM_CHAT_ID || !chatId || chatId === String(ADMIN_TELEGRAM_CHAT_ID);

  if (!sender.authorized || !sender.admin || !chatAllowed) {
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Not authorized",
      showAlert: true,
    });
    return { ok: false as const, error: "Unauthorized broadcast callback sender." };
  }

  if (!broadcastId) {
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Broadcast not found.",
      showAlert: true,
    });
    return { ok: false as const, error: "Missing broadcast id." };
  }

  const broadcast = await getBroadcastById(broadcastId);
  if (!broadcast) {
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Broadcast not found.",
      showAlert: true,
    });
    return { ok: false as const, error: "Broadcast not found." };
  }

  const timestamp = nowIso();

  if (action === "bc_cancel") {
    await execute(
      "update broadcasts set status = 'canceled', is_active = 0, updated_at = ? where id = ?",
      [timestamp, broadcast.id],
    );
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Broadcast canceled.",
      showAlert: false,
    });
    return { ok: true as const, broadcastId: broadcast.id, status: "canceled" };
  }

  if (action !== "bc_send") {
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Unsupported broadcast action.",
      showAlert: true,
    });
    return { ok: false as const, error: "Unsupported broadcast action." };
  }

  await sendBroadcastTelegramChannelPost({
    title: broadcast.title,
    body: broadcast.body,
    ctaLabel: broadcast.ctaLabel,
    ctaUrl: broadcast.ctaUrl,
  });
  await execute(
    "update broadcasts set status = 'sent', sent_at = ?, updated_at = ? where id = ?",
    [timestamp, timestamp, broadcast.id],
  );
  await answerTelegramCallbackSafely({
    callbackQueryId: callback.id,
    text: "Broadcast sent.",
    showAlert: false,
  });

  return { ok: true as const, broadcastId: broadcast.id, status: "sent" };
}

export async function processTelegramUpdate(update: TelegramUpdate) {
  await ensureDatabase();

  const message = update.message;

  if (message?.text?.startsWith("/start")) {
    const telegramUsername = message.from?.username
      ? normalizeTelegramUsername(message.from.username)
      : null;

    if (!telegramUsername) {
      await notifySafely(() =>
        sendTelegramUserMessage(
          message.chat.id,
          [
            "<b>ReboHrome verification needs a Telegram username.</b>",
            "",
            "Please set a public Telegram username in Telegram settings, then press Start again.",
          ].join("\n"),
        ),
      );

      return { ok: true as const, skipped: false as const, event: "start-missing-username" };
    }

    await upsertTelegramUserFromStart({
      telegramId: String(message.from?.id ?? ""),
      telegramUsername,
      chatId: String(message.chat.id),
      firstName: message.from?.first_name ?? null,
      lastName: message.from?.last_name ?? null,
      languageCode: message.from?.language_code ?? null,
    });

    await notifySafely(() =>
      sendTelegramUserMessage(
        message.chat.id,
        [
          "<b>ReboHrome verification is active.</b>",
          "",
          "You can now return to the website and request your 6-digit code.",
        ].join("\n"),
      ),
    );

    return { ok: true as const, skipped: false as const, event: "start-linked" };
  }

  if (message?.text?.startsWith("/sends")) {
    return processTelegramSendsCommand(message);
  }

  if (message?.text) {
    const sessionResult = await processTelegramSendsSessionMessage(message);
    if (sessionResult) {
      return sessionResult;
    }
  }

  const callback = update.callback_query;

  if (callback?.data?.startsWith("broadcast_")) {
    return processTelegramBroadcastSessionCallback(callback);
  }

  if (callback?.data?.startsWith("bc_")) {
    return processBroadcastTelegramCallback(callback);
  }

  if (callback?.data?.startsWith("withdrawal:")) {
    return processWithdrawalDirectCallback(callback);
  }

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

  if (!admin || (ADMIN_TELEGRAM_CHAT_ID && chatId !== String(ADMIN_TELEGRAM_CHAT_ID))) {
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
  revalidatePath("/admin/settings");
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
          require_password_reset integer not null default 0,
          is_deleted integer not null default 0,
          deleted_at text,
          deleted_by text,
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
          telegram_chat_id text,
          telegram_verified integer not null default 0,
          telegram_verified_at text,
          telegram_linked_at text,
          withdrawal_wallet text,
          verified integer not null default 1,
          created_at text not null,
          updated_at text not null
        )`,
      );

      await execute(
        `create table if not exists telegram_identities (
          id text primary key,
          telegram_id text not null unique,
          telegram_username text,
          chat_id text not null,
          first_name text,
          last_name text,
          language_code text,
          linked_user_id text unique,
          is_linked integer not null default 0,
          first_seen_at text not null,
          last_seen_at text not null,
          created_at text not null,
          updated_at text not null
        )`,
      );

      await execute(
        `create table if not exists telegram_verification_codes (
          id text primary key,
          telegram_id text not null,
          telegram_username text,
          telegram_chat_id text not null,
          purpose text not null,
          username text not null,
          email text not null,
          password_hash_temp text not null,
          code_hash text not null,
          expires_at text not null,
          attempts integer not null default 0,
          resend_count integer not null default 0,
          last_sent_at text not null,
          resend_window_started_at text not null,
          verified_at text,
          consumed_at text,
          ip text not null,
          country text,
          user_agent text,
          created_at text not null
        )`,
      );

      await execute(
        `create table if not exists telegram_users (
          telegram_username text primary key,
          telegram_chat_id text not null,
          first_name text,
          last_name text,
          last_seen_at text not null,
          created_at text not null
        )`,
      );

      await execute(
        `create table if not exists telegram_verifications (
          id text primary key,
          username text not null,
          email text not null,
          password_hash_temp text not null,
          telegram_username text not null,
          telegram_chat_id text not null,
          code_hash text not null,
          expires_at text not null,
          attempts integer not null default 0,
          resend_count integer not null default 0,
          last_sent_at text not null,
          resend_window_started_at text not null,
          verified_at text,
          consumed_at text,
          ip text not null,
          country text,
          user_agent text,
          created_at text not null
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
          paid_at text,
          provider_checked_at text,
          processed_at text,
          credited_at text,
          next_check_at text,
          last_error text,
          reconciliation_attempts integer not null default 0
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
          requested_amount integer,
          base_payout_percent integer not null default 60,
          bonus_payout_percent integer not null default 0,
          final_payout_percent integer not null default 60,
          payout_amount integer,
          wallet_address text not null,
          wallet_usdt_bep20 text,
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
          status_updated_by text,
          status_updated_at text,
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
        `create table if not exists system_settings (
          key text primary key,
          value text not null,
          updated_by text,
          updated_at text not null
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

      await ensureArchiveTrustTables();
      await ensureColumn("withdrawal_requests", "telegram_chat_id text");
      await ensureColumn("users", "require_password_reset integer not null default 0");
      await ensureColumn("profiles", "telegram_chat_id text");
      await ensureColumn("profiles", "telegram_verified integer not null default 0");
      await ensureColumn("profiles", "telegram_verified_at text");
      await ensureColumn("profiles", "telegram_linked_at text");
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
      await ensureApplicationColumns();

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
        `update withdrawal_requests set
          requested_amount = coalesce(requested_amount, amount),
          payout_amount = coalesce(payout_amount, amount),
          wallet_usdt_bep20 = coalesce(wallet_usdt_bep20, wallet_address),
          status_updated_at = coalesce(status_updated_at, updated_at)
         where requested_amount is null
            or payout_amount is null
            or wallet_usdt_bep20 is null
            or status_updated_at is null`,
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
      await execute(
        "update profiles set telegram_verified = coalesce(verified, 0) where telegram_verified is null",
      );
      await execute(
        "create unique index if not exists idx_profiles_telegram_id on profiles(telegram_id) where telegram_id is not null",
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

export async function createTelegramVerificationChallenge(input: {
  username: string;
  email: string;
  telegramUsername: string;
  password: string;
  ipAddress: string;
  country: string;
  userAgent: string;
}) {
  await ensureDatabase();

  const username = normalizeUsername(input.username);
  const email = normalizeEmail(input.email);
  const telegramUsername = normalizeTelegramUsername(input.telegramUsername);

  console.info("[telegram-registration] Send code requested.", {
    username,
    email,
    enteredTelegramUsername: input.telegramUsername,
    normalizedTelegramUsername: telegramUsername,
  });

  if (username.length < 3) {
    throw new Error("Username must be at least 3 characters.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (!isValidTelegramUsername(telegramUsername)) {
    throw new Error("Telegram username must start with @ and use 5-32 valid characters.");
  }

  assertPasswordStrength(input.password);
  const telegramIdentity = await getTelegramIdentityRowByUsername(telegramUsername);

  console.info("[telegram-registration] Telegram identity lookup finished.", {
    normalizedTelegramUsername: telegramUsername,
    identityFound: Boolean(telegramIdentity),
    hasChatId: Boolean(telegramIdentity?.chat_id),
  });

  if (!telegramIdentity?.chat_id) {
    throw new Error(
      `Please open @${TELEGRAM_BOT_USERNAME.replace(/^@/, "")} and press Start before requesting a code.`,
    );
  }

  const telegramId = normalizeTelegramNumericId(telegramIdentity.telegram_id);

  if (!telegramId) {
    throw new Error("Telegram verification is missing a valid Telegram identity.");
  }

  if (telegramIdentity.linked_user_id || Number(telegramIdentity.is_linked ?? 0) === 1) {
    throw new Error("This Telegram account is already connected to another account.");
  }

  await assertRegistrationAvailability({
    username,
    email,
    telegramUsername,
    telegramId,
  });

  const timestamp = nowIso();
  const nowMs = Date.now();
  const chatId = String(telegramIdentity.chat_id);
  const passwordHashTemp = hashPassword(input.password);
  const code = createVerificationCode();
  const codeHash = hashVerificationCode(code);
  const expiresAt = new Date(
    nowMs + TELEGRAM_VERIFICATION_TTL_MINUTES * 60 * 1000,
  ).toISOString();
  const existingVerification = await queryOne(
    `select * from telegram_verification_codes
     where username = ?
       and email = ?
       and purpose = ?
       and telegram_id = ?
       and telegram_username = ?
       and consumed_at is null
       and verified_at is null
     order by created_at desc
     limit 1`,
    [
      username,
      email,
      TELEGRAM_VERIFICATION_PURPOSE_REGISTRATION,
      telegramId,
      telegramUsername,
    ],
  );

  let verificationId: string = randomUUID();
  let resendCount = 0;
  let resendWindowStartedAt = timestamp;

  if (existingVerification) {
    verificationId = String(existingVerification.id);
    const lastSentAtMs = new Date(String(existingVerification.last_sent_at)).getTime();
    const cooldownEndsAtMs =
      lastSentAtMs + TELEGRAM_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000;

    if (Number.isFinite(cooldownEndsAtMs) && cooldownEndsAtMs > nowMs) {
      const retryAfter = Math.max(
        1,
        Math.ceil((cooldownEndsAtMs - nowMs) / 1000),
      );
      throw new Error(`Please wait ${retryAfter} seconds before requesting a new code.`);
    }

    const existingWindowStart = existingVerification.resend_window_started_at
      ? new Date(String(existingVerification.resend_window_started_at)).getTime()
      : Number.NaN;
    const windowStillActive =
      Number.isFinite(existingWindowStart) &&
      existingWindowStart + 60 * 60 * 1000 > nowMs;

    resendWindowStartedAt = windowStillActive
      ? String(existingVerification.resend_window_started_at)
      : timestamp;
    resendCount = windowStillActive ? Number(existingVerification.resend_count ?? 0) : 0;

    if (resendCount >= TELEGRAM_VERIFICATION_MAX_RESENDS_PER_HOUR) {
      throw new Error("Too many verification sends. Please wait before trying again.");
    }

    resendCount += 1;

    await execute(
      `update telegram_verification_codes set
        password_hash_temp = ?,
        telegram_id = ?,
        telegram_username = ?,
        telegram_chat_id = ?,
        code_hash = ?,
        expires_at = ?,
        attempts = 0,
        resend_count = ?,
        last_sent_at = ?,
        resend_window_started_at = ?,
        verified_at = null,
        consumed_at = null,
        ip = ?,
        country = ?,
        user_agent = ?,
        created_at = ?
       where id = ?`,
      [
        passwordHashTemp,
        telegramId,
        telegramUsername,
        chatId,
        codeHash,
        expiresAt,
        resendCount,
        timestamp,
        resendWindowStartedAt,
        input.ipAddress,
        input.country,
        input.userAgent,
        timestamp,
        verificationId,
      ],
    );
  } else {
    await execute(
      `insert into telegram_verification_codes (
        id, telegram_id, telegram_username, telegram_chat_id, purpose,
        username, email, password_hash_temp, code_hash, expires_at, attempts, resend_count,
        last_sent_at, resend_window_started_at, verified_at, consumed_at,
        ip, country, user_agent, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        verificationId,
        telegramId,
        telegramUsername,
        chatId,
        TELEGRAM_VERIFICATION_PURPOSE_REGISTRATION,
        username,
        email,
        passwordHashTemp,
        codeHash,
        expiresAt,
        0,
        1,
        timestamp,
        timestamp,
        null,
        null,
        input.ipAddress,
        input.country,
        input.userAgent,
        timestamp,
      ],
    );
  }

  try {
    await sendTelegramUserMessage(
      chatId,
      buildVerificationCodeTelegramMessage(code),
    );
  } catch (error) {
    console.error("[telegram-registration] Telegram sendMessage failed.", {
      normalizedTelegramUsername: telegramUsername,
      identityFound: true,
      hasChatId: Boolean(chatId),
      chatId,
      error:
        error instanceof Error ? error.message : "Unknown Telegram sendMessage error.",
    });
    throw new Error(
      error instanceof Error
        ? "Unable to send a Telegram code right now. Please check that you started the bot and try again."
        : "Unable to send a Telegram code right now.",
    );
  }

  return {
    verificationId,
    expiresAt,
    resendCooldownSeconds: TELEGRAM_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  };
}

export async function completeTelegramRegistrationVerification(input: {
  verificationId: string;
  code: string;
}) {
  await ensureDatabase();

  const verification = await getTelegramVerificationCodeRowById(input.verificationId);

  if (!verification) {
    throw new Error("Verification request not found. Request a new code.");
  }

  if (verification.consumed_at || verification.verified_at) {
    throw new Error("This verification code has already been used.");
  }

  if (new Date(String(verification.expires_at)).getTime() <= Date.now()) {
    throw new Error("This verification code has expired. Request a new one.");
  }

  const attempts = Number(verification.attempts ?? 0);

  if (attempts >= TELEGRAM_VERIFICATION_MAX_ATTEMPTS) {
    throw new Error("Too many invalid attempts. Request a new verification code.");
  }

  const normalizedCode = String(input.code ?? "").trim();

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error("Enter the 6-digit verification code.");
  }

  const codeHash = hashVerificationCode(normalizedCode);

  if (codeHash !== String(verification.code_hash)) {
    await execute(
      "update telegram_verification_codes set attempts = attempts + 1 where id = ?",
      [input.verificationId],
    );
    throw new Error("Invalid verification code.");
  }

  const username = String(verification.username);
  const email = String(verification.email);
  const telegramUsername = String(verification.telegram_username);
  const telegramId = normalizeTelegramNumericId(verification.telegram_id);
  const telegramChatId = String(verification.telegram_chat_id);
  const verifiedAt = nowIso();

  const identity = await getTelegramIdentityRowByTelegramId(telegramId);

  if (!identity?.chat_id) {
    throw new Error("Telegram identity is no longer linked. Press Start in the bot again.");
  }

  if (identity.linked_user_id || Number(identity.is_linked ?? 0) === 1) {
    throw new Error("This Telegram account is already connected to another account.");
  }

  await assertRegistrationAvailability({
    username,
    email,
    telegramUsername,
    telegramId,
    ignoreVerificationId: input.verificationId,
  });

  const userId = await registerUser({
    username,
    email,
    telegramUsername,
    passwordHash: String(verification.password_hash_temp),
    telegramId,
    telegramChatId,
    telegramVerifiedAt: verifiedAt,
    telegramLinkedAt: verifiedAt,
  });

  await execute(
    `update telegram_verification_codes set
      verified_at = ?,
      consumed_at = ?
     where id = ?`,
    [verifiedAt, verifiedAt, input.verificationId],
  );

  await execute(
    `update telegram_identities set
      linked_user_id = ?,
      is_linked = 1,
      telegram_username = ?,
      chat_id = ?,
      last_seen_at = ?,
      updated_at = ?
     where telegram_id = ?`,
    [userId, telegramUsername, telegramChatId, verifiedAt, verifiedAt, telegramId],
  );

  return {
    userId,
    username,
    email,
    telegramUsername,
  };
}

export async function registerUser(input: {
  username: string;
  email: string;
  telegramUsername: string;
  password?: string;
  passwordHash?: string;
  telegramId?: string | null;
  telegramChatId?: string | null;
  telegramVerifiedAt?: string | null;
  telegramLinkedAt?: string | null;
}) {
  await ensureDatabase();

  const username = normalizeUsername(input.username);
  const email = normalizeEmail(input.email);
  const telegramUsername = normalizeTelegramUsername(input.telegramUsername);
  const telegramId = normalizeTelegramNumericId(input.telegramId);

  if (username.length < 3) {
    throw new Error("Username must be at least 3 characters.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (!isValidTelegramUsername(telegramUsername)) {
    throw new Error("Telegram username must start with @ and use 5-32 valid characters.");
  }

  await assertRegistrationAvailability({
    username,
    email,
    telegramUsername,
    telegramId: telegramId || null,
  });

  const userId = randomUUID();
  const timestamp = nowIso();
  const passwordHash =
    input.passwordHash ??
    (input.password ? hashPassword(input.password) : null);

  if (!passwordHash) {
    throw new Error("Password is required.");
  }

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
      user_id, role, telegram_username, telegram_id, telegram_chat_id,
      telegram_verified, telegram_verified_at, telegram_linked_at, withdrawal_wallet,
      verified, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      "user",
      telegramUsername,
      telegramId || null,
      input.telegramChatId ?? null,
      1,
      input.telegramVerifiedAt ?? timestamp,
      input.telegramLinkedAt ?? input.telegramVerifiedAt ?? timestamp,
      null,
      1,
      timestamp,
      timestamp,
    ],
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
      profiles.telegram_chat_id, profiles.telegram_verified, profiles.telegram_verified_at,
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

  if (String(row.status) !== "active") {
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
      profiles.telegram_chat_id, profiles.telegram_verified, profiles.telegram_verified_at,
      profiles.withdrawal_wallet, profiles.verified, sessions.expires_at
     from sessions
     inner join users on users.id = sessions.user_id
     inner join profiles on profiles.user_id = users.id
     where sessions.token_hash = ?
       and coalesce(users.is_deleted, 0) = 0
     limit 1`,
    [hashSessionToken(token)],
  );

  if (!row) {
    return null;
  }

  if (new Date(String(row.expires_at)).getTime() <= Date.now()) {
    return null;
  }

  if (String(row.status) !== "active") {
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
  const currentUserRow = await getUserRowById(userId);

  if (!currentUserRow) {
    throw new Error("User not found.");
  }

  const currentUser = normalizeUser(currentUserRow);

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
  const linkedTelegramIdentity = await getTelegramIdentityRowByUsername(telegramUsername);
  const telegramIdentityChanged = currentUser.telegramUsername !== telegramUsername;

  if (
    linkedTelegramIdentity?.linked_user_id &&
    String(linkedTelegramIdentity.linked_user_id) !== userId
  ) {
    throw new Error("This Telegram account is already connected to another account.");
  }

  if (
    currentUser.telegramId &&
    linkedTelegramIdentity?.telegram_id &&
    normalizeTelegramNumericId(linkedTelegramIdentity.telegram_id) &&
    normalizeTelegramNumericId(linkedTelegramIdentity.telegram_id) !== currentUser.telegramId
  ) {
    throw new Error(
      "This Telegram account is already linked elsewhere. Press Start in the bot with your original Telegram account.",
    );
  }

  if (telegramIdentityChanged && currentUser.telegramVerified && !linkedTelegramIdentity) {
    throw new Error(
      "Press Start in @rebohrome_bot from your Telegram account before changing the Telegram binding.",
    );
  }

  const telegramChatId = linkedTelegramIdentity?.chat_id
    ? String(linkedTelegramIdentity.chat_id)
    : telegramIdentityChanged
      ? null
      : currentUser.telegramChatId;
  const telegramId = linkedTelegramIdentity?.telegram_id
    ? normalizeTelegramNumericId(linkedTelegramIdentity.telegram_id)
    : telegramIdentityChanged
      ? null
      : currentUser.telegramId;
  const telegramVerified = linkedTelegramIdentity
    ? 1
    : telegramIdentityChanged
      ? 0
      : currentUser.telegramVerified
        ? 1
        : 0;
  const telegramVerifiedAt = linkedTelegramIdentity
    ? timestamp
    : telegramIdentityChanged
      ? null
      : currentUser.telegramVerifiedAt;
  const telegramLinkedAt = linkedTelegramIdentity
    ? timestamp
    : telegramIdentityChanged
      ? null
      : null;

  await execute("update users set name = ?, updated_at = ? where id = ?", [
    input.name.trim() || "Collector",
    timestamp,
    userId,
  ]);

  await execute(
    `update profiles set
      telegram_username = ?, telegram_id = ?, telegram_chat_id = ?, telegram_verified = ?,
      telegram_verified_at = ?, telegram_linked_at = ?,
      withdrawal_wallet = ?, verified = ?, updated_at = ?
     where user_id = ?`,
    [
      telegramUsername,
      telegramId,
      telegramChatId,
      telegramVerified,
      telegramVerifiedAt,
      telegramLinkedAt,
      input.withdrawalWallet.trim() || null,
      telegramVerified,
      timestamp,
      userId,
    ],
  );

  if (linkedTelegramIdentity) {
    await execute(
      `update telegram_identities set
        linked_user_id = ?,
        is_linked = ?,
        telegram_username = ?,
        chat_id = ?,
        updated_at = ?
       where telegram_id = ?`,
      [
        userId,
        telegramVerified,
        telegramUsername,
        telegramChatId ?? String(linkedTelegramIdentity.chat_id),
        timestamp,
        normalizeTelegramNumericId(linkedTelegramIdentity.telegram_id),
      ],
    );
  }

  revalidatePrivate(userId);
}

export async function updateUserEmailAddress(input: {
  userId: string;
  currentPassword: string;
  newEmail: string;
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  route: string;
  timestamp: string;
}) {
  await ensureDatabase();

  const userRow = await queryOne(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.telegram_chat_id, profiles.telegram_verified, profiles.telegram_verified_at,
      profiles.withdrawal_wallet, profiles.verified
     from users
     inner join profiles on profiles.user_id = users.id
     where users.id = ?
     limit 1`,
    [input.userId],
  );

  if (!userRow) {
    throw new Error("User not found.");
  }

  if (!verifyPassword(input.currentPassword, String(userRow.password_hash))) {
    throw new Error("Current password is incorrect.");
  }

  const nextEmail = normalizeEmail(input.newEmail);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
    throw new Error("Enter a valid email address.");
  }

  const currentUser = normalizeUser(userRow);

  if (nextEmail === currentUser.email) {
    throw new Error("Enter a new email address.");
  }

  const existingOwner = await queryOne(
    "select id from users where email = ? and id <> ? limit 1",
    [nextEmail, input.userId],
  );

  if (existingOwner) {
    throw new Error("This email is already connected to another account.");
  }

  await execute("update users set email = ?, updated_at = ? where id = ?", [
    nextEmail,
    input.timestamp,
    input.userId,
  ]);

  await trackUserEmailChanged({
    eventType: "user_email_changed",
    userId: currentUser.id,
    username: currentUser.username,
    telegramUsername: currentUser.telegramUsername,
    role: currentUser.role,
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp: input.timestamp,
  });

  if (currentUser.telegramChatId) {
    const chatId = currentUser.telegramChatId;
    await notifySafely(() =>
      sendTelegramUserMessage(
        chatId,
        buildUserEmailChangedTelegramMessage({
          oldEmail: currentUser.email,
          newEmail: nextEmail,
        }),
      ),
    );
  }

  await sendSecurityTelegramNotification(
    buildUserEmailChangedAdminTelegramMessage({
      username: currentUser.username,
      telegramUsername: currentUser.telegramUsername,
      oldEmail: currentUser.email,
      newEmail: nextEmail,
      ipAddress: input.ipAddress,
      country: input.country,
      userAgent: input.userAgent,
      language: input.language,
      timestamp: input.timestamp,
    }),
  );

  revalidatePrivate(input.userId);

  const refreshedUserRow = await getUserRowById(input.userId);
  return refreshedUserRow ? normalizeUser(refreshedUserRow) : null;
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

  if (!isValidUsdtBep20Wallet(walletAddress)) {
    throw new Error("Please enter a valid USDT BEP20 wallet address.");
  }

  if (account.balance.available < input.amount) {
    await notifySafely(() =>
      sendTelegramAdminMessage(
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
  const payout = calculateWithdrawalPayout({
    requestedAmount: input.amount,
    totalDepositedUsd: account.balance.totalDeposited,
  });

  await execute(
    `insert into withdrawal_requests (
      id, user_id, amount, requested_amount, base_payout_percent,
      bonus_payout_percent, final_payout_percent, payout_amount, wallet_address,
      wallet_usdt_bep20, telegram_id, status, source_deposit_id,
      source_card_masked, source_cardholder_name, admin_note, telegram_chat_id,
      telegram_message_id, telegram_sync_status, telegram_synced_at, telegram_last_error,
      last_action_source, last_updated_by_admin_id, status_updated_by,
      status_updated_at, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      withdrawalId,
      input.userId,
      input.amount,
      payout.requestedAmount,
      payout.basePayoutPercent,
      payout.bonusPayoutPercent,
      payout.finalPayoutPercent,
      payout.payoutAmount,
      walletAddress,
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
      "system",
      timestamp,
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
      requestedAmount: payout.requestedAmount,
      basePayoutPercent: payout.basePayoutPercent,
      bonusPayoutPercent: payout.bonusPayoutPercent,
      finalPayoutPercent: payout.finalPayoutPercent,
      payoutAmount: payout.payoutAmount,
      totalDepositedUsd: account.balance.totalDeposited,
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

  const existingSession = await getActivePaymentSession(input.userId, "purchase");
  if (existingSession) {
    return {
      sessionId: existingSession.id,
      paymentUrl: existingSession.paymentUrl,
      redirectPath:
        existingSession.provider === "TransVoucher"
          ? `/payment/transvoucher?session=${encodeURIComponent(existingSession.id)}`
          : existingSession.paymentUrl,
      activeSession: existingSession,
      reusedExistingSession: true,
    };
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
    title: "ReboHrome Digital Collectible Purchase",
    description: "Digital collectible card purchase",
    successUrl,
    cancelUrl,
    redirectUrl,
    customerDetails: {
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
      ["failed", "expired"].includes(initialTransactionStatus) ? "failed" : "pending",
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
      ["failed", "expired"].includes(initialTransactionStatus)
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
    redirectPath: `/payment/transvoucher?session=${encodeURIComponent(sessionId)}`,
    activeSession: null,
    reusedExistingSession: false,
  };
}

export async function getActivePaymentSession(
  userId: string,
  type?: "deposit" | "purchase",
): Promise<ActivePaymentSessionRecord | null> {
  await ensureDatabase();
  const now = nowIso();
  const activeStatuses = ["created", "pending", "attempting", "processing"];
  const results: ActivePaymentSessionRecord[] = [];

  if (!type || type === "purchase") {
    const row = await queryOne(
      `select * from payment_sessions
       where user_id = ?
         and status in (${activeStatuses.map(() => "?").join(", ")})
         and expires_at > ?
       order by created_at desc
       limit 1`,
      [userId, ...activeStatuses, now],
    );
    if (row) {
      results.push(normalizeActiveCheckoutSession(row));
    }
  }

  if (!type || type === "deposit") {
    const row = await queryOne(
      `select * from deposit_payment_sessions
       where user_id = ?
         and status in (${activeStatuses.map(() => "?").join(", ")})
         and expires_at > ?
       order by created_at desc
       limit 1`,
      [userId, ...activeStatuses, now],
    );
    if (row) {
      results.push(normalizeActiveDepositSession(row));
    }
  }

  return results.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0] ?? null;
}

export async function getActivePaymentSessions(userId: string) {
  const [deposit, purchase] = await Promise.all([
    getActivePaymentSession(userId, "deposit"),
    getActivePaymentSession(userId, "purchase"),
  ]);
  return [deposit, purchase].filter(
    (item): item is ActivePaymentSessionRecord => item !== null,
  );
}

export async function checkActivePaymentSessionStatus(input: {
  userId: string;
  type?: "deposit" | "purchase";
}) {
  const session = await getActivePaymentSession(input.userId, input.type);
  if (!session?.transactionId) {
    return { session, transaction: null };
  }
  const transaction = await refreshTransVoucherTransactionStatus(
    session.transactionId,
    input.userId,
  );
  return {
    session: await getActivePaymentSession(input.userId, session.type),
    transaction,
  };
}

export async function cancelActivePaymentSession(input: {
  userId: string;
  sessionId: string;
  type: "deposit" | "purchase";
}) {
  await ensureDatabase();
  const table = input.type === "deposit" ? "deposit_payment_sessions" : "payment_sessions";
  const row = await queryOne(
    `select * from ${table} where id = ? and user_id = ? limit 1`,
    [input.sessionId, input.userId],
  );
  if (!row) {
    throw new Error("Payment session not found.");
  }
  const status = String(row.status);
  if (!["created", "pending", "attempting", "processing"].includes(status)) {
    throw new Error("This payment session can no longer be canceled.");
  }
  const transactionId = row.transaction_id ? String(row.transaction_id) : null;
  const timestamp = nowIso();
  await execute(`update ${table} set status = 'canceled', updated_at = ? where id = ?`, [
    timestamp,
    input.sessionId,
  ]);
  if (transactionId) {
    await execute(
      `update transactions set
        status = 'expired',
        processed_at = coalesce(processed_at, ?),
        updated_at = ?
       where id = ? and user_id = ? and status in ('pending', 'attempting', 'processing')`,
      [timestamp, timestamp, transactionId, input.userId],
    );
  }
  revalidatePrivate(input.userId);
  return { ok: true };
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

  const existingSession = await getActivePaymentSession(input.userId, "deposit");
  if (existingSession) {
    return {
      sessionId: existingSession.id,
      paymentUrl: existingSession.paymentUrl,
      redirectPath:
        existingSession.provider === "TransVoucher"
          ? `/payment/deposit/transvoucher?session=${encodeURIComponent(existingSession.id)}`
          : existingSession.paymentUrl,
      activeSession: existingSession,
      reusedExistingSession: true,
    };
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
    title: "ReboHrome Balance Top-Up",
    description: "Top up balance",
    successUrl,
    cancelUrl,
    redirectUrl,
    customerDetails: {
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
      ["failed", "expired"].includes(initialTransactionStatus) ? "failed" : "processing",
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
    redirectPath: `/payment/deposit/transvoucher?session=${encodeURIComponent(sessionId)}`,
    activeSession: null,
    reusedExistingSession: false,
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

  if (isProviderTerminalFailureStatus(input.providerStatus)) {
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
        mapProviderStatusToTransactionStatus(input.providerStatus),
        isProviderExpiredStatus(input.providerStatus)
          ? "Purchase payment expired"
          : "Purchase declined",
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

  if (isProviderTerminalFailureStatus(input.providerStatus)) {
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
        mapProviderStatusToTransactionStatus(input.providerStatus),
        isProviderExpiredStatus(input.providerStatus)
          ? "Deposit expired"
          : "Deposit failed",
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
  const normalizedProviderStatus = normalizeProviderStatus(input.providerStatus);

  if (
    transaction.processedAt &&
    ["completed", "failed", "expired"].includes(transaction.status)
  ) {
    return transaction;
  }

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
      providerStatus: normalizedProviderStatus,
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
      providerStatus: normalizedProviderStatus,
      providerTransactionId:
        input.providerTransactionId ?? transaction.transvoucherTransactionId,
      providerReferenceId:
        input.providerReferenceId ?? transaction.transvoucherReferenceId,
      paymentUrl: input.paymentUrl ?? transaction.paymentUrl,
      paidAt: input.paidAt ?? transaction.paidAt,
      rawProviderResponse: input.rawProviderResponse,
    });
  }

  const timestamp = nowIso();
  const isFinalProviderState =
    isProviderCompletedStatus(normalizedProviderStatus) ||
    isProviderTerminalFailureStatus(normalizedProviderStatus);
  const nextCheckAt = isFinalProviderState
    ? null
    : getNextTransVoucherCheckAt(transaction.createdAt, timestamp);

  await execute(
    `update transactions set
      provider_checked_at = ?,
      processed_at = case when ? = 1 then coalesce(processed_at, ?) else processed_at end,
      credited_at = case when ? = 1 then coalesce(credited_at, ?) else credited_at end,
      next_check_at = ?,
      last_error = null
     where id = ?`,
    [
      timestamp,
      isFinalProviderState ? 1 : 0,
      timestamp,
      transaction.kind === "deposit" && isProviderCompletedStatus(normalizedProviderStatus)
        ? 1
        : 0,
      timestamp,
      nextCheckAt,
      transaction.id,
    ],
  );

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

  await execute(
    `update transactions set
      provider_checked_at = ?,
      reconciliation_attempts = reconciliation_attempts + 1,
      updated_at = ?
     where id = ?`,
    [nowIso(), nowIso(), transaction.id],
  );

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

export async function reconcilePendingTransVoucherPayments(input?: {
  limit?: number;
  triggerSource?: "cron" | "manual";
}) {
  await ensureDatabase();

  const limit = Math.min(Math.max(Number(input?.limit ?? 50), 1), 200);
  const runId = randomUUID();
  const startedAt = nowIso();
  const baselineAt = await getTransVoucherReconciliationBaselineAt();

  await execute(
    `insert into payment_reconciliation_runs (
      id, provider, started_at, trigger_source
    ) values (?, ?, ?, ?)`,
    [runId, "TransVoucher", startedAt, input?.triggerSource ?? "cron"],
  );

  const rows = await queryMany(
    `select * from transactions
     where payment_provider = 'TransVoucher'
       and transvoucher_transaction_id is not null
       and (? is null or created_at >= ?)
       and processed_at is null
       and credited_at is null
       and (next_check_at is null or next_check_at <= ?)
       and (
         status in ('pending', 'attempting', 'processing')
         or lower(coalesce(provider_status, '')) in ('', 'pending', 'attempting', 'processing', 'created')
       )
     order by coalesce(provider_checked_at, created_at) asc
     limit ?`,
    [baselineAt, baselineAt, startedAt, limit],
  );

  const summary = {
    checked: 0,
    succeeded: 0,
    failed: 0,
    expired: 0,
    pending: 0,
    skipped: 0,
    errors: 0,
    updated: 0,
    lastRunAt: startedAt,
    lastError: null as string | null,
  };

  for (const row of rows) {
    const before = normalizeTransaction(row);
    const ageMs = Date.now() - new Date(before.createdAt).getTime();

    if (ageMs > 24 * 60 * 60 * 1000) {
      summary.skipped += 1;
      summary.expired += 1;
      await applyTransVoucherPaymentStatus({
        transactionId: before.id,
        providerTransactionId: before.transvoucherTransactionId,
        providerReferenceId: before.transvoucherReferenceId,
        providerStatus: "expired",
        paymentUrl: before.paymentUrl,
        paidAt: null,
        rawProviderResponse: {
          source: "cron",
          reason: "Pending TransVoucher transaction exceeded 24 hour reconciliation window.",
        },
      });
      continue;
    }

    summary.checked += 1;

    try {
      const after = await refreshTransVoucherTransactionStatus(before.id);
      const nextStatus = after?.status ?? before.status;
      if (nextStatus !== before.status || after?.providerStatus !== before.providerStatus) {
        summary.updated += 1;
      }

      if (nextStatus === "completed") {
        summary.succeeded += 1;
      } else if (nextStatus === "failed") {
        summary.failed += 1;
      } else if (nextStatus === "expired") {
        summary.expired += 1;
      } else {
        summary.pending += 1;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown reconciliation error.";
      summary.errors += 1;
      summary.pending += 1;
      summary.lastError = errorMessage;
      await execute(
        `update transactions set
          provider_checked_at = ?,
          reconciliation_attempts = reconciliation_attempts + 1,
          next_check_at = ?,
          last_error = ?,
          meta_json = ?,
          updated_at = ?
         where id = ?`,
        [
          startedAt,
          getNextTransVoucherCheckAt(before.createdAt, startedAt),
          errorMessage,
          toJson({
            ...getTransactionMeta(before),
            reconciliationError: errorMessage,
          }),
          startedAt,
          before.id,
        ],
      );
    }
  }

  await execute(
    `update payment_reconciliation_runs set
      finished_at = ?,
      checked_count = ?,
      succeeded_count = ?,
      failed_count = ?,
      expired_count = ?,
      pending_count = ?,
      skipped_count = ?,
      error_count = ?,
      last_error = ?
     where id = ?`,
    [
      nowIso(),
      summary.checked,
      summary.succeeded,
      summary.failed,
      summary.expired,
      summary.pending,
      summary.skipped,
      summary.errors,
      summary.lastError,
      runId,
    ],
  );

  revalidateAdmin();
  return summary;
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

    if (transaction.status === "failed" || transaction.status === "expired") {
      return `/checkout/declined?order=${encodeURIComponent(transaction.referenceId)}`;
    }

    return `/checkout?pending=${encodeURIComponent(transaction.referenceId)}`;
  }

  if (transaction.kind === "deposit") {
    if (transaction.status === "completed") {
      return `/dashboard/deposit?receipt=${encodeURIComponent(transaction.referenceId)}`;
    }

    if (transaction.status === "failed" || transaction.status === "expired") {
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
      profiles.telegram_chat_id, profiles.telegram_verified, profiles.telegram_verified_at,
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

export async function getPaymentReconciliationStatus(): Promise<PaymentReconciliationStatus> {
  await ensureDatabase();
  await ensurePaymentReconciliationRunsTable();
  const baselineAt = await getTransVoucherReconciliationBaselineAt();

  const [lastRun, pendingRow, checkedRow, succeededRow, failedRow, expiredRow] =
    await Promise.all([
      queryOne(
        `select * from payment_reconciliation_runs
         where provider = 'TransVoucher'
         order by started_at desc
         limit 1`,
      ),
      queryOne(
        `select count(*) as count from transactions
         where payment_provider = 'TransVoucher'
           and transvoucher_transaction_id is not null
           and (? is null or created_at >= ?)
           and processed_at is null
           and credited_at is null
           and (
             status in ('pending', 'attempting', 'processing')
             or lower(coalesce(provider_status, '')) in ('', 'pending', 'attempting', 'processing', 'created')
           )`,
        [baselineAt, baselineAt],
      ),
      queryOne(
        `select count(*) as count from transactions
         where payment_provider = 'TransVoucher'
           and (? is null or created_at >= ?)
           and provider_checked_at >= ?`,
        [baselineAt, baselineAt, new Date(Date.now() - 60 * 60 * 1000).toISOString()],
      ),
      queryOne(
        `select count(*) as count from transactions
         where payment_provider = 'TransVoucher'
           and (? is null or created_at >= ?)
           and status = 'completed'
           and processed_at is not null`,
        [baselineAt, baselineAt],
      ),
      queryOne(
        `select count(*) as count from transactions
         where payment_provider = 'TransVoucher'
           and (? is null or created_at >= ?)
           and status = 'failed'
           and processed_at is not null`,
        [baselineAt, baselineAt],
      ),
      queryOne(
        `select count(*) as count from transactions
         where payment_provider = 'TransVoucher'
           and (? is null or created_at >= ?)
           and status = 'expired'
           and processed_at is not null`,
        [baselineAt, baselineAt],
      ),
    ]);

  return {
    lastRunAt: lastRun?.started_at ? String(lastRun.started_at) : null,
    pendingTransactions: Number(pendingRow?.count ?? 0),
    checkedLastHour: Number(checkedRow?.count ?? 0),
    succeededByCron: Number(succeededRow?.count ?? 0),
    failedByCron: Number(failedRow?.count ?? 0),
    expiredByCron: Number(expiredRow?.count ?? 0),
    lastError: lastRun?.last_error ? String(lastRun.last_error) : null,
  };
}

async function getAdminUserEntryById(userId: string) {
  const row = await queryOne(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.telegram_chat_id, profiles.telegram_verified, profiles.telegram_verified_at,
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

function normalizeAdminCreatedStatus(status: UserStatus) {
  return status === "suspended" ? "blocked" : status;
}

function getAdminCreatedRoleLabel(role: UserRole) {
  return role === "admin" ? "administrator" : "collector";
}

function buildGeneratedTelegramUsername(username: string) {
  const base = normalizeUsername(username).replace(/[^a-z0-9_]/g, "_");
  const normalizedBase = base.length >= 4 ? base.slice(0, 24) : `user_${base}`;
  return normalizeTelegramUsername(`${normalizedBase}_${randomBytes(3).toString("hex")}`);
}

function buildAdminCreatedUserTelegramMessage(input: {
  admin: UserRecord;
  createdUser: UserRecord;
  initialBalance: number;
  telegramProvided: boolean;
  timestamp: string;
}) {
  return [
    "<b>Admin Created User</b>",
    "",
    `Admin: ${escapeTelegramHtml(input.admin.username)}`,
    `New User: ${escapeTelegramHtml(input.createdUser.username)}`,
    `Email: ${escapeTelegramHtml(input.createdUser.email)}`,
    `Role: ${escapeTelegramHtml(getAdminCreatedRoleLabel(input.createdUser.role))}`,
    `Initial Balance: ${escapeTelegramHtml(formatUsd(input.initialBalance))}`,
    `Telegram: ${escapeTelegramHtml(input.telegramProvided ? input.createdUser.telegramUsername : "Not provided")}`,
    `Time: ${escapeTelegramHtml(formatUtcDateTime(input.timestamp))} UTC`,
  ].join("\n");
}

function buildAdminDeletedUserTelegramMessage(input: {
  admin: UserRecord;
  deletedUser: UserRecord;
  reason: string | null;
  timestamp: string;
}) {
  return [
    "<b>User Deleted</b>",
    "",
    `Admin: ${escapeTelegramHtml(input.admin.username)}`,
    `Deleted User: ${escapeTelegramHtml(input.deletedUser.username)}`,
    `Email: ${escapeTelegramHtml(input.deletedUser.email)}`,
    `Telegram: ${escapeTelegramHtml(input.deletedUser.telegramUsername || "Not provided")}`,
    `Reason: ${escapeTelegramHtml(input.reason || "Not provided")}`,
    `Time: ${escapeTelegramHtml(formatUtcDateTime(input.timestamp))} UTC`,
  ].join("\n");
}

export async function createAdminManagedUser(input: {
  adminUserId: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  status: Exclude<UserStatus, "suspended">;
  telegramUsername?: string;
  initialBalance: number;
  adminNote?: string;
  requirePasswordReset: boolean;
  telegramVerified: boolean;
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  route: string;
  timestamp: string;
}) {
  await ensureDatabase();

  const admin = await getAdminIdentity(input.adminUserId);
  const username = normalizeUsername(input.username);
  const email = normalizeEmail(input.email);
  const providedTelegramUsername = input.telegramUsername?.trim()
    ? normalizeTelegramUsername(input.telegramUsername)
    : "";
  const telegramUsername = providedTelegramUsername || buildGeneratedTelegramUsername(username);
  const timestamp = input.timestamp || nowIso();
  const initialBalance = Number(input.initialBalance || 0);

  if (input.role === "admin" && admin.role !== "admin") {
    throw new Error("You do not have permission to create administrator accounts.");
  }

  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    throw new Error("Username must be 3-32 lowercase letters, numbers, or underscores.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (input.password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  if (initialBalance < 0) {
    throw new Error("Initial balance cannot be negative.");
  }

  if (providedTelegramUsername && !isValidTelegramUsername(providedTelegramUsername)) {
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
    throw new Error("Username already exists.");
  }

  if (existingEmail) {
    throw new Error("Email already exists.");
  }

  if (existingTelegram) {
    throw new Error(
      providedTelegramUsername
        ? "Telegram username already linked."
        : "Generated Telegram placeholder collided. Try a different username.",
    );
  }

  const linkedTelegramIdentity = providedTelegramUsername
    ? await getTelegramIdentityRowByUsername(providedTelegramUsername)
    : null;

  if (linkedTelegramIdentity?.linked_user_id) {
    throw new Error("Telegram username already linked.");
  }

  const userId = randomUUID();
  const passwordHash = hashPassword(input.password);
  const telegramChatId =
    input.telegramVerified && linkedTelegramIdentity?.chat_id
      ? String(linkedTelegramIdentity.chat_id)
      : null;
  const telegramId =
    input.telegramVerified && linkedTelegramIdentity?.telegram_id
      ? normalizeTelegramNumericId(linkedTelegramIdentity.telegram_id)
      : null;
  const telegramVerifiedAt = input.telegramVerified ? timestamp : null;
  const role = input.role;
  const status = normalizeAdminCreatedStatus(input.status);
  const adminNote = input.adminNote?.trim() || null;

  await execute(
    `insert into users (
      id, username, email, name, password_hash, status, require_password_reset,
      created_at, updated_at, last_login_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      username,
      email,
      username,
      passwordHash,
      status,
      input.requirePasswordReset ? 1 : 0,
      timestamp,
      timestamp,
      null,
    ],
  );

  await execute(
    `insert into profiles (
      user_id, role, telegram_username, telegram_id, telegram_chat_id,
      telegram_verified, telegram_verified_at, telegram_linked_at, withdrawal_wallet,
      verified, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      role,
      telegramUsername,
      telegramId,
      telegramChatId,
      input.telegramVerified ? 1 : 0,
      telegramVerifiedAt,
      input.telegramVerified ? timestamp : null,
      null,
      input.telegramVerified ? 1 : 0,
      timestamp,
      timestamp,
    ],
  );

  await execute(
    `insert into balances (
      user_id, available, pending_withdrawal, total_deposited, total_spent,
      total_withdrawn, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?)`,
    [userId, initialBalance, 0, initialBalance, 0, 0, timestamp],
  );

  if (initialBalance > 0) {
    await createTransactionRecord({
      userId,
      kind: "admin_initial_balance",
      amount: initialBalance,
      originalAmount: initialBalance,
      originalCurrency: "USD",
      displayCurrency: "USD",
      creditedAmountUsd: initialBalance,
      exchangeRate: 1,
      paymentMethod: "Admin Initial Balance",
      paymentProvider: "Internal Wallet",
      status: "completed",
      referenceId: `admin-initial-${userId}`,
      summary: `Initial balance assigned by ${admin.username}`,
      meta: {
        type: "admin_initial_balance",
        amount: initialBalance,
        adminId: admin.id,
        adminUsername: admin.username,
        targetUserId: userId,
        reason: adminNote ?? "Admin-created account initial balance.",
        timestamp,
      },
      paidAt: timestamp,
    });
  }

  await logAdminAction(
    admin.id,
    "admin_created_user",
    "user",
    userId,
    `Created user ${username}`,
    {
      metadata: {
        adminUserId: admin.id,
        adminUsername: admin.username,
        createdUserId: userId,
        createdUsername: username,
        roleAssigned: getAdminCreatedRoleLabel(role),
        status,
        initialBalance,
        telegramUsername: providedTelegramUsername || null,
        telegramVerified: input.telegramVerified,
        requirePasswordReset: input.requirePasswordReset,
        adminNote,
        ipAddress: input.ipAddress,
        country: input.country,
        timestamp,
      },
    },
  );

  await insertSecurityAuditEvent({
    eventType: "admin_created_user",
    userId,
    username,
    telegramUsername: providedTelegramUsername || null,
    role: getAdminCreatedRoleLabel(role),
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp,
  });

  if (input.telegramVerified && linkedTelegramIdentity) {
    await execute(
      `update telegram_identities set
        linked_user_id = ?, is_linked = 1, updated_at = ?
       where id = ?`,
      [userId, timestamp, String(linkedTelegramIdentity.id)],
    );
  }

  const createdEntry = await getAdminUserEntryById(userId);

  if (!createdEntry) {
    throw new Error("Failed to create account.");
  }

  await notifySafely(() =>
    sendTelegramAdminMessage(
      buildAdminCreatedUserTelegramMessage({
        admin,
        createdUser: createdEntry.user,
        initialBalance,
        telegramProvided: Boolean(providedTelegramUsername),
        timestamp,
      }),
    ),
  );

  if (createdEntry.user.telegramChatId && createdEntry.user.telegramVerified) {
    await notifySafely(() =>
      sendTelegramUserMessage(
        createdEntry.user.telegramChatId as string,
        [
          "<b>Welcome to ReboHrome</b>",
          "",
          `Your account ${escapeTelegramHtml(createdEntry.user.username)} was created by the admin team.`,
          "You can now sign in with the credentials provided by support.",
        ].join("\n"),
      ),
    );
  }

  revalidatePrivate(userId);
  revalidateAdmin();

  return createdEntry;
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
  const linkedTelegramIdentity = await getTelegramIdentityRowByUsername(telegramUsername);
  const telegramIdentityChanged =
    currentEntry.user.telegramUsername !== telegramUsername;

  if (
    linkedTelegramIdentity?.linked_user_id &&
    String(linkedTelegramIdentity.linked_user_id) !== input.userId
  ) {
    throw new Error("This Telegram account is already connected to another account.");
  }

  const nextTelegramChatId = linkedTelegramIdentity?.chat_id
    ? String(linkedTelegramIdentity.chat_id)
    : telegramIdentityChanged
      ? null
      : currentEntry.user.telegramChatId;
  const nextTelegramId = linkedTelegramIdentity?.telegram_id
    ? normalizeTelegramNumericId(linkedTelegramIdentity.telegram_id)
    : telegramIdentityChanged
      ? null
      : currentEntry.user.telegramId;
  const nextTelegramVerifiedAt = input.verified
    ? currentEntry.user.telegramVerifiedAt ?? timestamp
    : null;
  const nextTelegramLinkedAt = input.verified
    ? currentEntry.user.telegramVerifiedAt ?? timestamp
    : null;

  await execute("update users set name = ?, status = ?, updated_at = ? where id = ?", [
    input.name.trim() || currentEntry.user.name || "Collector",
    input.status,
    timestamp,
    input.userId,
  ]);

  await execute(
    `update profiles set
      role = ?, telegram_username = ?, telegram_id = ?, telegram_chat_id = ?,
      telegram_verified = ?, telegram_verified_at = ?, telegram_linked_at = ?, withdrawal_wallet = ?,
      verified = ?, updated_at = ?
     where user_id = ?`,
    [
      input.role,
      telegramUsername,
      nextTelegramId,
      nextTelegramChatId,
      input.verified ? 1 : 0,
      nextTelegramVerifiedAt,
      nextTelegramLinkedAt,
      input.withdrawalWallet.trim() || null,
      input.verified ? 1 : 0,
      timestamp,
      input.userId,
    ],
  );

  if (linkedTelegramIdentity) {
    await execute(
      `update telegram_identities set
        linked_user_id = ?,
        is_linked = ?,
        telegram_username = ?,
        chat_id = ?,
        updated_at = ?
       where telegram_id = ?`,
      [
        input.userId,
        input.verified ? 1 : 0,
        telegramUsername,
        nextTelegramChatId ?? String(linkedTelegramIdentity.chat_id),
        timestamp,
        normalizeTelegramNumericId(linkedTelegramIdentity.telegram_id),
      ],
    );
  }

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

export async function deleteAdminManagedUser(input: {
  adminUserId: string;
  userId: string;
  confirmation: string;
  reason?: string;
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  route: string;
  timestamp: string;
}) {
  await ensureDatabase();

  const admin = await getAdminIdentity(input.adminUserId);

  if (input.confirmation !== "DELETE USER") {
    throw new Error("Type DELETE USER to confirm deletion.");
  }

  if (input.userId === input.adminUserId) {
    throw new Error("You cannot delete your own admin account.");
  }

  const entry = await getAdminUserEntryById(input.userId);

  if (!entry) {
    throw new Error("User not found.");
  }

  if (entry.user.isDeleted) {
    throw new Error("User is already deleted.");
  }

  const timestamp = input.timestamp || nowIso();
  const reason = input.reason?.trim() || null;

  await execute(
    `update users set
      is_deleted = 1,
      deleted_at = ?,
      deleted_by = ?,
      status = 'blocked',
      updated_at = ?
     where id = ?`,
    [timestamp, admin.id, timestamp, input.userId],
  );

  await execute("delete from sessions where user_id = ?", [input.userId]);
  await execute(
    `update telegram_identities set
      linked_user_id = null,
      is_linked = 0,
      updated_at = ?
     where linked_user_id = ?`,
    [timestamp, input.userId],
  );
  await execute(
    `delete from telegram_verification_codes
     where username = ? or email = ? or telegram_username = ?`,
    [
      entry.user.username,
      entry.user.email,
      entry.user.telegramUsername,
    ],
  );

  await logAdminAction(
    admin.id,
    "admin_deleted_user",
    "user",
    input.userId,
    `Soft deleted user ${entry.user.username}`,
    {
      metadata: {
        adminUserId: admin.id,
        adminUsername: admin.username,
        deletedUserId: entry.user.id,
        deletedUsername: entry.user.username,
        deletedEmail: entry.user.email,
        deletedTelegram: entry.user.telegramUsername,
        reason,
        ipAddress: input.ipAddress,
        country: input.country,
        userDeleted: true,
        deletedUserSnapshot: {
          username: entry.user.username,
          email: entry.user.email,
          telegramUsername: entry.user.telegramUsername,
          deletedAt: timestamp,
        },
        timestamp,
      },
    },
  );

  await insertSecurityAuditEvent({
    eventType: "admin_deleted_user",
    userId: entry.user.id,
    username: entry.user.username,
    telegramUsername: entry.user.telegramUsername,
    role: entry.user.role,
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp,
  });

  await notifySafely(() =>
    sendTelegramAdminMessage(
      buildAdminDeletedUserTelegramMessage({
        admin,
        deletedUser: entry.user,
        reason,
        timestamp,
      }),
    ),
  );

  revalidatePrivate(input.userId);
  revalidateAdmin();

  return {
    ...entry,
    user: {
      ...entry.user,
      status: "blocked" as const,
      isDeleted: true,
      deletedAt: timestamp,
      deletedBy: admin.id,
      updatedAt: timestamp,
    },
  };
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

export async function sendWithdrawalViaXRocket(input: {
  withdrawalId: string;
  adminUserId: string;
  confirmation: string;
}) {
  await ensureDatabase();
  const admin = await getAdminIdentity(input.adminUserId);

  if (input.confirmation !== "SEND XROCKET") {
    throw new Error("Type SEND XROCKET to confirm payout.");
  }

  const row = await queryOne(
    `select withdrawal_requests.*, users.username
     from withdrawal_requests
     inner join users on users.id = withdrawal_requests.user_id
     where withdrawal_requests.id = ?
     limit 1`,
    [input.withdrawalId],
  );

  if (!row) {
    throw new Error("Withdrawal request not found.");
  }

  const request = normalizeWithdrawal(row);
  const username = String(row.username ?? request.userId);
  const wallet = request.walletAddress.trim();
  const amount = Number(request.payoutAmount);

  if (request.status !== "approved") {
    throw new Error("Only approved withdrawals can be sent via xRocket.");
  }
  if (request.xrocketWithdrawalId) {
    throw new Error("This withdrawal already has an xRocket payout id.");
  }
  if (!isValidUsdtBep20Wallet(wallet)) {
    throw new Error("Withdrawal wallet must be a valid USDT BEP20 address.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Final payout amount must be greater than zero.");
  }

  const startedAt = nowIso();
  await updateWithdrawalStatus({
    withdrawalId: request.id,
    status: "processing",
    adminUserId: admin.id,
    adminNote: "xRocket payout started.",
  });
  await execute(
    `update withdrawal_requests set
      payout_provider = 'xrocket',
      payout_currency = ?,
      payout_network = ?,
      payout_address = ?,
      payout_error = null,
      payout_attempts = coalesce(payout_attempts, 0) + 1,
      xrocket_status = 'processing',
      xrocket_sent_at = ?,
      updated_at = ?
     where id = ?`,
    [
      XROCKET_DEFAULT_CURRENCY,
      XROCKET_DEFAULT_NETWORK,
      wallet,
      startedAt,
      startedAt,
      request.id,
    ],
  );

  await notifySafely(() =>
    sendTelegramAdminMessage(
      [
        "<b>xRocket Payout Started</b>",
        "",
        `Request ID: ${escapeTelegramHtml(request.id)}`,
        `User: ${escapeTelegramHtml(username)}`,
        `Amount: ${escapeTelegramHtml(String(amount))} ${escapeTelegramHtml(XROCKET_DEFAULT_CURRENCY)}`,
        `Network: ${escapeTelegramHtml(XROCKET_DEFAULT_NETWORK)}`,
        `Wallet: ${escapeTelegramHtml(maskWallet(wallet))}`,
        "Status: PROCESSING",
      ].join("\n"),
    ),
  );

  try {
    const response = await createXRocketWithdrawal({
      clientWithdrawalId: request.id,
      amount,
      address: wallet,
      network: XROCKET_DEFAULT_NETWORK,
      currency: XROCKET_DEFAULT_CURRENCY,
    });
    const xrocketWithdrawalId = extractXRocketWithdrawalId(response);
    const xrocketStatus = extractXRocketStatus(response);
    const txHash = extractXRocketTxHash(response) || null;
    const paid = isXRocketPaidStatus(xrocketStatus);
    const failed = isXRocketFailedStatus(xrocketStatus);
    const confirmedAt = paid ? nowIso() : null;

    await execute(
      `update withdrawal_requests set
        xrocket_withdrawal_id = ?,
        xrocket_status = ?,
        xrocket_raw_response = ?,
        xrocket_confirmed_at = ?,
        payout_tx_hash = ?,
        payout_error = ?,
        updated_at = ?
       where id = ?`,
      [
        xrocketWithdrawalId || null,
        xrocketStatus,
        toJson(response),
        confirmedAt,
        txHash,
        failed ? "xRocket payout failed. Review provider response." : null,
        nowIso(),
        request.id,
      ],
    );

    if (paid) {
      await updateWithdrawalStatus({
        withdrawalId: request.id,
        status: "completed",
        adminUserId: admin.id,
        adminNote: "xRocket payout confirmed.",
      });
    } else if (failed) {
      await execute(
        "update withdrawal_requests set status = 'approved', updated_at = ? where id = ?",
        [nowIso(), request.id],
      );
      await execute(
        `update transactions set status = 'pending', updated_at = ?
         where reference_id = ? and kind = 'withdrawal'`,
        [nowIso(), request.id],
      );
      await insertWithdrawalHistory({
        withdrawalId: request.id,
        actionType: "xrocket-payout-failed",
        previousStatus: "processing",
        nextStatus: "approved",
        source: "admin",
        adminUserId: admin.id,
        adminUsername: admin.username,
        adminTelegramUsername: admin.telegramUsername,
        note: "xRocket payout failed. Withdrawal returned to approved state.",
      });
    }

    await appendArchiveLedgerEntry({
      eventType: paid ? "withdrawal_paid" : "withdrawal_status_changed",
      adminId: admin.id,
      userId: request.userId,
      entityType: "withdrawal",
      entityId: request.id,
      title: paid ? "xRocket payout paid" : "xRocket payout submitted",
      description: `xRocket payout ${xrocketStatus} for withdrawal ${request.id}.`,
      metadata: {
        provider: "xrocket",
        xrocketWithdrawalId,
        xrocketStatus,
        txHash,
        amount,
        currency: XROCKET_DEFAULT_CURRENCY,
        network: XROCKET_DEFAULT_NETWORK,
      },
    });

    await notifySafely(() =>
      sendTelegramAdminMessage(
        [
          `<b>xRocket Payout ${paid ? "Paid" : failed ? "Failed" : "Submitted"}</b>`,
          "",
          `Request ID: ${escapeTelegramHtml(request.id)}`,
          `Amount: ${escapeTelegramHtml(String(amount))} ${escapeTelegramHtml(XROCKET_DEFAULT_CURRENCY)}`,
          txHash ? `Tx Hash: ${escapeTelegramHtml(txHash)}` : null,
          `Status: ${escapeTelegramHtml(xrocketStatus.toUpperCase())}`,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    );

    revalidateAdmin();
    revalidatePrivate(request.userId);
    return { ok: true as const, xrocketStatus, xrocketWithdrawalId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "xRocket payout failed.";
    await execute(
      `update withdrawal_requests set
        status = 'approved',
        xrocket_status = 'failed',
        payout_error = ?,
        updated_at = ?
       where id = ?`,
      [message, nowIso(), request.id],
    );
    await execute(
      `update transactions set status = 'pending', updated_at = ?
       where reference_id = ? and kind = 'withdrawal'`,
      [nowIso(), request.id],
    );
    await insertWithdrawalHistory({
      withdrawalId: request.id,
      actionType: "xrocket-payout-failed",
      previousStatus: "processing",
      nextStatus: "approved",
      source: "admin",
      adminUserId: admin.id,
      adminUsername: admin.username,
      adminTelegramUsername: admin.telegramUsername,
      note: "xRocket payout failed. Provider error stored internally.",
    });
    await notifySafely(() =>
      sendTelegramAdminMessage(
        [
          "<b>xRocket Payout Failed</b>",
          "",
          `Request ID: ${escapeTelegramHtml(request.id)}`,
          `Error: ${escapeTelegramHtml(message)}`,
          "Status: FAILED",
        ].join("\n"),
      ),
    );
    revalidateAdmin();
    revalidatePrivate(request.userId);
    throw new Error("xRocket payout failed. Review internal payout error.");
  }
}

export async function updateXRocketWithdrawalFromPayload(payload: Record<string, unknown>) {
  await ensureDatabase();
  const xrocketWithdrawalId = extractXRocketWithdrawalId(payload);
  const xrocketStatus = extractXRocketStatus(payload);
  const txHash = extractXRocketTxHash(payload) || null;
  const clientWithdrawalId = String(
    payload.clientWithdrawalId ??
      payload.externalId ??
      (typeof payload.data === "object" && payload.data
        ? (payload.data as Record<string, unknown>).clientWithdrawalId ??
          (payload.data as Record<string, unknown>).externalId
        : "") ??
      "",
  );

  const row = await queryOne(
    `select * from withdrawal_requests
     where xrocket_withdrawal_id = ?
        or id = ?
     limit 1`,
    [xrocketWithdrawalId, clientWithdrawalId],
  );

  if (!row) {
    return { ok: false as const, reason: "not_found" };
  }

  const request = normalizeWithdrawal(row);
  const paid = isXRocketPaidStatus(xrocketStatus);
  const failed = isXRocketFailedStatus(xrocketStatus);
  const nextStatus: WithdrawalStatus = paid
    ? "completed"
    : failed
      ? "approved"
      : "processing";
  const timestamp = nowIso();

  await execute(
    `update withdrawal_requests set
      status = ?,
      xrocket_withdrawal_id = coalesce(xrocket_withdrawal_id, ?),
      xrocket_status = ?,
      xrocket_raw_response = ?,
      xrocket_confirmed_at = ?,
      payout_tx_hash = ?,
      payout_error = ?,
      updated_at = ?
     where id = ?`,
    [
      paid ? request.status : nextStatus,
      xrocketWithdrawalId || null,
      xrocketStatus,
      toJson(payload),
      paid ? timestamp : null,
      txHash,
      failed ? "xRocket payout failed. Review provider response." : null,
      timestamp,
      request.id,
    ],
  );

  if (paid && request.status !== "completed") {
    const seedAdminRow = await getUserRowByUsername(ADMIN_SEED_USERNAME);
    const adminUserId =
      request.statusUpdatedBy ??
      request.lastUpdatedByAdminId ??
      (seedAdminRow?.id ? String(seedAdminRow.id) : null);
    if (!adminUserId) {
      throw new Error("Unable to resolve admin identity for xRocket status update.");
    }
    await updateWithdrawalStatus({
      withdrawalId: request.id,
      status: "completed",
      adminUserId,
      adminNote: "xRocket payout confirmed by provider.",
    });
  }

  await appendArchiveLedgerEntry({
    eventType: paid ? "withdrawal_paid" : "withdrawal_status_changed",
    userId: request.userId,
    entityType: "withdrawal",
    entityId: request.id,
    title: "xRocket payout status updated",
    description: `xRocket status updated to ${xrocketStatus}.`,
    metadata: {
      provider: "xrocket",
      xrocketWithdrawalId,
      xrocketStatus,
      txHash,
    },
  });

  revalidateAdmin();
  revalidatePrivate(request.userId);
  return { ok: true as const, withdrawalId: request.id, status: nextStatus };
}

export async function reconcileXRocketWithdrawals() {
  await ensureDatabase();
  const rows = await queryMany(
    `select * from withdrawal_requests
     where status = 'processing'
       and payout_provider = 'xrocket'
       and xrocket_withdrawal_id is not null
     order by updated_at asc
     limit 25`,
  );
  let checked = 0;
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    const request = normalizeWithdrawal(row);
    if (!request.xrocketWithdrawalId) {
      continue;
    }
    checked += 1;
    try {
      const payload = await getXRocketWithdrawalInfo(request.xrocketWithdrawalId);
      const result = await updateXRocketWithdrawalFromPayload(payload);
      if (result.ok) {
        updated += 1;
      }
    } catch (error) {
      failed += 1;
      await execute(
        `update withdrawal_requests set payout_error = ?, updated_at = ? where id = ?`,
        [
          error instanceof Error ? error.message : "xRocket reconciliation failed.",
          nowIso(),
          request.id,
        ],
      );
    }
  }

  return { checked, updated, failed };
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
        status_updated_by = ?,
        status_updated_at = ?,
        updated_at = ?
       where id = ?`,
      [
        nextNote,
        "pending",
        source,
        admin.id,
        admin.id,
        noteTimestamp,
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
      [request.amount, request.payoutAmount, timestamp, request.userId],
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
      status_updated_by = ?,
      status_updated_at = ?,
      updated_at = ?
     where id = ?`,
    [
      input.status,
      nextNote,
      "pending",
      source,
      admin.id,
      admin.id,
      timestamp,
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
    requestedAmount: request.requestedAmount,
    payoutAmount: request.payoutAmount,
    basePayoutPercent: request.basePayoutPercent,
    bonusPayoutPercent: request.bonusPayoutPercent,
    finalPayoutPercent: request.finalPayoutPercent,
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
          requestedAmount: request.requestedAmount,
          payoutAmount: request.payoutAmount,
          finalPayoutPercent: request.finalPayoutPercent,
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
