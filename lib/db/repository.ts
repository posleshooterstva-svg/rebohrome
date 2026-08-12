import { readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { createHash, randomBytes, randomInt, randomUUID } from "crypto";
import type { Transaction as LibsqlTransaction } from "@libsql/client";
import { revalidatePath } from "next/cache";
import {
  ADMIN_SEED_PASSWORD,
  ADMIN_SEED_TELEGRAM,
  ADMIN_SEED_USERNAME,
  ADMIN_TELEGRAM_CHAT_ID,
  ADMIN_TELEGRAM_IDS,
  APP_BASE_URL,
  SITE_BASE_URL,
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
  createXRocketAppDeposit,
  createXRocketWithdrawal,
  extractXRocketStatus,
  extractXRocketTxHash,
  extractXRocketWithdrawalFee,
  extractXRocketWithdrawalId,
  getXRocketWithdrawalQuotas,
  getXRocketWithdrawalInfo,
  isXRocketFailedStatus,
  isXRocketPaidStatus,
} from "@/lib/xrocket";
import {
  buildPlaceholderEmail,
  createProductId,
  createReadableId,
  formatCurrency,
  formatUsd,
  formatUtcDateTime,
  getPayoutTierProgress,
  getEffectivePayoutBonusPercent,
  getPaletteByRarity,
  hasValidRandomizedProductOdds,
  isValidTelegramUsername,
  maskCardNumber,
  normalizeTelegramUsername,
  normalizeUsername,
  normalizeRandomizedProductOutcomes,
  type BalanceRecord,
  type CheckoutPaymentSessionRecord,
  type CheckoutPaymentSessionStatus,
  type CollectionSummary,
  type CryptoNetwork,
  type DashboardStat,
  type DeliveryType,
  type DocumentAcceptanceStatusRecord,
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
  type PaymentGateAccessRecord,
  type PaymentProviderKey,
  type PaymentReconciliationStatus,
  type KycStatus,
  type ProductInput,
  type ProductRecord,
  type RandomizedProductDisclosure,
  type Rarity,
  type SupportedCurrency,
  type TransactionRecord,
  type TelegramSyncStatus,
  type UserRecord,
  type UserKycProfileRecord,
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
import { isKycVerified } from "@/lib/rebohrome-data";
import { validateProductImageFile } from "@/lib/product-image";
import {
  buildTransVoucherReturnUrls,
  createTransVoucherPayment,
  getTransVoucherPaymentStatus,
  mapTransVoucherMethod,
  normalizeTransVoucherStatus,
} from "@/lib/transvoucher";
import {
  createVeriffSession,
  extractVeriffWebhookFields,
  extractVeriffUserId,
  fetchVeriffSessionStatus,
  getVeriffWebhookAuthClientIsValid,
  normalizeVeriffStatus,
  verifyVeriffWebhookSignature,
} from "@/lib/veriff";
import {
  createCleffoPaymentLink,
  getCleffoPaymentLinkStatus,
} from "@/lib/server/payments/providers/cleffo";
import {
  createWertSignedWidgetOptions,
  hashWertSignature,
  lookupWertOrderStatus,
  type WertWidgetOptions,
} from "@/lib/server/payments/providers/wert";
import {
  buildCoinflowChargebackProtectionData,
  buildCoinflowWebhookInfo,
  createCoinflowCheckoutToken,
  getCoinflowPublicConfig,
  sanitizeCoinflowResponse,
} from "@/lib/server/payments/coinflow-client";
import {
  coinflowStatusMessage,
  mapCoinflowToProviderStatus,
  normalizeCoinflowStatus,
} from "@/lib/server/payments/coinflow-status";
import {
  getCoinflowData,
  getCoinflowEventId,
  getCoinflowEventType,
  getCoinflowWebhookInfo,
} from "@/lib/server/payments/coinflow-webhooks";
import {
  getDbClient,
  getDbRuntimeConfig,
  resetDbClient,
  shouldAutoSeedDatabase,
  shouldAutoSetupDatabase,
} from "./client";
import { withPerf } from "@/lib/server/perf";
import {
  RANDOMIZED_PACK_FORMULA_VERSION,
  RANDOMIZED_PACK_POLICIES,
  buildRandomizedPackCopy,
  drawRandomizedOutcome,
  generateRandomizedPackDistribution,
  getRandomizedPackAvailableUnits,
  getRandomizedPackPolicy,
  hasSameRandomizedPackSnapshot,
  selectEligiblePackCandidates,
  type RandomizedPackCandidate,
} from "@/lib/randomized-packs";
import {
  RANDOMIZED_PACK_CREATE_STATEMENTS,
  RANDOMIZED_PACK_ORDER_ITEM_COLUMNS,
} from "@/lib/randomized-pack-schema";
import {
  consumeRandomizedPackReservation,
  expireRandomizedPackReservations,
  releaseRandomizedPackReservations,
} from "@/lib/randomized-pack-fulfillment";
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
let paymentLookupIndexesPromise: Promise<void> | null = null;
const activeDepositSessionCache = new Map<
  string,
  { session: ActivePaymentSessionRecord; cachedUntil: number }
>();

export const REQUIRED_DOCUMENT_VERSIONS = {
  terms: process.env.REBOHROME_TERMS_VERSION || "2026-06",
  privacy: process.env.REBOHROME_PRIVACY_VERSION || "2026-06",
  refund: process.env.REBOHROME_REFUND_VERSION || "2026-06",
  aml: process.env.REBOHROME_AML_VERSION || "2026-06",
  legalConfirmation: process.env.REBOHROME_LEGAL_CONFIRMATION_VERSION || "2026-06",
} as const;

export class DocumentAcceptanceRequiredError extends Error {
  code = "DOCUMENT_ACCEPTANCE_REQUIRED";

  constructor(message = "Required documents must be accepted before continuing.") {
    super(message);
    this.name = "DocumentAcceptanceRequiredError";
  }
}

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
  "user_kyc_profiles",
  "payment_providers",
  "user_payment_gate_access",
  "randomized_pack_policies",
  "randomized_pack_versions",
  "randomized_pack_outcomes",
  "randomized_pack_reservations",
  "randomized_pack_draws",
] as const;

type SecurityAuditEventType =
  | "users_page_visit"
  | "user_registered"
  | "user_login"
  | "user_email_changed"
  | "admin_created_user"
  | "admin_deleted_user"
  | "user_withdraw_access_disabled"
  | "user_withdraw_access_enabled"
  | "archive_rules_accepted"
  | "broadcast_created"
  | "broadcast_sent"
  | "broadcast_deleted"
  | "admin_user_account_data_updated"
  | "transvoucher_invalid_signature"
  | "kyc_profile_created"
  | "kyc_profile_updated"
  | "kyc_session_created"
  | "kyc_webhook_received"
  | "kyc_manual_veriff_sync"
  | "kyc_user_veriff_sync"
  | "veriff_webhook_approved"
  | "kyc_approved"
  | "kyc_declined"
  | "kyc_expired"
  | "kyc_review"
  | "callback_viewed"
  | "verification_started"
  | "verification_result_viewed"
  | "verification_abandoned"
  | "admin_manual_approved"
  | "kyc_manual_approved"
  | "kyc_manual_declined"
  | "kyc_manual_rejected"
  | "kyc_false_auto_approval_reverted"
  | "kyc_inconsistent_state_detected"
  | "kyc_reset"
  | "deposit_blocked_kyc_required"
  | "withdrawal_blocked_kyc_required"
  | "payment_blocked_kyc_required"
  | "gate2_details_created"
  | "gate2_details_updated"
  | "gate2_payment_blocked_missing_details"
  | "payment_gate_limits_updated"
  | "payment_blocked_by_gate_limit"
  | "user_gate_access_granted"
  | "user_gate_access_revoked"
  | "cleffo_payment_created"
  | "cleffo_payment_status_updated"
  | "cleffo_payment_failed"
  | "wert_session_created"
  | "wert_widget_options_generated"
  | "wert_signature_error"
  | "wert_webhook_received"
  | "wert_status_updated"
  | "wert_payment_succeeded"
  | "wert_payment_failed"
  | "wert_credit_applied"
  | "wert_unknown_status"
  | "document_acceptance_completed";

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

function parseJsonRecord(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
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
  return next.length > limit ? `${next.slice(0, limit - 1)}вЂ¦` : next;
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
  let randomizedOutcomes: unknown = [];

  if (typeof row.randomized_outcomes_json === "string") {
    try {
      randomizedOutcomes = JSON.parse(row.randomized_outcomes_json);
    } catch {
      randomizedOutcomes = [];
    }
  }

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
    isRandomized: asBoolean(row.is_randomized ?? 0),
    randomizedOutcomes: normalizeRandomizedProductOutcomes(randomizedOutcomes),
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
  const kycStatus = String(row.kyc_status ?? "not_started") as KycStatus;
  const kycVerified = asBoolean(row.kyc_verified ?? 0);

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
    paymentPhone: row.payment_phone ? String(row.payment_phone) : null,
    gate2FirstName: row.gate2_first_name ? String(row.gate2_first_name) : null,
    gate2LastName: row.gate2_last_name ? String(row.gate2_last_name) : null,
    gate2Phone: row.gate2_phone ? String(row.gate2_phone) : null,
    gate2DetailsUpdatedAt: row.gate2_details_updated_at
      ? String(row.gate2_details_updated_at)
      : null,
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
    kycStatus,
    kycVerified,
    kycProvider: row.kyc_provider ? String(row.kyc_provider) : null,
    veriffSessionId: row.veriff_session_id ? String(row.veriff_session_id) : null,
    veriffVerificationId: row.veriff_verification_id
      ? String(row.veriff_verification_id)
      : null,
    veriffStatus: row.veriff_status ? String(row.veriff_status) : null,
    veriffDecision: row.veriff_decision ? String(row.veriff_decision) : null,
    veriffReason: row.veriff_reason ? String(row.veriff_reason) : null,
    kycStartedAt: row.kyc_started_at ? String(row.kyc_started_at) : null,
    kycSubmittedAt: row.kyc_submitted_at ? String(row.kyc_submitted_at) : null,
    kycVerifiedAt: row.kyc_verified_at ? String(row.kyc_verified_at) : null,
    kycDeclinedAt: row.kyc_declined_at ? String(row.kyc_declined_at) : null,
    kycLastWebhookAt: row.kyc_last_webhook_at
      ? String(row.kyc_last_webhook_at)
      : null,
    kycManualOverride: asBoolean(row.kyc_manual_override ?? 0),
    kycManualOverrideBy: row.kyc_manual_override_by
      ? String(row.kyc_manual_override_by)
      : null,
    kycManualOverrideAt: row.kyc_manual_override_at
      ? String(row.kyc_manual_override_at)
      : null,
    kycManualOverrideReason: row.kyc_manual_override_reason
      ? String(row.kyc_manual_override_reason)
      : null,
    withdrawAccessEnabled: asBoolean(row.withdraw_access_enabled ?? 1),
    withdrawAccessDisabledAt: row.withdraw_access_disabled_at
      ? String(row.withdraw_access_disabled_at)
      : null,
    withdrawAccessDisabledBy: row.withdraw_access_disabled_by
      ? String(row.withdraw_access_disabled_by)
      : null,
    withdrawAccessDisabledReason: row.withdraw_access_disabled_reason
      ? String(row.withdraw_access_disabled_reason)
      : null,
    withdrawAccessRestoredAt: row.withdraw_access_restored_at
      ? String(row.withdraw_access_restored_at)
      : null,
    withdrawAccessRestoredBy: row.withdraw_access_restored_by
      ? String(row.withdraw_access_restored_by)
      : null,
  };
}

function normalizeUserKycProfile(row: DbRow): UserKycProfileRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    dateOfBirth: String(row.date_of_birth),
    countryOfResidence: String(row.country_of_residence),
    documentCountry: String(row.document_country),
    email: String(row.email),
    phone: row.phone ? String(row.phone) : null,
    addressLine1: row.address_line1 ? String(row.address_line1) : null,
    addressLine2: row.address_line2 ? String(row.address_line2) : null,
    city: row.city ? String(row.city) : null,
    postalCode: row.postal_code ? String(row.postal_code) : null,
    state: row.state ? String(row.state) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class KycVerificationRequiredError extends Error {
  requiresVerification = true;

  constructor(message: string) {
    super(message);
    this.name = "KycVerificationRequiredError";
  }
}

export class Gate2DetailsRequiredError extends Error {
  requiresGate2Details = true;

  constructor(message = "Gate #2 requires your first name, last name, and phone number before payment.") {
    super(message);
    this.name = "Gate2DetailsRequiredError";
  }
}

export function userHasKycAccess(user: UserRecord | null | undefined) {
  return Boolean(user && isKycVerified(user));
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
    payoutBonusOverrideEnabled: asBoolean(row.payout_bonus_override_enabled ?? 0),
    payoutBonusPercent:
      row.payout_bonus_percent === null || row.payout_bonus_percent === undefined
        ? null
        : Number(row.payout_bonus_percent),
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

async function ensureRandomizedPackTables() {
  for (const statement of RANDOMIZED_PACK_CREATE_STATEMENTS) {
    await execute(statement);
  }
  for (const definition of RANDOMIZED_PACK_ORDER_ITEM_COLUMNS) {
    await ensureColumn("order_items", definition);
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

async function migrateLegacyRandomizedProducts() {
  const migrationKey = "randomized_products_v1_migrated";
  const existing = await queryOne(
    "select key from system_settings where key = ? limit 1",
    [migrationKey],
  );

  if (existing) {
    return;
  }

  const timestamp = nowIso();
  await execute(
    "update products set is_randomized = 1 where lower(category) in ('gacha pack', 'randomized pack', 'mystery pack')",
  );
  await execute(
    `insert into system_settings (key, value, updated_by, updated_at)
     values (?, ?, ?, ?)`,
    [migrationKey, "completed", "system", timestamp],
  );
}

async function ensureAdminUserManagementTables() {
  await ensureColumn("transactions", "direction text");
  await ensureColumn("transactions", "balance_before integer");
  await ensureColumn("transactions", "balance_after integer");
  await ensureColumn("transactions", "source text not null default 'system'");
  await ensureColumn("transactions", "admin_note text");
  await ensureColumn("transactions", "support_note text");
  await ensureColumn("transactions", "visible_description text");
  await ensureColumn("transactions", "related_product_id text");
  await ensureColumn("transactions", "related_order_id text");
  await ensureColumn("transactions", "edited_by_admin_id text");
  await ensureColumn("transactions", "edited_at text");
  await ensureColumn("owned_cards", "status text not null default 'active'");
  await ensureColumn("owned_cards", "acquisition_source text not null default 'purchase'");
  await ensureColumn("owned_cards", "removed_at text");
  await ensureColumn("owned_cards", "delivery_mode text not null default 'digital'");
  await ensureColumn("owned_cards", "admin_note text");
  await ensureColumn("owned_cards", "visible_user_note text");
  await ensureColumn("owned_cards", "related_transaction_id text");
  await ensureColumn("owned_cards", "related_order_id text");
  await ensureColumn("owned_cards", "updated_at text");
  await execute(
    `create table if not exists user_inventory_ledger (
      id text primary key,
      user_id text not null,
      product_id text not null,
      user_inventory_id text,
      action_type text not null,
      quantity_delta integer not null,
      quantity_before integer not null,
      quantity_after integer not null,
      stock_before integer,
      stock_after integer,
      reason text not null,
      admin_note text,
      visible_user_note text,
      source text not null,
      created_by_admin_id text,
      created_at text not null,
      related_transaction_id text,
      related_order_id text
    )`,
  );
  await execute(
    `create table if not exists product_inventory_movements (
      id text primary key,
      product_id text not null,
      movement_type text not null,
      quantity_delta integer not null,
      stock_before integer not null,
      stock_after integer not null,
      reason text not null,
      source text not null,
      admin_id text,
      user_id text,
      related_user_inventory_id text,
      related_transaction_id text,
      created_at text not null
    )`,
  );
  await execute(
    `create table if not exists admin_audit_logs (
      id text primary key,
      admin_id text not null,
      target_user_id text,
      action text not null,
      entity_type text not null,
      entity_id text not null,
      before_json text,
      after_json text,
      reason text not null,
      ip_address text,
      user_agent text,
      created_at text not null
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

let documentAcceptanceTablesReady = false;

async function ensureDocumentAcceptanceTables() {
  if (documentAcceptanceTablesReady) {
    return;
  }

  await execute(
    `create table if not exists user_document_acceptances (
      id text primary key,
      user_id text not null,
      terms_version text not null,
      privacy_version text not null,
      refund_version text not null,
      aml_version text not null,
      legal_confirmation_version text not null default '2026-06',
      terms_accepted_at text not null,
      privacy_accepted_at text not null,
      refund_accepted_at text not null,
      aml_accepted_at text not null,
      legal_confirmation_accepted_at text,
      accepted_all_at text not null,
      ip_address text,
      user_agent text,
      created_at text not null,
      updated_at text not null
    )`,
  );
  await execute(
    "create index if not exists idx_user_document_acceptances_user_created on user_document_acceptances(user_id, created_at)",
  );
  await ensureColumn(
    "user_document_acceptances",
    "legal_confirmation_version text not null default '2026-06'",
  );
  await ensureColumn("user_document_acceptances", "legal_confirmation_accepted_at text");
  documentAcceptanceTablesReady = true;
}

async function ensureApplicationColumns() {
  await execute(
    `create table if not exists user_kyc_profiles (
      id text primary key,
      user_id text not null unique,
      first_name text not null,
      last_name text not null,
      date_of_birth text not null,
      country_of_residence text not null,
      document_country text not null,
      email text not null,
      phone text,
      address_line1 text,
      address_line2 text,
      city text,
      postal_code text,
      state text,
      created_at text not null,
      updated_at text not null
    )`,
  );
  await ensureDocumentAcceptanceTables();
  await execute(
    `create table if not exists payment_providers (
      provider_key text primary key,
      gate_number integer not null unique,
      provider_name text not null,
      public_name text not null,
      admin_name text not null,
      enabled integer not null default 1,
      default_user_visible integer not null default 0,
      supports_usd integer not null default 1,
      supports_eur integer not null default 1,
      min_amount integer not null default 1,
      max_amount integer,
      min_deposit_amount real not null default 10,
      max_deposit_amount real,
      default_deposit_amount real,
      currency text not null default 'USD',
      priority integer not null default 100,
      created_at text not null,
      updated_at text not null
    )`,
  );
  await execute(
    `create table if not exists user_payment_gate_access (
      id text primary key,
      user_id text not null,
      provider_key text not null,
      enabled integer not null default 0,
      reason text,
      updated_by text,
      created_at text not null,
      updated_at text not null,
      unique(user_id, provider_key)
    )`,
  );
  await execute(
    `create table if not exists wert_payment_sessions (
      id text primary key,
      user_id text not null,
      provider_key text not null default 'wert',
      gate_number integer not null default 3,
      type text not null default 'balance_topup',
      local_transaction_id text not null unique,
      deposit_id text,
      click_id text not null unique,
      wert_order_id text,
      wert_status text,
      amount_fiat real not null,
      fiat_currency text not null default 'USD',
      commodity text not null,
      commodity_amount real not null,
      network text not null,
      user_wallet_address text,
      sc_address text not null,
      sc_input_data text not null,
      signature_hash text,
      token_id integer,
      token_quantity integer,
      contract_order_id text,
      recipient_wallet text,
      nft_delivery_mode text,
      chain_tx_hash text,
      status text not null default 'created',
      balance_credited_at text,
      nft_delivered_at text,
      provider_payload_safe text,
      last_status_check_at text,
      last_webhook_at text,
      created_at text not null,
      updated_at text not null
    )`,
  );
  await execute(
    `create table if not exists user_collectibles (
      id text primary key,
      user_id text not null,
      token_id integer not null,
      quantity integer not null default 1,
      source_payment_session_id text,
      provider_key text not null default 'wert',
      chain_tx_hash text,
      delivered_at text not null,
      created_at text not null
    )`,
  );
  await ensureColumn("users", "require_password_reset integer not null default 0");
  await ensureColumn("users", "withdraw_access_enabled integer not null default 1");
  await ensureColumn("users", "withdraw_access_disabled_at text");
  await ensureColumn("users", "withdraw_access_disabled_by text");
  await ensureColumn("users", "withdraw_access_disabled_reason text");
  await ensureColumn("users", "withdraw_access_restored_at text");
  await ensureColumn("users", "withdraw_access_restored_by text");
  await ensureColumn("users", "is_deleted integer not null default 0");
  await ensureColumn("users", "deleted_at text");
  await ensureColumn("users", "deleted_by text");
  await ensureColumn("users", "vault_integrity_score integer not null default 0");
  await ensureColumn("users", "vault_integrity_status text not null default 'Unstable'");
  await ensureColumn("users", "vault_integrity_updated_at text");
  await ensureColumn("users", "archive_rules_accepted_at text");
  await ensureColumn("users", "latest_terms_accepted_at text");
  await ensureColumn("users", "kyc_status text not null default 'not_started'");
  await ensureColumn("users", "kyc_verified integer not null default 0");
  await ensureColumn("users", "kyc_provider text");
  await ensureColumn("users", "veriff_session_id text");
  await ensureColumn("users", "veriff_verification_id text");
  await ensureColumn("users", "veriff_status text");
  await ensureColumn("users", "veriff_decision text");
  await ensureColumn("users", "veriff_reason text");
  await ensureColumn("users", "kyc_started_at text");
  await ensureColumn("users", "kyc_submitted_at text");
  await ensureColumn("users", "kyc_verified_at text");
  await ensureColumn("users", "kyc_declined_at text");
  await ensureColumn("users", "kyc_last_webhook_at text");
  await ensureColumn("users", "kyc_manual_override integer not null default 0");
  await ensureColumn("users", "kyc_manual_override_by text");
  await ensureColumn("users", "kyc_manual_override_at text");
  await ensureColumn("users", "kyc_manual_override_reason text");
  await ensureColumn("profiles", "payment_phone text");
  await ensureColumn("profiles", "gate2_first_name text");
  await ensureColumn("profiles", "gate2_last_name text");
  await ensureColumn("profiles", "gate2_phone text");
  await ensureColumn("profiles", "gate2_details_updated_at text");
  await ensureColumn("payment_providers", "min_deposit_amount real not null default 10");
  await ensureColumn("payment_providers", "max_deposit_amount real");
  await ensureColumn("payment_providers", "default_deposit_amount real");
  await ensureColumn("payment_providers", "currency text not null default 'USD'");
  await ensureColumn("payment_sessions", "token_id integer");
  await ensureColumn("payment_sessions", "token_quantity integer");
  await ensureColumn("payment_sessions", "contract_address text");
  await ensureColumn("payment_sessions", "contract_order_id text");
  await ensureColumn("payment_sessions", "sc_input_data text");
  await ensureColumn("payment_sessions", "chain_network text");
  await ensureColumn("payment_sessions", "recipient_wallet text");
  await ensureColumn("payment_sessions", "nft_delivery_mode text");
  await ensureColumn("payment_sessions", "chain_tx_hash text");
  await ensureColumn("payment_sessions", "nft_delivered_at text");
  await ensureColumn("deposit_payment_sessions", "token_id integer");
  await ensureColumn("deposit_payment_sessions", "token_quantity integer");
  await ensureColumn("deposit_payment_sessions", "contract_address text");
  await ensureColumn("deposit_payment_sessions", "contract_order_id text");
  await ensureColumn("deposit_payment_sessions", "sc_input_data text");
  await ensureColumn("deposit_payment_sessions", "chain_network text");
  await ensureColumn("deposit_payment_sessions", "recipient_wallet text");
  await ensureColumn("deposit_payment_sessions", "nft_delivery_mode text");
  await ensureColumn("deposit_payment_sessions", "chain_tx_hash text");
  await ensureColumn("deposit_payment_sessions", "nft_delivered_at text");
  await ensurePaymentProviderRegistry();
  await ensureColumn("balances", "payout_bonus_override_enabled integer not null default 0");
  await ensureColumn("balances", "payout_bonus_percent integer");
  await ensureColumn("transactions", "provider_checked_at text");
  await ensureColumn("transactions", "processed_at text");
  await ensureColumn("transactions", "credited_at text");
  await ensureColumn("transactions", "next_check_at text");
  await ensureColumn("transactions", "last_error text");
  await ensureColumn("transactions", "reconciliation_attempts integer not null default 0");
  await ensureColumn("transactions", "environment text not null default 'production'");
  await ensureColumn("transactions", "direction text");
  await ensureColumn("transactions", "balance_before integer");
  await ensureColumn("transactions", "balance_after integer");
  await ensureColumn("transactions", "source text not null default 'system'");
  await ensureColumn("transactions", "admin_note text");
  await ensureColumn("transactions", "support_note text");
  await ensureColumn("transactions", "visible_description text");
  await ensureColumn("transactions", "related_product_id text");
  await ensureColumn("transactions", "related_order_id text");
  await ensureColumn("transactions", "edited_by_admin_id text");
  await ensureColumn("transactions", "edited_at text");
  await ensureColumn("owned_cards", "status text not null default 'active'");
  await ensureColumn("owned_cards", "acquisition_source text not null default 'purchase'");
  await ensureColumn("owned_cards", "removed_at text");
  await ensureColumn("owned_cards", "delivery_mode text not null default 'digital'");
  await ensureColumn("owned_cards", "admin_note text");
  await ensureColumn("owned_cards", "visible_user_note text");
  await ensureColumn("owned_cards", "related_transaction_id text");
  await ensureColumn("owned_cards", "related_order_id text");
  await ensureColumn("owned_cards", "updated_at text");
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
  await ensureRandomizedPackTables();
  await ensurePaymentReconciliationRunsTable();
  await ensureArchiveTrustTables();
  await ensureAdminUserManagementTables();
  await ensurePerformanceIndexes();
}

async function ensureCoinflowDepositPaymentSessionColumns() {
  await ensureColumn("deposit_payment_sessions", "provider_environment text");
  await ensureColumn("deposit_payment_sessions", "provider_checkout_env text");
  await ensureColumn("deposit_payment_sessions", "amount_cents integer");
  await ensureColumn("deposit_payment_sessions", "provider_session_key text");
  await ensureColumn("deposit_payment_sessions", "provider_checkout_jwt text");
  await ensureColumn("deposit_payment_sessions", "provider_payment_id text");
  await ensureColumn("deposit_payment_sessions", "provider_event_id text");
  await ensureColumn("deposit_payment_sessions", "provider_raw_status text");
  await ensureColumn("deposit_payment_sessions", "provider_raw_payload text");
  await ensureColumn("deposit_payment_sessions", "coinflow_customer_id text");
  await ensureColumn("deposit_payment_sessions", "coinflow_payment_id text");
  await ensureColumn("deposit_payment_sessions", "coinflow_webhook_info text");
  await ensureColumn("deposit_payment_sessions", "coinflow_settlement_type text");
  await ensureColumn("deposit_payment_sessions", "coinflow_last4 text");
  await ensureColumn("deposit_payment_sessions", "coinflow_bin text");
  await ensureColumn("deposit_payment_sessions", "coinflow_card_token text");
  await ensureColumn("deposit_payment_sessions", "idempotency_key text");
  await ensureColumn("deposit_payment_sessions", "completed_at text");
  await ensureColumn("deposit_payment_sessions", "failed_at text");
}

async function ensurePerformanceIndexes() {
  await Promise.all([
    execute("create index if not exists idx_users_username on users(username)"),
    execute("create index if not exists idx_users_email on users(email)"),
    execute("create index if not exists idx_transactions_user_created on transactions(user_id, created_at)"),
    execute("create index if not exists idx_transactions_status_provider_created on transactions(status, payment_provider, created_at)"),
    execute("create index if not exists idx_transactions_provider_env_created on transactions(payment_provider, environment, created_at)"),
    execute("create index if not exists idx_payment_sessions_user_status_created on payment_sessions(user_id, status, created_at)"),
    execute("create index if not exists idx_deposit_payment_sessions_user_status_created on deposit_payment_sessions(user_id, status, created_at)"),
    execute("create index if not exists idx_withdrawals_user_created on withdrawal_requests(user_id, created_at)"),
    execute("create index if not exists idx_withdrawal_history_withdrawal_created on withdrawal_status_history(withdrawal_id, created_at)"),
    execute("create index if not exists idx_orders_user_created on orders(user_id, created_at)"),
    execute("create index if not exists idx_orders_user_payment_state on orders(user_id, payment_state)"),
    execute("create index if not exists idx_owned_cards_user_acquired on owned_cards(user_id, acquired_at)"),
    execute("create index if not exists idx_user_kyc_profiles_user on user_kyc_profiles(user_id)"),
    execute("create index if not exists idx_broadcast_deliveries_user_status on broadcast_deliveries(user_id, status)"),
    execute("create index if not exists idx_user_notifications_user_popup_created on user_notifications(user_id, show_as_popup, created_at)"),
    execute("create index if not exists idx_user_payment_gate_access_user_provider on user_payment_gate_access(user_id, provider_key)"),
    execute("create index if not exists idx_archive_ledger_user_created on archive_ledger(user_id, created_at)"),
    execute("create index if not exists idx_webhook_events_provider_received on webhook_events(provider, received_at)"),
    execute("create index if not exists idx_admin_audit_logs_target_created on admin_audit_logs(target_user_id, created_at)"),
    execute("create index if not exists idx_user_inventory_ledger_user_created on user_inventory_ledger(user_id, created_at)"),
    execute("create index if not exists idx_product_inventory_movements_product_created on product_inventory_movements(product_id, created_at)"),
  ]);
}

async function ensurePaymentProviderRegistry() {
  const timestamp = nowIso();
  const providers: Array<{
    key: PaymentProviderKey;
    gateNumber: number;
    providerName: Exclude<PaymentProviderName, "Internal Wallet">;
    publicName: string;
    adminName: string;
    defaultUserVisible: boolean;
    supportsUsd: boolean;
    supportsEur: boolean;
    minAmount: number;
    maxAmount: number | null;
    minDepositAmount: number;
    maxDepositAmount: number | null;
    defaultDepositAmount: number | null;
    currency: SupportedCurrency;
    priority: number;
  }> = [
    {
      key: "transvoucher",
      gateNumber: 1,
      providerName: "TransVoucher",
      publicName: "Gate #1",
      adminName: "Gate #1 - TransVoucher",
      defaultUserVisible: true,
      supportsUsd: true,
      supportsEur: true,
      minAmount: 10,
      maxAmount: 20000,
      minDepositAmount: 10,
      maxDepositAmount: 20000,
      defaultDepositAmount: 250,
      currency: "USD",
      priority: 10,
    },
    {
      key: "cleffo",
      gateNumber: 2,
      providerName: "Cleffo",
      publicName: "Gate #2",
      adminName: "Gate #2 - Cleffo",
      defaultUserVisible: false,
      supportsUsd: true,
      supportsEur: false,
      minAmount: 10,
      maxAmount: 500,
      minDepositAmount: 10,
      maxDepositAmount: 500,
      defaultDepositAmount: 250,
      currency: "USD",
      priority: 20,
    },
    {
      key: "wert",
      gateNumber: 3,
      providerName: "Wert.io",
      publicName: "Gate #3",
      adminName: "Gate #3 - Wert.io",
      defaultUserVisible: false,
      supportsUsd: true,
      supportsEur: false,
      minAmount: 10,
      maxAmount: 500,
      minDepositAmount: 10,
      maxDepositAmount: 500,
      defaultDepositAmount: 250,
      currency: "USD",
      priority: 30,
    },
    {
      key: "coinflow",
      gateNumber: 4,
      providerName: "Coinflow",
      publicName: "Gate #4",
      adminName: "Gate #4 - Coinflow",
      defaultUserVisible: false,
      supportsUsd: true,
      supportsEur: false,
      minAmount: 10,
      maxAmount: 500,
      minDepositAmount: 10,
      maxDepositAmount: 500,
      defaultDepositAmount: 250,
      currency: "USD",
      priority: 40,
    },
  ];

  for (const provider of providers) {
    await execute(
      `insert into payment_providers (
        provider_key, gate_number, provider_name, public_name, admin_name,
        enabled, default_user_visible, supports_usd, supports_eur,
        min_amount, max_amount, min_deposit_amount, max_deposit_amount,
        default_deposit_amount, currency, priority, created_at, updated_at
      ) values (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(provider_key) do update set
        gate_number = excluded.gate_number,
        provider_name = excluded.provider_name,
        public_name = excluded.public_name,
        admin_name = excluded.admin_name,
        default_user_visible = excluded.default_user_visible,
        supports_usd = excluded.supports_usd,
        supports_eur = excluded.supports_eur,
        min_amount = case when payment_providers.min_amount <= 1 then excluded.min_amount else payment_providers.min_amount end,
        max_amount = coalesce(payment_providers.max_amount, excluded.max_amount),
        min_deposit_amount = case when payment_providers.min_deposit_amount <= 1 then excluded.min_deposit_amount else payment_providers.min_deposit_amount end,
        max_deposit_amount = coalesce(payment_providers.max_deposit_amount, excluded.max_deposit_amount),
        default_deposit_amount = coalesce(payment_providers.default_deposit_amount, excluded.default_deposit_amount),
        currency = coalesce(payment_providers.currency, excluded.currency),
        priority = excluded.priority,
        updated_at = excluded.updated_at`,
      [
        provider.key,
        provider.gateNumber,
        provider.providerName,
        provider.publicName,
        provider.adminName,
        provider.defaultUserVisible ? 1 : 0,
        provider.supportsUsd ? 1 : 0,
        provider.supportsEur ? 1 : 0,
        provider.minAmount,
        provider.maxAmount,
        provider.minDepositAmount,
        provider.maxDepositAmount,
        provider.defaultDepositAmount,
        provider.currency,
        provider.priority,
        timestamp,
        timestamp,
      ],
    );
  }
}

function normalizePaymentGateAccess(row: DbRow): PaymentGateAccessRecord {
  const supportsCurrencies: SupportedCurrency[] = [];
  if (Number(row.supports_usd ?? 0) === 1) {
    supportsCurrencies.push("USD");
  }
  if (
    !["cleffo", "wert", "coinflow"].includes(String(row.provider_key)) &&
    Number(row.supports_eur ?? 0) === 1
  ) {
    supportsCurrencies.push("EUR");
  }

  const defaultUserVisible = Number(row.default_user_visible ?? 0) === 1;
  const explicitAccess = row.user_access_enabled;
  const accessEnabled =
    explicitAccess === null || explicitAccess === undefined
      ? defaultUserVisible
      : Number(explicitAccess) === 1;

  const providerKey = String(row.provider_key) as PaymentProviderKey;
  const fallbackMax = providerKey === "transvoucher" ? 20000 : 500;
  const maxDepositValue =
    row.max_deposit_amount ?? row.max_amount ?? fallbackMax;

  return {
    providerKey,
    gateNumber: Number(row.gate_number),
    providerName: String(row.provider_name) as Exclude<
      PaymentProviderName,
      "Internal Wallet"
    >,
    publicName: String(row.public_name),
    adminName: String(row.admin_name),
    enabled: Number(row.enabled ?? 0) === 1,
    accessEnabled,
    defaultUserVisible,
    supportsCurrencies,
    minAmount: Number(row.min_deposit_amount ?? row.min_amount ?? 10),
    maxAmount:
      maxDepositValue === null ||
      maxDepositValue === undefined
        ? null
        : Number(maxDepositValue),
    defaultAmount:
      row.default_deposit_amount === null || row.default_deposit_amount === undefined
        ? null
        : Number(row.default_deposit_amount),
    limitCurrency: String(row.currency ?? "USD") as SupportedCurrency,
    reason: row.reason ? String(row.reason) : null,
    updatedAt: row.access_updated_at ? String(row.access_updated_at) : null,
  };
}

export async function getUserPaymentGateAccess(
  userId: string,
): Promise<PaymentGateAccessRecord[]> {
  await ensureDatabase();
  await ensurePaymentProviderRegistry();
  const rows = await queryMany(
    `select
      payment_providers.*,
      user_payment_gate_access.enabled as user_access_enabled,
      user_payment_gate_access.reason,
      user_payment_gate_access.updated_at as access_updated_at
     from payment_providers
     left join user_payment_gate_access
       on user_payment_gate_access.provider_key = payment_providers.provider_key
      and user_payment_gate_access.user_id = ?
     order by payment_providers.priority asc, payment_providers.gate_number asc`,
    [userId],
  );

  return rows.map((row) => normalizePaymentGateAccess(row));
}

export async function getAvailablePaymentGatesForUser(
  userId: string,
): Promise<PaymentGateAccessRecord[]> {
  const gates = await getUserPaymentGateAccess(userId);
  return gates.filter((gate) => gate.enabled && gate.accessEnabled);
}

function formatCompactAmount(value: number) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

async function resolveDepositGateForUser(input: {
  userId: string;
  provider?: Exclude<PaymentProviderName, "Internal Wallet"> | null;
  gateNumber?: number | null;
  amount: number;
  currency: SupportedCurrency;
}) {
  const row =
    input.gateNumber || input.provider
      ? await queryOne(
          `select
            payment_providers.*,
            user_payment_gate_access.enabled as user_access_enabled,
            user_payment_gate_access.reason,
            user_payment_gate_access.updated_at as access_updated_at
           from payment_providers
           left join user_payment_gate_access
             on user_payment_gate_access.provider_key = payment_providers.provider_key
            and user_payment_gate_access.user_id = ?
           where ${
             input.gateNumber
               ? "payment_providers.gate_number = ?"
               : "payment_providers.provider_name = ?"
           }
           limit 1`,
          [input.userId, input.gateNumber ? input.gateNumber : input.provider ?? ""],
        )
      : null;

  const gate = row
    ? normalizePaymentGateAccess(row)
    : (await getUserPaymentGateAccess(input.userId)).find((item) => {
        if (input.gateNumber) {
          return item.gateNumber === input.gateNumber;
        }

        return item.providerName === input.provider;
      });

  if (!gate || !gate.enabled || !gate.accessEnabled) {
    throw new Error("This payment gate is not available for your account.");
  }

  if (["cleffo", "wert", "coinflow"].includes(gate.providerKey) && input.currency !== "USD") {
    throw new Error(`${gate.publicName} supports USD payments only.`);
  }

  if (!gate.supportsCurrencies.includes(input.currency)) {
    throw new Error(`${gate.publicName} does not support ${input.currency}.`);
  }

  if (input.amount < gate.minAmount) {
    throw new Error(`Minimum deposit for ${gate.publicName} is $${formatCompactAmount(gate.minAmount)}.`);
  }

  if (gate.maxAmount !== null && input.amount > gate.maxAmount) {
    throw new Error(`Maximum deposit for ${gate.publicName} is $${formatCompactAmount(gate.maxAmount)}.`);
  }

  return gate;
}

function getRequestedDepositProviderName(input: {
  provider?: Exclude<PaymentProviderName, "Internal Wallet"> | null;
  gateNumber?: number | null;
}) {
  if (input.provider) {
    return input.provider;
  }

  if (input.gateNumber === 1) {
    return "TransVoucher";
  }
  if (input.gateNumber === 2) {
    return "Cleffo";
  }
  if (input.gateNumber === 3) {
    return "Wert.io";
  }
  if (input.gateNumber === 4) {
    return "Coinflow";
  }

  return null;
}

function getRequestedDepositProviderKey(input: {
  provider?: Exclude<PaymentProviderName, "Internal Wallet"> | null;
  gateNumber?: number | null;
}): PaymentProviderKey | null {
  if (input.provider === "TransVoucher" || input.gateNumber === 1) {
    return "transvoucher";
  }
  if (input.provider === "Cleffo" || input.gateNumber === 2) {
    return "cleffo";
  }
  if (input.provider === "Wert.io" || input.gateNumber === 3) {
    return "wert";
  }
  if (input.provider === "Coinflow" || input.gateNumber === 4) {
    return "coinflow";
  }

  return null;
}

export async function updateUserPaymentGateAccess(input: {
  adminUserId: string;
  targetUserId: string;
  providerKey: PaymentProviderKey;
  enabled: boolean;
  reason: string;
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  route: string;
  timestamp: string;
}) {
  await ensureDatabase();

  if (!input.reason.trim()) {
    throw new Error("Reason is required for payment gate access changes.");
  }

  const provider = await queryOne(
    "select * from payment_providers where provider_key = ? limit 1",
    [input.providerKey],
  );
  if (!provider) {
    throw new Error("Payment gate not found.");
  }

  const target = await getUserById(input.targetUserId);
  if (!target) {
    throw new Error("Target user not found.");
  }

  const timestamp = nowIso();
  await execute(
    `insert into user_payment_gate_access (
      id, user_id, provider_key, enabled, reason, updated_by, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(user_id, provider_key) do update set
      enabled = excluded.enabled,
      reason = excluded.reason,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at`,
    [
      randomUUID(),
      input.targetUserId,
      input.providerKey,
      input.enabled ? 1 : 0,
      input.reason.trim(),
      input.adminUserId,
      timestamp,
      timestamp,
    ],
  );

  await insertSecurityAuditEvent({
    eventType: input.enabled
      ? "user_gate_access_granted"
      : "user_gate_access_revoked",
    userId: target.id,
    username: target.username,
    telegramUsername: target.telegramUsername,
    role: target.role,
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp: input.timestamp,
  });

  revalidateAdmin();
  revalidatePrivate(input.targetUserId);
  return getAdminUserEntryById(input.targetUserId);
}

export async function getAdminPaymentProviders() {
  await ensureDatabase();
  await ensurePaymentProviderRegistry();
  const rows = await queryMany(
    `select payment_providers.*
     from payment_providers
     order by priority asc, gate_number asc`,
  );

  return rows.map((row) =>
    normalizePaymentGateAccess({
      ...row,
      user_access_enabled: null,
      reason: null,
      access_updated_at: row.updated_at,
    }),
  );
}

export async function updateAdminPaymentProviderLimits(input: {
  adminUserId: string;
  providerKey: PaymentProviderKey;
  minDepositAmount: unknown;
  maxDepositAmount: unknown;
  defaultDepositAmount: unknown;
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  route: string;
  timestamp: string;
}) {
  await ensureDatabase();
  await ensurePaymentProviderRegistry();

  const admin = await getAdminIdentity(input.adminUserId);
  const current = await queryOne(
    "select * from payment_providers where provider_key = ? limit 1",
    [input.providerKey],
  );

  if (!current) {
    throw new Error("Payment gate not found.");
  }

  const minDepositAmount = normalizeEditableDepositLimit(
    input.minDepositAmount,
    "Minimum deposit amount",
  );
  const maxDepositAmount = normalizeEditableOptionalDepositLimit(
    input.maxDepositAmount,
    "Maximum deposit amount",
  );
  const defaultDepositAmount = normalizeEditableOptionalDepositLimit(
    input.defaultDepositAmount,
    "Default deposit amount",
  );

  if (maxDepositAmount !== null && maxDepositAmount <= minDepositAmount) {
    throw new Error("Maximum amount must be greater than minimum amount.");
  }

  if (
    defaultDepositAmount !== null &&
    (defaultDepositAmount < minDepositAmount ||
      (maxDepositAmount !== null && defaultDepositAmount > maxDepositAmount))
  ) {
    throw new Error("Default amount must be within the configured deposit limits.");
  }

  const timestamp = input.timestamp || nowIso();
  await execute(
    `update payment_providers set
      min_deposit_amount = ?,
      max_deposit_amount = ?,
      default_deposit_amount = ?,
      min_amount = ?,
      max_amount = ?,
      supports_eur = case when provider_key in ('cleffo', 'wert', 'coinflow') then 0 else supports_eur end,
      currency = 'USD',
      updated_at = ?
     where provider_key = ?`,
    [
      minDepositAmount,
      maxDepositAmount,
      defaultDepositAmount,
      minDepositAmount,
      maxDepositAmount,
      timestamp,
      input.providerKey,
    ],
  );

  await insertSecurityAuditEvent({
    eventType: "payment_gate_limits_updated",
    userId: admin.id,
    username: admin.username,
    telegramUsername: admin.telegramUsername,
    role: admin.role,
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp,
  });

  await logAdminAction(
    admin.id,
    "payment_gate_limits_updated",
    "payment_provider",
    input.providerKey,
    `Updated limits for ${String(current.admin_name ?? input.providerKey)}`,
    {
      metadata: {
        providerKey: input.providerKey,
        gateNumber: Number(current.gate_number),
        oldMin: Number(current.min_deposit_amount ?? current.min_amount ?? 10),
        newMin: minDepositAmount,
        oldMax:
          current.max_deposit_amount === null ||
          current.max_deposit_amount === undefined
            ? null
            : Number(current.max_deposit_amount),
        newMax: maxDepositAmount,
        oldDefault:
          current.default_deposit_amount === null ||
          current.default_deposit_amount === undefined
            ? null
            : Number(current.default_deposit_amount),
        newDefault: defaultDepositAmount,
      },
    },
  );

  revalidateAdmin();
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
  createdAt?: string | null;
}) {
  await ensureDatabase();
  await ensureArchiveTrustTables();
  const createdAt = input.createdAt ?? nowIso();
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

  if (user.latestTermsAcceptedAt) {
    score += 10;
    factors.push("Required documents accepted");
  } else {
    issues.push("Review and accept Required Documents");
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

function buildDocumentAcceptanceStatus(row: DbRow | null): DocumentAcceptanceStatusRecord {
  const required = {
    terms: {
      version: REQUIRED_DOCUMENT_VERSIONS.terms,
      accepted:
        Boolean(row?.terms_accepted_at) &&
        String(row?.terms_version ?? "") === REQUIRED_DOCUMENT_VERSIONS.terms,
      url: "/terms",
      acceptedAt: row?.terms_accepted_at ? String(row.terms_accepted_at) : null,
    },
    privacy: {
      version: REQUIRED_DOCUMENT_VERSIONS.privacy,
      accepted:
        Boolean(row?.privacy_accepted_at) &&
        String(row?.privacy_version ?? "") === REQUIRED_DOCUMENT_VERSIONS.privacy,
      url: "/privacy-policy",
      acceptedAt: row?.privacy_accepted_at ? String(row.privacy_accepted_at) : null,
    },
    refund: {
      version: REQUIRED_DOCUMENT_VERSIONS.refund,
      accepted:
        Boolean(row?.refund_accepted_at) &&
        String(row?.refund_version ?? "") === REQUIRED_DOCUMENT_VERSIONS.refund,
      url: "/refund-policy",
      acceptedAt: row?.refund_accepted_at ? String(row.refund_accepted_at) : null,
    },
    aml: {
      version: REQUIRED_DOCUMENT_VERSIONS.aml,
      accepted:
        Boolean(row?.aml_accepted_at) &&
        String(row?.aml_version ?? "") === REQUIRED_DOCUMENT_VERSIONS.aml,
      url: "/aml-policy",
      acceptedAt: row?.aml_accepted_at ? String(row.aml_accepted_at) : null,
    },
    legalConfirmation: {
      version: REQUIRED_DOCUMENT_VERSIONS.legalConfirmation,
      accepted:
        Boolean(row?.legal_confirmation_accepted_at) &&
        String(row?.legal_confirmation_version ?? "") ===
          REQUIRED_DOCUMENT_VERSIONS.legalConfirmation,
      url: "/terms",
      acceptedAt: row?.legal_confirmation_accepted_at
        ? String(row.legal_confirmation_accepted_at)
        : null,
    },
  };
  const accepted =
    required.terms.accepted &&
    required.privacy.accepted &&
    required.refund.accepted &&
    required.aml.accepted &&
    required.legalConfirmation.accepted;

  return {
    accepted,
    acceptedAllAt: accepted && row?.accepted_all_at ? String(row.accepted_all_at) : null,
    ipAddress: row?.ip_address ? String(row.ip_address) : null,
    userAgent: row?.user_agent ? String(row.user_agent) : null,
    currentVersion: REQUIRED_DOCUMENT_VERSIONS.terms,
    required,
  };
}

export async function getUserDocumentAcceptanceStatus(
  userId: string,
): Promise<DocumentAcceptanceStatusRecord> {
  await ensureDatabase();
  await ensureDocumentAcceptanceTables();
  const row = await queryOne(
    `select * from user_document_acceptances
     where user_id = ?
     order by accepted_all_at desc, created_at desc
     limit 1`,
    [userId],
  );

  return buildDocumentAcceptanceStatus(row ?? null);
}

export async function userHasAcceptedRequiredDocuments(userId: string) {
  const status = await getUserDocumentAcceptanceStatus(userId);
  return status.accepted;
}

export async function requireDocumentAcceptanceForUser(userId: string) {
  if (!(await userHasAcceptedRequiredDocuments(userId))) {
    throw new DocumentAcceptanceRequiredError();
  }
}

export async function acceptRequiredDocuments(input: {
  userId: string;
  termsAccepted: unknown;
  privacyAccepted: unknown;
  refundAccepted: unknown;
  amlAccepted: unknown;
  legalConfirmationAccepted: unknown;
  ipAddress?: string;
  userAgent?: string;
}) {
  await ensureDatabase();
  await ensureDocumentAcceptanceTables();
  const allAccepted =
    input.termsAccepted === true &&
    input.privacyAccepted === true &&
    input.refundAccepted === true &&
    input.amlAccepted === true &&
    input.legalConfirmationAccepted === true;

  if (!allAccepted) {
    if (input.legalConfirmationAccepted !== true) {
      throw new Error("LEGAL_CONFIRMATION_REQUIRED");
    }
    throw new Error("All required documents must be accepted.");
  }

  const timestamp = nowIso();
  const id = randomUUID();
  await execute(
    `insert into user_document_acceptances (
      id, user_id, terms_version, privacy_version, refund_version, aml_version,
      legal_confirmation_version, terms_accepted_at, privacy_accepted_at,
      refund_accepted_at, aml_accepted_at, legal_confirmation_accepted_at,
      accepted_all_at, ip_address, user_agent, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      REQUIRED_DOCUMENT_VERSIONS.terms,
      REQUIRED_DOCUMENT_VERSIONS.privacy,
      REQUIRED_DOCUMENT_VERSIONS.refund,
      REQUIRED_DOCUMENT_VERSIONS.aml,
      REQUIRED_DOCUMENT_VERSIONS.legalConfirmation,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      timestamp,
      timestamp,
    ],
  );
  await execute(
    "update users set latest_terms_accepted_at = ?, updated_at = ? where id = ?",
    [timestamp, timestamp, input.userId],
  );

  const user = await getUserById(input.userId);
  await insertSecurityAuditEvent({
    eventType: "document_acceptance_completed",
    userId: input.userId,
    username: user?.username ?? null,
    telegramUsername: user?.telegramUsername ?? null,
    role: user?.role ?? null,
    ipAddress: input.ipAddress ?? "unknown",
    country: "Unknown",
    userAgent: input.userAgent ?? "Unknown",
    language: "Unknown",
    route: "/api/account/document-acceptance",
    timestamp,
  });
  await appendArchiveLedgerEntry({
    eventType: "document_acceptance_completed",
    userId: input.userId,
    entityType: "user_document_acceptances",
    entityId: id,
    title: "Required documents accepted",
    description: "User accepted current ReboHrome required documents.",
    metadata: {
      termsVersion: REQUIRED_DOCUMENT_VERSIONS.terms,
      privacyVersion: REQUIRED_DOCUMENT_VERSIONS.privacy,
      refundVersion: REQUIRED_DOCUMENT_VERSIONS.refund,
      amlVersion: REQUIRED_DOCUMENT_VERSIONS.aml,
      legalConfirmationVersion: REQUIRED_DOCUMENT_VERSIONS.legalConfirmation,
      acceptedAllAt: timestamp,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  await recalculateVaultIntegrity(input.userId);
  revalidatePrivate(input.userId);
  revalidatePath("/dashboard/settings");

  return getUserDocumentAcceptanceStatus(input.userId);
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
      profiles.withdrawal_wallet, profiles.payment_phone, profiles.gate2_first_name, profiles.gate2_last_name, profiles.gate2_phone, profiles.gate2_details_updated_at, profiles.verified
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
  return /[\u0400-\u04ff]/.test(value);
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
    return "РСЃРїСЂР°РІР»РµРЅРёРµ TransVoucher";
  }
  if (normalized.includes("payment")) {
    return "РћР±РЅРѕРІР»РµРЅРёРµ РїР»Р°С‚РµР¶РµР№";
  }
  if (normalized.includes("withdrawal")) {
    return "РћР±РЅРѕРІР»РµРЅРёРµ РІС‹РІРѕРґРѕРІ";
  }
  if (normalized.includes("maintenance")) {
    return "РўРµС…РЅРёС‡РµСЃРєРѕРµ РѕР±СЃР»СѓР¶РёРІР°РЅРёРµ";
  }
  return "РЈРІРµРґРѕРјР»РµРЅРёРµ ReboHrome";
}

function createRussianFallbackBody(body: string) {
  const normalized = normalizeTranslationKey(body);
  if (normalized === "we fix" || normalized.includes("fix")) {
    return "РњС‹ СѓР¶Рµ СЂР°Р±РѕС‚Р°РµРј РЅР°Рґ РѕР±РЅРѕРІР»РµРЅРёРµРј. РџРѕР¶Р°Р»СѓР№СЃС‚Р°, СЃР»РµРґРёС‚Рµ Р·Р° СЃС‚Р°С‚СѓСЃРѕРј РІ ReboHrome.";
  }
  if (normalized.includes("payment")) {
    return "РњС‹ РѕР±РЅРѕРІР»СЏРµРј РїР»Р°С‚РµР¶РЅС‹Р№ РјР°СЂС€СЂСѓС‚ Рё СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЋ СЃ РїСЂРѕРІР°Р№РґРµСЂРѕРј. РџРѕР¶Р°Р»СѓР№СЃС‚Р°, СЃР»РµРґРёС‚Рµ Р·Р° СЃС‚Р°С‚СѓСЃРѕРј РІ ReboHrome.";
  }
  return "РќРѕРІРѕРµ Р°СЂС…РёРІРЅРѕРµ СѓРІРµРґРѕРјР»РµРЅРёРµ РґРѕСЃС‚СѓРїРЅРѕ РІ ReboHrome. РџРѕР¶Р°Р»СѓР№СЃС‚Р°, РѕР·РЅР°РєРѕРјСЊС‚РµСЃСЊ СЃ РѕР±РЅРѕРІР»РµРЅРёРµРј РЅР° РїР»Р°С‚С„РѕСЂРјРµ.";
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
    "transvoucher stop": "TransVoucher РІСЂРµРјРµРЅРЅРѕ РѕСЃС‚Р°РЅРѕРІР»РµРЅ",
    "transvoucher fix": "РСЃРїСЂР°РІР»РµРЅРёРµ TransVoucher",
    "new archive drop is live": "РќРѕРІС‹Р№ Р°СЂС…РёРІРЅС‹Р№ РґСЂРѕРї СѓР¶Рµ РґРѕСЃС‚СѓРїРµРЅ",
    "scheduled maintenance": "РџР»Р°РЅРѕРІРѕРµ С‚РµС…РЅРёС‡РµСЃРєРѕРµ РѕР±СЃР»СѓР¶РёРІР°РЅРёРµ",
    "payment verification update": "РћР±РЅРѕРІР»РµРЅРёРµ РїСЂРѕРІРµСЂРєРё РїР»Р°С‚РµР¶РµР№",
    "withdrawal review update": "РћР±РЅРѕРІР»РµРЅРёРµ РїСЂРѕРІРµСЂРєРё РІС‹РІРѕРґРѕРІ",
    "archive rules updated": "РџСЂР°РІРёР»Р° Р°СЂС…РёРІР° РѕР±РЅРѕРІР»РµРЅС‹",
    "security notice": "РЈРІРµРґРѕРјР»РµРЅРёРµ Р±РµР·РѕРїР°СЃРЅРѕСЃС‚Рё",
  };
  const bodyTranslations: Record<string, string> = {
    "we fix": "РњС‹ СѓР¶Рµ СЂР°Р±РѕС‚Р°РµРј РЅР°Рґ РѕР±РЅРѕРІР»РµРЅРёРµРј. РџРѕР¶Р°Р»СѓР№СЃС‚Р°, СЃР»РµРґРёС‚Рµ Р·Р° СЃС‚Р°С‚СѓСЃРѕРј РІ ReboHrome.",
    "we are temporarily updating payment routing. please do not create duplicate payments while provider sync is active.":
      "РњС‹ РІСЂРµРјРµРЅРЅРѕ РѕР±РЅРѕРІР»СЏРµРј РїР»Р°С‚РµР¶РЅСѓСЋ РјР°СЂС€СЂСѓС‚РёР·Р°С†РёСЋ. РџРѕР¶Р°Р»СѓР№СЃС‚Р°, РЅРµ СЃРѕР·РґР°РІР°Р№С‚Рµ РїРѕРІС‚РѕСЂРЅС‹Рµ РїР»Р°С‚РµР¶Рё, РїРѕРєР° СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РїСЂРѕРІР°Р№РґРµСЂР° Р°РєС‚РёРІРЅР°.",
    "a new set of digital collectibles is now available in the marketplace.":
      "РќРѕРІС‹Р№ РЅР°Р±РѕСЂ С†РёС„СЂРѕРІС‹С… РєРѕР»Р»РµРєС†РёРѕРЅРЅС‹С… РєР°СЂС‚ СѓР¶Рµ РґРѕСЃС‚СѓРїРµРЅ РІ РјР°СЂРєРµС‚РїР»РµР№СЃРµ.",
    "rebohrome will be under maintenance while we update archive systems.":
      "ReboHrome Р±СѓРґРµС‚ РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ, РїРѕРєР° РјС‹ РѕР±РЅРѕРІР»СЏРµРј Р°СЂС…РёРІРЅС‹Рµ СЃРёСЃС‚РµРјС‹.",
    "we are improving payment verification and provider synchronization.":
      "РњС‹ СѓР»СѓС‡С€Р°РµРј РїСЂРѕРІРµСЂРєСѓ РїР»Р°С‚РµР¶РµР№ Рё СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЋ СЃ РїР»Р°С‚РµР¶РЅС‹Рј РїСЂРѕРІР°Р№РґРµСЂРѕРј.",
    "withdrawal requests are reviewed manually and processed according to archive rules.":
      "Р—Р°СЏРІРєРё РЅР° РІС‹РІРѕРґ РїСЂРѕРІРµСЂСЏСЋС‚СЃСЏ РІСЂСѓС‡РЅСѓСЋ Рё РѕР±СЂР°Р±Р°С‚С‹РІР°СЋС‚СЃСЏ СЃРѕРіР»Р°СЃРЅРѕ РїСЂР°РІРёР»Р°Рј Р°СЂС…РёРІР°.",
    "please review the latest archive economy rules before continuing withdrawal activity.":
      "РџРѕР¶Р°Р»СѓР№СЃС‚Р°, РѕР·РЅР°РєРѕРјСЊС‚РµСЃСЊ СЃ Р°РєС‚СѓР°Р»СЊРЅС‹РјРё РїСЂР°РІРёР»Р°РјРё Р°СЂС…РёРІР° РїРµСЂРµРґ РїСЂРѕРґРѕР»Р¶РµРЅРёРµРј РѕРїРµСЂР°С†РёР№ РІС‹РІРѕРґР°.",
    "please verify your telegram account and review your account security settings.":
      "РџРѕР¶Р°Р»СѓР№СЃС‚Р°, РїРѕРґС‚РІРµСЂРґРёС‚Рµ Telegram Р°РєРєР°СѓРЅС‚ Рё РїСЂРѕРІРµСЂСЊС‚Рµ РЅР°СЃС‚СЂРѕР№РєРё Р±РµР·РѕРїР°СЃРЅРѕСЃС‚Рё РїСЂРѕС„РёР»СЏ.",
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
    "transvoucher РІСЂРµРјРµРЅРЅРѕ РѕСЃС‚Р°РЅРѕРІР»РµРЅ": "TransVoucher maintenance",
    "РЅРѕРІС‹Р№ Р°СЂС…РёРІРЅС‹Р№ РґСЂРѕРї СѓР¶Рµ РґРѕСЃС‚СѓРїРµРЅ": "New archive drop is live",
    "РїР»Р°РЅРѕРІРѕРµ С‚РµС…РЅРёС‡РµСЃРєРѕРµ РѕР±СЃР»СѓР¶РёРІР°РЅРёРµ": "Scheduled maintenance",
    "РѕР±РЅРѕРІР»РµРЅРёРµ РїСЂРѕРІРµСЂРєРё РїР»Р°С‚РµР¶РµР№": "Payment verification update",
    "РѕР±РЅРѕРІР»РµРЅРёРµ РїСЂРѕРІРµСЂРєРё РІС‹РІРѕРґРѕРІ": "Withdrawal review update",
    "РїСЂР°РІРёР»Р° Р°СЂС…РёРІР° РѕР±РЅРѕРІР»РµРЅС‹": "Archive rules updated",
    "СѓРІРµРґРѕРјР»РµРЅРёРµ Р±РµР·РѕРїР°СЃРЅРѕСЃС‚Рё": "Security notice",
  };
  const bodyTranslations: Record<string, string> = {
    "РјС‹ СѓР¶Рµ СЂР°Р±РѕС‚Р°РµРј РЅР°Рґ РѕР±РЅРѕРІР»РµРЅРёРµРј. РїРѕР¶Р°Р»СѓР№СЃС‚Р°, СЃР»РµРґРёС‚Рµ Р·Р° СЃС‚Р°С‚СѓСЃРѕРј РІ rebohrome.":
      "We are already working on the update. Please follow the status in ReboHrome.",
    "РјС‹ РІСЂРµРјРµРЅРЅРѕ РѕР±РЅРѕРІР»СЏРµРј РїР»Р°С‚РµР¶РЅСѓСЋ РјР°СЂС€СЂСѓС‚РёР·Р°С†РёСЋ. РїРѕР¶Р°Р»СѓР№СЃС‚Р°, РЅРµ СЃРѕР·РґР°РІР°Р№С‚Рµ РїРѕРІС‚РѕСЂРЅС‹Рµ РїР»Р°С‚РµР¶Рё, РїРѕРєР° СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РїСЂРѕРІР°Р№РґРµСЂР° Р°РєС‚РёРІРЅР°.":
      "We are temporarily updating payment routing. Please do not create duplicate payments while provider sync is active.",
    "РЅРѕРІС‹Р№ РЅР°Р±РѕСЂ С†РёС„СЂРѕРІС‹С… РєРѕР»Р»РµРєС†РёРѕРЅРЅС‹С… РєР°СЂС‚ СѓР¶Рµ РґРѕСЃС‚СѓРїРµРЅ РІ РјР°СЂРєРµС‚РїР»РµР№СЃРµ.":
      "A new set of digital collectibles is now available in the marketplace.",
    "rebohrome Р±СѓРґРµС‚ РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ, РїРѕРєР° РјС‹ РѕР±РЅРѕРІР»СЏРµРј Р°СЂС…РёРІРЅС‹Рµ СЃРёСЃС‚РµРјС‹.":
      "ReboHrome will be under maintenance while we update archive systems.",
    "РјС‹ СѓР»СѓС‡С€Р°РµРј РїСЂРѕРІРµСЂРєСѓ РїР»Р°С‚РµР¶РµР№ Рё СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЋ СЃ РїР»Р°С‚РµР¶РЅС‹Рј РїСЂРѕРІР°Р№РґРµСЂРѕРј.":
      "We are improving payment verification and provider synchronization.",
    "Р·Р°СЏРІРєРё РЅР° РІС‹РІРѕРґ РїСЂРѕРІРµСЂСЏСЋС‚СЃСЏ РІСЂСѓС‡РЅСѓСЋ Рё РѕР±СЂР°Р±Р°С‚С‹РІР°СЋС‚СЃСЏ СЃРѕРіР»Р°СЃРЅРѕ РїСЂР°РІРёР»Р°Рј Р°СЂС…РёРІР°.":
      "Withdrawal requests are reviewed manually and processed according to archive rules.",
    "РїРѕР¶Р°Р»СѓР№СЃС‚Р°, РѕР·РЅР°РєРѕРјСЊС‚РµСЃСЊ СЃ Р°РєС‚СѓР°Р»СЊРЅС‹РјРё РїСЂР°РІРёР»Р°РјРё Р°СЂС…РёРІР° РїРµСЂРµРґ РїСЂРѕРґРѕР»Р¶РµРЅРёРµРј РѕРїРµСЂР°С†РёР№ РІС‹РІРѕРґР°.":
      "Please review the latest Archive Economy Rules before continuing withdrawal activity.",
    "РїРѕР¶Р°Р»СѓР№СЃС‚Р°, РїРѕРґС‚РІРµСЂРґРёС‚Рµ telegram Р°РєРєР°СѓРЅС‚ Рё РїСЂРѕРІРµСЂСЊС‚Рµ РЅР°СЃС‚СЂРѕР№РєРё Р±РµР·РѕРїР°СЃРЅРѕСЃС‚Рё РїСЂРѕС„РёР»СЏ.":
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
    "<b>рџ”” ReboHrome Notification</b>",
    "",
    `<b>EN рџ‡єрџ‡ё вЂ” ${escapeTelegramHtml(titleEn).slice(0, 120)}</b>`,
    `<blockquote>${escapeTelegramHtml(bodyEn).slice(0, 450)}</blockquote>`,
    "",
    `<b>RU рџ‡·рџ‡є вЂ” ${escapeTelegramHtml(titleRu || originalTitle).slice(0, 120)}</b>`,
    `<blockquote>${escapeTelegramHtml(bodyRu || originalBody).slice(0, 450)}</blockquote>`,
    "",
    "в”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓ",
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
  return withPerf("query=getProviderIntelligence", async () => {
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
  });
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
  return withPerf("query=getActiveUserPopups", async () => {
    await ensureDatabase();
    const user = await queryOne(
      `select users.status, users.is_deleted, users.kyc_verified, users.kyc_status,
              profiles.telegram_verified
       from users
       left join profiles on profiles.user_id = users.id
       where users.id = ?
       limit 1`,
      [userId],
    );

    const userCanSeeVerifiedPopups =
      Number(user?.telegram_verified ?? 0) === 1 ||
      (Number(user?.kyc_verified ?? 0) === 1 &&
        ["approved", "manual_approved"].includes(String(user?.kyc_status ?? "")));

    if (
      !user ||
      !userCanSeeVerifiedPopups ||
      Number(user.is_deleted ?? 0) === 1 ||
      user.status === "blocked"
    ) {
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
      [timestamp, userCanSeeVerifiedPopups ? 1 : 0],
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
    await ensurePaymentSessionLookupIndexes();
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
        image_url, featured, homepage_featured, featured_started_at, is_randomized,
        randomized_outcomes_json, showcase_float, showcase_rotation_seconds, status,
        archived, palette_glow, palette_glow_soft, palette_core, palette_ring, created_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        product.isRandomized ? 1 : 0,
        toJson(product.randomizedOutcomes ?? []),
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
      profiles.withdrawal_wallet, profiles.payment_phone, profiles.gate2_first_name, profiles.gate2_last_name, profiles.gate2_phone, profiles.gate2_details_updated_at, profiles.verified
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
      profiles.withdrawal_wallet, profiles.payment_phone, profiles.gate2_first_name, profiles.gate2_last_name, profiles.gate2_phone, profiles.gate2_details_updated_at, profiles.verified
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
      profiles.withdrawal_wallet, profiles.payment_phone, profiles.gate2_first_name, profiles.gate2_last_name, profiles.gate2_phone, profiles.gate2_details_updated_at, profiles.verified
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
      profiles.withdrawal_wallet, profiles.payment_phone, profiles.gate2_first_name, profiles.gate2_last_name, profiles.gate2_phone, profiles.gate2_details_updated_at, profiles.verified
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
      profiles.withdrawal_wallet, profiles.payment_phone, profiles.gate2_first_name, profiles.gate2_last_name, profiles.gate2_phone, profiles.gate2_details_updated_at, profiles.verified
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
  telegramUsername?: string | null;
  telegramId?: string | null;
  ignoreVerificationId?: string | null;
}) {
  const telegramUsername = input.telegramUsername?.trim() ?? "";
  const [existingUser, existingEmail, existingTelegram] = await Promise.all([
    queryOne("select id from users where username = ? limit 1", [input.username]),
    queryOne("select id from users where email = ? limit 1", [input.email]),
    telegramUsername
      ? queryOne("select user_id from profiles where telegram_username = ? limit 1", [
          telegramUsername,
        ])
      : Promise.resolve(null),
  ]);

  if (existingUser) {
    throw new Error("This username is already taken.");
  }

  if (existingEmail) {
    throw new Error("This email is already connected to another account.");
  }

  if (telegramUsername && existingTelegram) {
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
      telegramUsername || null,
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

    const randomization = await resolveRandomizedProductDisclosure(product);
    if (!randomization.isReady) {
      throw new Error(
        `${product.title} is temporarily unavailable while its draw probabilities are being updated.`,
      );
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

type CreatedCheckoutOrderItem = {
  id: string;
  product: ProductRecord;
  quantity: number;
  deliveryType: DeliveryType;
};

async function insertCheckoutOrderItems(input: {
  orderId: string;
  items: CheckoutSessionLine[];
  productMap: Map<string, ProductRecord>;
}) {
  const created: CreatedCheckoutOrderItem[] = [];
  for (const item of input.items) {
    const product = input.productMap.get(item.productId)!;
    const rowsToCreate = product.isRandomized ? item.quantity : 1;
    for (let index = 0; index < rowsToCreate; index += 1) {
      const id = randomUUID();
      const quantity = product.isRandomized ? 1 : item.quantity;
      await execute(
        `insert into order_items (
          id, order_id, product_id, quantity, unit_price, delivery_type
        ) values (?, ?, ?, ?, ?, ?)`,
        [id, input.orderId, product.id, quantity, product.price, item.deliveryType],
      );
      created.push({ id, product, quantity, deliveryType: item.deliveryType });
    }
  }
  return created;
}

class RandomizedPackPoolChangedError extends Error {
  constructor() {
    super("Randomized pack availability changed. Its probabilities are being refreshed.");
    this.name = "RandomizedPackPoolChangedError";
  }
}

async function reserveRandomizedOrderItemInTransaction(
  transaction: LibsqlTransaction,
  input: {
    orderId: string;
    orderItemId: string;
    userId: string;
    packProductId: string;
    expiresAt: string;
  },
) {
  const timestamp = nowIso();
  const existing = await transactionOne(
    transaction,
    "select * from randomized_pack_reservations where order_item_id = ? limit 1",
    [input.orderItemId],
  );
  if (
    existing &&
    String(existing.status) === "active" &&
    String(existing.expires_at) > timestamp
  ) {
    return String(existing.id);
  }

  const version = await transactionOne(
    transaction,
    `select * from randomized_pack_versions
       where pack_product_id = ? and status = 'published'
       order by version desc limit 1`,
    [input.packProductId],
  );
  if (!version) {
    throw new RandomizedPackPoolChangedError();
  }
  const rows = await transactionMany(
    transaction,
    `select randomized_pack_outcomes.*
       from randomized_pack_outcomes
       inner join products on products.id = randomized_pack_outcomes.outcome_product_id
       where randomized_pack_outcomes.version_id = ?
         and products.archived = 0
         and products.status = 'active'
         and products.stock > (
           select count(*) from randomized_pack_reservations
           where randomized_pack_reservations.outcome_product_id = products.id
             and randomized_pack_reservations.status = 'active'
             and randomized_pack_reservations.expires_at > ?
         )
       order by randomized_pack_outcomes.ordinal asc`,
    [String(version.id), timestamp],
  );
  const outcomes = rows.map((row) => ({
    productId: String(row.outcome_product_id),
    probabilityBps: Number(row.probability_bps),
  }));
  if (
    outcomes.length < 2 ||
    outcomes.reduce((sum, outcome) => sum + outcome.probabilityBps, 0) !== 10_000
  ) {
    throw new RandomizedPackPoolChangedError();
  }

  const roll = randomInt(10_000);
  const selected = drawRandomizedOutcome(outcomes, roll);
  const reservationId = existing ? String(existing.id) : randomUUID();
  if (existing) {
    await transaction.execute({
      sql: `update randomized_pack_reservations set version_id = ?,
          outcome_product_id = ?, roll = ?, status = 'active', expires_at = ?,
          updated_at = ?, consumed_at = null, released_at = null, release_reason = null
          where id = ?`,
      args: [
        String(version.id),
        selected.productId,
        roll,
        input.expiresAt,
        timestamp,
        reservationId,
      ],
    });
  } else {
    await transaction.execute({
      sql: `insert into randomized_pack_reservations (
          id, order_id, order_item_id, user_id, pack_product_id, version_id,
          outcome_product_id, roll, status, expires_at, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      args: [
        reservationId,
        input.orderId,
        input.orderItemId,
        input.userId,
        input.packProductId,
        String(version.id),
        selected.productId,
        roll,
        input.expiresAt,
        timestamp,
        timestamp,
      ],
    });
  }
  await transaction.execute({
    sql: `update order_items set randomized_pack_version_id = ?,
        reserved_outcome_product_id = ? where id = ?`,
    args: [String(version.id), selected.productId, input.orderItemId],
  });
  return reservationId;
}

async function reserveRandomizedOrderItem(input: {
  orderId: string;
  orderItemId: string;
  userId: string;
  packProductId: string;
  expiresAt: string;
}) {
  const transaction = await getDbClient().transaction("write");
  try {
    const reservationId = await reserveRandomizedOrderItemInTransaction(transaction, input);
    await transaction.commit();
    return reservationId;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function reserveRandomizedOrderItemsInTransaction(
  transaction: LibsqlTransaction,
  input: { orderId: string; userId: string; expiresAt: string },
) {
  if (!randomizedPackEngineEnabled()) return;
  const rows = await transactionMany(
    transaction,
    `select order_items.id, order_items.product_id
     from order_items
     inner join products on products.id = order_items.product_id
     where order_items.order_id = ? and products.is_randomized = 1
     order by order_items.id asc`,
    [input.orderId],
  );
  for (const row of rows) {
    await reserveRandomizedOrderItemInTransaction(transaction, {
      orderId: input.orderId,
      orderItemId: String(row.id),
      userId: input.userId,
      packProductId: String(row.product_id),
      expiresAt: input.expiresAt,
    });
  }
}

async function releaseRandomizedOrderReservations(orderId: string, reason: string) {
  if (!randomizedPackEngineEnabled()) return;
  const timestamp = nowIso();
  const transaction = await getDbClient().transaction("write");
  let released = 0;
  try {
    released = await releaseRandomizedPackReservations(transaction, {
      orderId,
      reason,
      releasedAt: timestamp,
    });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
  if (released > 0) {
    await rebuildAllRandomizedPackVersions();
  }
}

async function reserveRandomizedOrderItems(input: {
  orderId: string;
  userId: string;
  expiresAt: string;
}) {
  if (!randomizedPackEngineEnabled()) return;
  const timestamp = nowIso();
  const rows = await queryMany(
    `select order_items.id, order_items.product_id
     from order_items
     inner join products on products.id = order_items.product_id
     left join randomized_pack_reservations
       on randomized_pack_reservations.order_item_id = order_items.id
     where order_items.order_id = ?
       and products.is_randomized = 1
       and (
         randomized_pack_reservations.id is null
         or randomized_pack_reservations.status <> 'active'
         or randomized_pack_reservations.expires_at <= ?
       )
     order by order_items.id asc`,
    [input.orderId, timestamp],
  );
  const reserved: string[] = [];
  try {
    for (const row of rows) {
      let reservationId: string;
      try {
        reservationId = await reserveRandomizedOrderItem({
          orderId: input.orderId,
          orderItemId: String(row.id),
          userId: input.userId,
          packProductId: String(row.product_id),
          expiresAt: input.expiresAt,
        });
      } catch (error) {
        if (!(error instanceof RandomizedPackPoolChangedError)) throw error;
        await rebuildAllRandomizedPackVersions();
        reservationId = await reserveRandomizedOrderItem({
          orderId: input.orderId,
          orderItemId: String(row.id),
          userId: input.userId,
          packProductId: String(row.product_id),
          expiresAt: input.expiresAt,
        });
      }
      reserved.push(reservationId);
      await rebuildAllRandomizedPackVersions();
    }
  } catch (error) {
    await releaseRandomizedOrderReservations(input.orderId, "reservation_batch_failed");
    throw error;
  }
}

async function fulfillOrderInventoryInTransaction(
  transaction: LibsqlTransaction,
  input: {
    orderId: string;
    userId: string;
    acquiredAt: string;
  },
) {
  let randomizedInventoryChanged = false;
  const items = await transactionMany(
    transaction,
    `select order_items.id as order_item_id, order_items.product_id,
      order_items.quantity, order_items.delivery_type,
      order_items.randomized_draw_id, products.title, products.is_randomized
     from order_items
     inner join products on products.id = order_items.product_id
     where order_items.order_id = ?
     order by order_items.id asc`,
    [input.orderId],
  );
  const delivered: Array<{ productId: string; title: string; quantity: number }> = [];

  for (const item of items) {
    const orderItemId = String(item.order_item_id);
    const isRandomized = randomizedPackEngineEnabled() && asBoolean(item.is_randomized);
    if (isRandomized) {
      const draw = await consumeRandomizedPackReservation(transaction, {
        orderId: input.orderId,
        orderItemId,
        userId: input.userId,
        acquiredAt: input.acquiredAt,
      });
      randomizedInventoryChanged ||= draw.created;
      delivered.push({
        productId: draw.productId,
        title: draw.title,
        quantity: 1,
      });
      continue;
    }

    const quantity = Number(item.quantity);
    const stockResult = await transaction.execute({
      sql: "update products set stock = stock - ?, updated_at = ? where id = ? and stock >= ?",
      args: [quantity, input.acquiredAt, String(item.product_id), quantity],
    });
    if (stockResult.rowsAffected !== 1) {
      throw new Error(`${String(item.title)} no longer has enough stock to fulfill this payment.`);
    }
    await transaction.execute({
      sql: `insert into owned_cards (
        id, user_id, product_id, order_id, quantity, acquired_at
      ) values (?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), input.userId, String(item.product_id), input.orderId, quantity, input.acquiredAt],
    });
    delivered.push({
      productId: String(item.product_id),
      title: String(item.title),
      quantity,
    });
  }

  return { delivered, randomizedInventoryChanged };
}

async function completeArchiveBalanceOrderAtomically(input: {
  orderId: string;
  transactionId: string;
  userId: string;
  total: number;
  status: OrderStatus;
  completedAt: string;
}) {
  const transaction = await getDbClient().transaction("write");
  try {
    const order = await transactionOne(
      transaction,
      "select payment_state from orders where id = ? and user_id = ? limit 1",
      [input.orderId, input.userId],
    );
    if (!order) throw new Error("Order not found.");
    if (String(order.payment_state) === "completed") {
      await transaction.commit();
      return { completedNow: false, delivered: [], remainingBalance: null };
    }

    const balance = await transactionOne(
      transaction,
      "select available from balances where user_id = ? limit 1",
      [input.userId],
    );
    if (!balance || Number(balance.available) < input.total) {
      throw new Error("Insufficient archive balance");
    }

    await reserveRandomizedOrderItemsInTransaction(transaction, {
      orderId: input.orderId,
      userId: input.userId,
      expiresAt: new Date(Date.parse(input.completedAt) + 5 * 60_000).toISOString(),
    });
    const fulfillment = await fulfillOrderInventoryInTransaction(transaction, {
      orderId: input.orderId,
      userId: input.userId,
      acquiredAt: input.completedAt,
    });
    const balanceResult = await transaction.execute({
      sql: `update balances set available = available - ?,
        total_spent = total_spent + ?, updated_at = ?
        where user_id = ? and available >= ?`,
      args: [input.total, input.total, input.completedAt, input.userId, input.total],
    });
    if (balanceResult.rowsAffected !== 1) {
      throw new Error("Insufficient archive balance");
    }
    const nextBalance = await transactionOne(
      transaction,
      "select available from balances where user_id = ? limit 1",
      [input.userId],
    );
    const remainingBalance = Number(nextBalance?.available ?? 0);

    await transaction.execute({
      sql: `update orders set status = ?, payment_state = 'completed',
        failure_reason = null, remaining_balance = ?, paid_at = ?, updated_at = ?
        where id = ? and payment_state <> 'completed'`,
      args: [input.status, remainingBalance, input.completedAt, input.completedAt, input.orderId],
    });
    await transaction.execute({
      sql: `update transactions set status = 'completed', summary = 'Card purchase completed',
        paid_at = ?, processed_at = coalesce(processed_at, ?), updated_at = ?
        where id = ? and status <> 'completed'`,
      args: [input.completedAt, input.completedAt, input.completedAt, input.transactionId],
    });
    await transaction.commit();
    if (fulfillment.randomizedInventoryChanged) {
      await rebuildAllRandomizedPackVersions();
    }
    return {
      completedNow: true,
      delivered: fulfillment.delivered,
      remainingBalance,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function completeTransVoucherOrderAtomically(input: {
  order: OrderRecord;
  transaction: TransactionRecord;
  session: CheckoutPaymentSessionRecord | null;
  providerStatus: string;
  providerTransactionId: string | null;
  providerReferenceId: string | null;
  paymentUrl: string | null;
  rawProviderResponse: string;
  metaJson: string;
  paidAt: string;
}) {
  const transaction = await getDbClient().transaction("write");
  try {
    const currentOrder = await transactionOne(
      transaction,
      "select payment_state, remaining_balance from orders where id = ? limit 1",
      [input.order.id],
    );
    if (!currentOrder) throw new Error("Order not found.");
    if (String(currentOrder.payment_state) === "completed") {
      await transaction.commit();
      return {
        completedNow: false,
        delivered: [],
        remainingBalance: Number(currentOrder.remaining_balance ?? 0),
      };
    }

    const fulfillment = await fulfillOrderInventoryInTransaction(transaction, {
      orderId: input.order.id,
      userId: input.order.userId,
      acquiredAt: input.paidAt,
    });
    await transaction.execute({
      sql: `update balances set total_spent = total_spent + ?, updated_at = ?
        where user_id = ?`,
      args: [input.order.total, input.paidAt, input.order.userId],
    });
    const balance = await transactionOne(
      transaction,
      "select available from balances where user_id = ? limit 1",
      [input.order.userId],
    );
    const remainingBalance = Number(balance?.available ?? 0);
    await transaction.execute({
      sql: `update orders set status = ?, payment_state = 'completed', failure_reason = null,
        remaining_balance = ?, transvoucher_transaction_id = ?,
        transvoucher_reference_id = ?, provider_status = ?, paid_at = ?, updated_at = ?
        where id = ? and payment_state <> 'completed'`,
      args: [
        input.order.shipping > 0 ? "Processing" : "Completed",
        remainingBalance,
        input.providerTransactionId,
        input.providerReferenceId,
        input.providerStatus,
        input.paidAt,
        input.paidAt,
        input.order.id,
      ],
    });
    await transaction.execute({
      sql: `update transactions set payment_provider = 'TransVoucher',
        transvoucher_transaction_id = ?, transvoucher_reference_id = ?, payment_url = ?,
        provider_status = ?, raw_provider_response = ?, status = 'completed',
        summary = 'Card purchase completed', meta_json = ?, paid_at = ?,
        processed_at = coalesce(processed_at, ?), updated_at = ? where id = ?`,
      args: [
        input.providerTransactionId,
        input.providerReferenceId,
        input.paymentUrl,
        input.providerStatus,
        input.rawProviderResponse,
        input.metaJson,
        input.paidAt,
        input.paidAt,
        input.paidAt,
        input.transaction.id,
      ],
    });
    if (input.session) {
      await transaction.execute({
        sql: `update payment_sessions set status = 'completed',
          transvoucher_transaction_id = ?, transvoucher_reference_id = ?, payment_url = ?,
          provider_status = ?, raw_provider_response = ?, updated_at = ? where id = ?`,
        args: [
          input.providerTransactionId,
          input.providerReferenceId,
          input.paymentUrl,
          input.providerStatus,
          input.rawProviderResponse,
          input.paidAt,
          input.session.id,
        ],
      });
    }
    await transaction.commit();
    if (fulfillment.randomizedInventoryChanged) {
      await rebuildAllRandomizedPackVersions();
    }
    return { completedNow: true, delivered: fulfillment.delivered, remainingBalance };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

function parseCheckoutSessionItems(itemsJson: string) {
  return JSON.parse(itemsJson) as CheckoutSessionLine[];
}

function normalizeProviderStatus(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  const normalized = normalizeTransVoucherStatus(raw);

  if (normalized === "succeeded") {
    return "succeeded";
  }

  if (normalized === "declined") {
    return "declined";
  }

  if (normalized === "failed") {
    return "failed";
  }

  if (normalized === "expired") {
    return "expired";
  }

  if (normalized === "processing") {
    return "processing";
  }

  if (normalized === "pending") {
    return "pending";
  }

  return raw || "unknown";
}

async function ensurePaymentSessionLookupIndexes() {
  if (!paymentLookupIndexesPromise) {
    paymentLookupIndexesPromise = Promise.all([
      execute(
        "create index if not exists idx_payment_sessions_active_lookup on payment_sessions(user_id, status, expires_at, created_at)",
      ),
      execute(
        "create index if not exists idx_deposit_payment_sessions_active_lookup on deposit_payment_sessions(user_id, status, expires_at, created_at)",
      ),
    ]).then(() => undefined);
  }

  return paymentLookupIndexesPromise;
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
    normalized === "complete" ||
    normalized === "paid" ||
    normalized === "success" ||
    normalized === "approved" ||
    normalized === "captured" ||
    normalized === "confirmed"
  ) {
    return "completed";
  }

  if (
    normalized === "failed" ||
    normalized === "fail" ||
    normalized === "declined" ||
    normalized === "decline" ||
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "rejected" ||
    normalized === "error"
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
    normalized === "complete" ||
    normalized === "paid" ||
    normalized === "success" ||
    normalized === "approved" ||
    normalized === "captured" ||
    normalized === "confirmed"
  ) {
    return "completed";
  }

  if (
    normalized === "failed" ||
    normalized === "fail" ||
    normalized === "declined" ||
    normalized === "decline" ||
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "rejected" ||
    normalized === "error"
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
    normalized === "complete" ||
    normalized === "paid" ||
    normalized === "success" ||
    normalized === "approved" ||
    normalized === "captured" ||
    normalized === "confirmed"
  ) {
    return "completed";
  }

  if (
    normalized === "failed" ||
    normalized === "fail" ||
    normalized === "declined" ||
    normalized === "decline" ||
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "rejected" ||
    normalized === "error"
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
      return "рџџЎ PENDING";
    case "approved":
      return "рџџЈ APPROVED";
    case "processing":
      return "рџ”µ PROCESSING";
    case "completed":
      return "рџџў COMPLETED";
    case "declined":
      return "рџ”ґ DECLINED";
    default:
      return String(status).toUpperCase();
  }
}

function getWithdrawalStatusIndicator(status: WithdrawalStatus) {
  switch (status) {
    case "pending":
      return "рџџЎ PENDING";
    case "approved":
      return "рџџЈ APPROVED";
    case "processing":
      return "рџ”µ PROCESSING";
    case "completed":
      return "рџџў COMPLETED";
    case "declined":
      return "рџ”ґ DECLINED";
    default:
      return String(status).toUpperCase();
  }
}

function formatOperationalWithdrawalStatus(status: WithdrawalStatus) {
  switch (status) {
    case "pending":
      return "рџџЎ PENDING";
    case "approved":
      return "рџџЈ APPROVED";
    case "processing":
      return "рџ”µ PROCESSING";
    case "completed":
      return "рџџў COMPLETED";
    case "declined":
      return "рџ”ґ DECLINED";
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
        ? `${params.paymentMethod} В· ${params.provider}`
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
        ? `${params.paymentMethod} В· ${params.provider}`
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
        { id: "xrocket", label: "Send xRocket" },
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

  if (callback?.data?.startsWith("withdrawal:") || callback?.data?.startsWith("wd:")) {
    await answerTelegramCallbackSafely({
      callbackQueryId: callback.id,
      text: "Withdrawals are disabled.",
    });
    return { ok: false as const, error: "Withdrawals are currently disabled." };
  }

  return { ok: true as const, skipped: true as const };
}

function revalidateStorefront() {
  revalidatePath("/");
  revalidatePath("/dashboard/marketplace");
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
  revalidatePath("/dashboard/withdraw");
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
          withdraw_access_enabled integer not null default 1,
          withdraw_access_disabled_at text,
          withdraw_access_disabled_by text,
          withdraw_access_disabled_reason text,
          withdraw_access_restored_at text,
          withdraw_access_restored_by text,
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
          payment_phone text,
          gate2_first_name text,
          gate2_last_name text,
          gate2_phone text,
          gate2_details_updated_at text,
          verified integer not null default 1,
          created_at text not null,
          updated_at text not null
        )`,
      );

      await execute(
        `create table if not exists user_kyc_profiles (
          id text primary key,
          user_id text not null unique,
          first_name text not null,
          last_name text not null,
          date_of_birth text not null,
          country_of_residence text not null,
          document_country text not null,
          email text not null,
          phone text,
          address_line1 text,
          address_line2 text,
          city text,
          postal_code text,
          state text,
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
          payout_bonus_override_enabled integer not null default 0,
          payout_bonus_percent integer,
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
          is_randomized integer not null default 0,
          randomized_outcomes_json text not null default '[]',
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
  await ensureColumn("deposit_payment_sessions", "provider_key text");
  await ensureColumn("deposit_payment_sessions", "provider_click_id text");
  await ensureColumn("deposit_payment_sessions", "provider_order_id text");
  await ensureColumn("deposit_payment_sessions", "provider_environment text");
  await ensureColumn("deposit_payment_sessions", "provider_checkout_env text");
  await ensureColumn("deposit_payment_sessions", "balance_credited_at text");
  await ensureColumn("deposit_payment_sessions", "amount_cents integer");
  await ensureColumn("deposit_payment_sessions", "provider_session_key text");
  await ensureColumn("deposit_payment_sessions", "provider_checkout_jwt text");
  await ensureColumn("deposit_payment_sessions", "provider_payment_id text");
  await ensureColumn("deposit_payment_sessions", "provider_event_id text");
  await ensureColumn("deposit_payment_sessions", "provider_raw_status text");
  await ensureColumn("deposit_payment_sessions", "provider_raw_payload text");
  await ensureColumn("deposit_payment_sessions", "coinflow_customer_id text");
  await ensureColumn("deposit_payment_sessions", "coinflow_payment_id text");
  await ensureColumn("deposit_payment_sessions", "coinflow_webhook_info text");
  await ensureColumn("deposit_payment_sessions", "coinflow_settlement_type text");
  await ensureColumn("deposit_payment_sessions", "coinflow_last4 text");
  await ensureColumn("deposit_payment_sessions", "coinflow_bin text");
  await ensureColumn("deposit_payment_sessions", "coinflow_card_token text");
  await ensureColumn("deposit_payment_sessions", "idempotency_key text");
  await ensureColumn("deposit_payment_sessions", "completed_at text");
  await ensureColumn("deposit_payment_sessions", "failed_at text");
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
      await ensureColumn("products", "is_randomized integer not null default 0");
      await ensureColumn(
        "products",
        "randomized_outcomes_json text not null default '[]'",
      );
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
        "update products set randomized_outcomes_json = '[]' where randomized_outcomes_json is null or trim(randomized_outcomes_json) = ''",
      );
      await migrateLegacyRandomizedProducts();
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
  const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 48) : null;

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
    } order by ${orderBy}${limit ? " limit ?" : ""}`,
    args: limit ? [...args, limit] : args,
  };
}

export async function getMarketplaceProducts(filters: MarketplaceFilters = {}) {
  return withPerf("query=getMarketplaceProducts", async () => {
  await ensureDatabase();
  const query = buildMarketplaceQuery(filters);
  const rows = await queryMany(query.sql, query.args);
  return rows.map((row) => normalizeProduct(row));
  });
}

export async function getProductById(id: string) {
  await ensureDatabase();
  const row = await queryOne(
    "select * from products where id = ? and archived = 0 and status = 'active' limit 1",
    [id],
  );
  return row ? normalizeProduct(row) : null;
}

function randomizedPackEngineEnabled() {
  return process.env.RANDOMIZED_PACK_ENGINE_V2 === "true";
}

async function transactionMany(
  transaction: LibsqlTransaction,
  sql: string,
  args: SqlValue[] = [],
) {
  const result = await transaction.execute({ sql, args });
  return result.rows as DbRow[];
}

async function transactionOne(
  transaction: LibsqlTransaction,
  sql: string,
  args: SqlValue[] = [],
) {
  const rows = await transactionMany(transaction, sql, args);
  return rows[0] ?? null;
}

async function publishRandomizedPackVersion(
  policy: (typeof RANDOMIZED_PACK_POLICIES)[number],
) {
  const transaction = await getDbClient().transaction("write");
  const timestamp = nowIso();
  try {
    const pack = await transactionOne(
      transaction,
      "select id, price from products where id = ? and archived = 0 limit 1",
      [policy.productId],
    );
    if (!pack) {
      await transaction.rollback();
      return null;
    }

    const rows = await transactionMany(
      transaction,
      `select products.id, products.title, products.price,
        products.stock - (
          select count(*) from randomized_pack_reservations
          where randomized_pack_reservations.outcome_product_id = products.id
            and randomized_pack_reservations.status = 'active'
            and randomized_pack_reservations.expires_at > ?
        ) as available_units
       from products
       where products.category = 'Trading Card'
         and products.archived = 0
         and products.status = 'active'
         and products.stock > (
           select count(*) from randomized_pack_reservations
           where randomized_pack_reservations.outcome_product_id = products.id
             and randomized_pack_reservations.status = 'active'
             and randomized_pack_reservations.expires_at > ?
         )
       order by products.price asc, products.id asc`,
      [timestamp, timestamp],
    );
    const candidates: RandomizedPackCandidate[] = rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      price: Number(row.price),
      availableUnits: Number(row.available_units),
    }));
    const eligible = selectEligiblePackCandidates(candidates, policy);

    await transaction.execute({
      sql: `insert into randomized_pack_policies (
        pack_product_id, minimum_value, maximum_value, title_pattern,
        formula_version, enabled, created_at, updated_at
      ) values (?, ?, ?, ?, ?, 1, ?, ?)
      on conflict(pack_product_id) do update set
        minimum_value = excluded.minimum_value,
        maximum_value = excluded.maximum_value,
        title_pattern = excluded.title_pattern,
        formula_version = excluded.formula_version,
        enabled = 1,
        updated_at = excluded.updated_at`,
      args: [
        policy.productId,
        policy.minimumValue,
        policy.maximumValue,
        policy.titlePattern?.source ?? null,
        RANDOMIZED_PACK_FORMULA_VERSION,
        timestamp,
        timestamp,
      ],
    });

    if (eligible.length < 2) {
      await transaction.execute({
        sql: "update randomized_pack_versions set status = 'retired' where pack_product_id = ? and status = 'published'",
        args: [policy.productId],
      });
      await transaction.execute({
        sql: `update products set status = 'inactive', stock = 0,
          randomized_outcomes_json = '[]', updated_at = ? where id = ?`,
        args: [timestamp, policy.productId],
      });
      await transaction.commit();
      return null;
    }

    const currentPublishedVersion = await transactionOne(
      transaction,
      `select * from randomized_pack_versions
       where pack_product_id = ? and status = 'published'
       order by version desc limit 1`,
      [policy.productId],
    );
    if (currentPublishedVersion) {
      const currentOutcomeRows = await transactionMany(
        transaction,
        `select outcome_product_id, price_snapshot, title_snapshot
         from randomized_pack_outcomes where version_id = ? order by outcome_product_id asc`,
        [String(currentPublishedVersion.id)],
      );
      const unchanged = hasSameRandomizedPackSnapshot({
        currentFormulaVersion: String(currentPublishedVersion.formula_version),
        currentOutcomes: currentOutcomeRows.map((row) => ({
          productId: String(row.outcome_product_id),
          priceSnapshot: Number(row.price_snapshot),
          titleSnapshot: String(row.title_snapshot),
        })),
        candidates: eligible,
      });
      if (unchanged) {
        await transaction.execute({
          sql: `update products set title = ?, is_randomized = 1, stock = ?,
            status = 'active', updated_at = ? where id = ?`,
          args: [
            policy.publicTitle,
            getRandomizedPackAvailableUnits(eligible),
            timestamp,
            policy.productId,
          ],
        });
        await transaction.commit();
        return String(currentPublishedVersion.id);
      }
    }

    const seed = randomBytes(32).toString("hex");
    const distribution = generateRandomizedPackDistribution({
      packPrice: Number(pack.price),
      candidates: eligible,
      seed,
    });
    const currentVersion = await transactionOne(
      transaction,
      "select coalesce(max(version), 0) as version from randomized_pack_versions where pack_product_id = ?",
      [policy.productId],
    );
    const version = Number(currentVersion?.version ?? 0) + 1;
    const versionId = randomUUID();
    const copy = buildRandomizedPackCopy({
      policy,
      outcomeCount: distribution.outcomes.length,
      bigWinProbabilityBps: distribution.bigWinProbabilityBps,
      minimumOutcomeValue: Math.min(...distribution.outcomes.map((outcome) => outcome.priceSnapshot)),
      maximumOutcomeValue: Math.max(...distribution.outcomes.map((outcome) => outcome.priceSnapshot)),
    });

    await transaction.execute({
      sql: `insert into randomized_pack_versions (
        id, pack_product_id, version, status, seed, formula_version,
        total_probability_bps, expected_value, big_win_probability_bps,
        created_at, published_at
      ) values (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, null)`,
      args: [
        versionId,
        policy.productId,
        version,
        seed,
        RANDOMIZED_PACK_FORMULA_VERSION,
        distribution.totalProbabilityBps,
        distribution.expectedValue,
        distribution.bigWinProbabilityBps,
        timestamp,
      ],
    });
    for (const [index, outcome] of distribution.outcomes.entries()) {
      await transaction.execute({
        sql: `insert into randomized_pack_outcomes (
          id, version_id, outcome_product_id, probability_bps,
          price_snapshot, title_snapshot, ordinal
        ) values (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          versionId,
          outcome.productId,
          outcome.probabilityBps,
          outcome.priceSnapshot,
          outcome.titleSnapshot,
          index,
        ],
      });
    }
    await transaction.execute({
      sql: "update randomized_pack_versions set status = 'retired' where pack_product_id = ? and status = 'published'",
      args: [policy.productId],
    });
    await transaction.execute({
      sql: "update randomized_pack_versions set status = 'published', published_at = ? where id = ?",
      args: [timestamp, versionId],
    });
    await transaction.execute({
      sql: `update products set title = ?, description = ?, tagline = ?,
        is_randomized = 1, randomized_outcomes_json = ?, stock = ?,
        status = 'active', updated_at = ? where id = ?`,
      args: [
        policy.publicTitle,
        copy.description,
        copy.tagline,
        toJson(
          distribution.outcomes.map((outcome) => ({
            productId: outcome.productId,
            probabilityBps: outcome.probabilityBps,
          })),
        ),
        getRandomizedPackAvailableUnits(eligible),
        timestamp,
        policy.productId,
      ],
    });
    await transaction.commit();
    return versionId;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function rebuildAllRandomizedPackVersions() {
  if (!randomizedPackEngineEnabled()) return;
  for (const policy of RANDOMIZED_PACK_POLICIES) {
    await publishRandomizedPackVersion(policy);
  }
  revalidateStorefront();
  revalidateAdmin();
}

async function releaseExpiredRandomizedPackReservations() {
  if (!randomizedPackEngineEnabled()) return false;
  const timestamp = nowIso();
  const transaction = await getDbClient().transaction("write");
  try {
    const expired = await expireRandomizedPackReservations(transaction, { expiredAt: timestamp });
    await transaction.commit();
    return expired > 0;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function resolveRandomizedProductDisclosure(
  product: ProductRecord,
): Promise<RandomizedProductDisclosure> {
  if (!product.isRandomized) {
    return {
      isRandomized: false,
      isReady: true,
      totalProbabilityBps: 0,
      outcomes: [],
    };
  }

  if (randomizedPackEngineEnabled()) {
    const releasedExpiredReservations = await releaseExpiredRandomizedPackReservations();
    if (releasedExpiredReservations) {
      await rebuildAllRandomizedPackVersions();
    }
    const versionRow = await queryOne(
      `select * from randomized_pack_versions
       where pack_product_id = ? and status = 'published'
       order by version desc limit 1`,
      [product.id],
    );
    if (versionRow) {
      const rows = await queryMany(
        `select randomized_pack_outcomes.*, products.*
         from randomized_pack_outcomes
         inner join products on products.id = randomized_pack_outcomes.outcome_product_id
         where randomized_pack_outcomes.version_id = ?
           and products.archived = 0
           and products.status = 'active'
         order by randomized_pack_outcomes.ordinal asc`,
        [String(versionRow.id)],
      );
      const outcomes = rows.map((row) => ({
        product: normalizeProduct(row),
        probabilityBps: Number(row.probability_bps),
        priceSnapshot: Number(row.price_snapshot),
      }));
      const totalProbabilityBps = outcomes.reduce(
        (sum, outcome) => sum + outcome.probabilityBps,
        0,
      );
      return {
        isRandomized: true,
        isReady: outcomes.length >= 2 && totalProbabilityBps === 10_000,
        totalProbabilityBps,
        outcomes,
        versionId: String(versionRow.id),
        version: Number(versionRow.version),
        publishedAt: versionRow.published_at ? String(versionRow.published_at) : null,
        expectedValue: Number(versionRow.expected_value),
        bigWinProbabilityBps: Number(versionRow.big_win_probability_bps),
      };
    }
  }

  const totalProbabilityBps = product.randomizedOutcomes.reduce(
    (total, outcome) => total + outcome.probabilityBps,
    0,
  );

  if (!hasValidRandomizedProductOdds(product)) {
    return {
      isRandomized: true,
      isReady: false,
      totalProbabilityBps,
      outcomes: [],
    };
  }

  const outcomeIds = product.randomizedOutcomes.map((outcome) => outcome.productId);
  const placeholders = outcomeIds.map(() => "?").join(", ");
  const rows = await queryMany(
    `select * from products
     where id in (${placeholders})
       and archived = 0
       and status = 'active'
       and stock > 0`,
    outcomeIds,
  );
  const productsById = new Map(
    rows.map((row) => {
      const outcomeProduct = normalizeProduct(row);
      return [outcomeProduct.id, outcomeProduct];
    }),
  );
  const outcomes = product.randomizedOutcomes.flatMap((outcome) => {
    const outcomeProduct = productsById.get(outcome.productId);
    return outcomeProduct
      ? [{
          product: outcomeProduct,
          probabilityBps: outcome.probabilityBps,
          priceSnapshot: outcomeProduct.price,
        }]
      : [];
  });

  return {
    isRandomized: true,
    isReady: outcomes.length === product.randomizedOutcomes.length,
    totalProbabilityBps,
    outcomes,
  };
}

export async function getRandomizedProductDisclosure(productId: string) {
  await ensureDatabase();
  const row = await queryOne(
    "select * from products where id = ? and archived = 0 and status = 'active' limit 1",
    [productId],
  );

  if (!row) {
    return null;
  }

  return resolveRandomizedProductDisclosure(normalizeProduct(row));
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

  if (input.telegramUsername?.trim() && !isValidTelegramUsername(telegramUsername)) {
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
  telegramUsername?: string | null;
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
  const telegramUsername = input.telegramUsername?.trim()
    ? normalizeTelegramUsername(input.telegramUsername)
    : normalizeTelegramUsername(`@${username}`);
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
      input.telegramVerifiedAt ? 1 : 0,
      input.telegramVerifiedAt ?? null,
      input.telegramLinkedAt ?? input.telegramVerifiedAt ?? null,
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
      profiles.withdrawal_wallet, profiles.payment_phone, profiles.gate2_first_name, profiles.gate2_last_name, profiles.gate2_phone, profiles.gate2_details_updated_at, profiles.verified
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
      profiles.withdrawal_wallet, profiles.payment_phone, profiles.gate2_first_name, profiles.gate2_last_name, profiles.gate2_phone, profiles.gate2_details_updated_at, profiles.verified, sessions.expires_at
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

export async function requireKycVerified(userId: string, message: string) {
  await ensureDatabase();
  const user = await getUserById(userId);

  if (!user) {
    throw new Error("User not found.");
  }

  if (!userHasKycAccess(user)) {
    throw new KycVerificationRequiredError(message);
  }

  return user;
}

function normalizeKycName(value: unknown, label: string) {
  const next = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const normalized = next.toLowerCase();
  const blockedPlaceholders = new Set(["admin", "test", "username", "user", "rebohrome"]);
  if (!next) {
    throw new Error(
      label === "First name"
        ? "Please enter your legal first name."
        : "Please enter your legal last name.",
    );
  }
  if (next.length < 2 || next.length > 80) {
    throw new Error(`${label} must be 2-80 characters.`);
  }
  if (!/^[\p{L}\s'-]+$/u.test(next)) {
    throw new Error(`${label} can contain only letters, spaces, hyphen, and apostrophe.`);
  }
  if (blockedPlaceholders.has(normalized)) {
    throw new Error(`${label} must be your real legal name, not a placeholder.`);
  }
  return next;
}

function normalizeIsoCountry(value: unknown, label: string) {
  const next = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(next)) {
    throw new Error(`${label} must be a valid ISO country code.`);
  }
  return next;
}

function normalizeKycDateOfBirth(value: unknown) {
  const next = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) {
    throw new Error("Date of birth must be a valid date.");
  }
  const date = new Date(`${next}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== next) {
    throw new Error("Date of birth must be a valid date.");
  }
  const now = new Date();
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - date.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < date.getUTCDate())) {
    age -= 1;
  }
  if (age < 18) {
    throw new Error("You must be at least 18 years old to complete verification.");
  }
  return next;
}

function normalizeKycEmail(value: unknown) {
  const email = normalizeEmail(typeof value === "string" ? value : "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  return email;
}

function normalizeKycOptionalText(value: unknown, maxLength = 160) {
  const next = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!next) {
    return null;
  }
  if (next.length > maxLength) {
    throw new Error("KYC profile field is too long.");
  }
  return next;
}

function normalizeKycPhone(value: unknown) {
  const next = normalizeKycOptionalText(value, 32);
  if (!next) {
    return null;
  }
  if (!/^\+?[0-9\s().-]{7,32}$/.test(next)) {
    throw new Error("Enter a valid phone number.");
  }
  return next;
}

function normalizeGate2Phone(value: unknown) {
  const raw = typeof value === "string" ? value : "";
  const digits = raw.replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(digits)) {
    throw new Error("Gate #2 phone must contain 8-15 digits.");
  }
  return digits;
}

function normalizeGate2Name(value: unknown, label: string, username?: string | null) {
  const next = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const lower = next.toLowerCase();
  const normalizedUsername = (username ?? "").trim().toLowerCase();

  if (next.length < 2 || next.length > 80) {
    throw new Error(`${label} must be 2-80 characters.`);
  }

  if (!/^[\p{L}\s'-]+$/u.test(next)) {
    throw new Error(`${label} may contain letters, spaces, hyphens, and apostrophes only.`);
  }

  if (["admin", "test", "rebohrome"].includes(lower)) {
    throw new Error(`${label} must be your real legal name.`);
  }

  if (normalizedUsername && lower === normalizedUsername && !/^[\p{L}]+(?:[\s'-][\p{L}]+)+$/u.test(next)) {
    throw new Error(`${label} must not be your account username.`);
  }

  return next;
}

function normalizeOptionalGate2Details(input: {
  firstName: unknown;
  lastName: unknown;
  phone: unknown;
  username?: string | null;
}) {
  const rawFirstName = normalizeEditableOptionalString(input.firstName);
  const rawLastName = normalizeEditableOptionalString(input.lastName);
  const rawPhone = normalizeEditableOptionalString(input.phone);

  if (!rawFirstName && !rawLastName && !rawPhone) {
    return {
      firstName: null,
      lastName: null,
      phone: null,
    };
  }

  return {
    firstName: normalizeGate2Name(rawFirstName, "Gate #2 first name", input.username),
    lastName: normalizeGate2Name(rawLastName, "Gate #2 last name", input.username),
    phone: normalizeGate2Phone(rawPhone),
  };
}

function buildKycFullAddress(profile: UserKycProfileRecord) {
  const parts = [
    profile.addressLine1,
    profile.addressLine2,
    profile.city,
    profile.state,
    profile.postalCode,
    profile.countryOfResidence,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export async function getUserKycProfile(userId: string) {
  await ensureDatabase();
  const row = await queryOne(
    "select * from user_kyc_profiles where user_id = ? limit 1",
    [userId],
  );
  return row ? normalizeUserKycProfile(row) : null;
}

export async function upsertUserKycProfile(input: {
  userId: string;
  firstName: unknown;
  lastName: unknown;
  dateOfBirth: unknown;
  countryOfResidence: unknown;
  documentCountry: unknown;
  email: unknown;
  phone?: unknown;
  addressLine1?: unknown;
  addressLine2?: unknown;
  city?: unknown;
  postalCode?: unknown;
  state?: unknown;
  auditMeta?: {
    ipAddress: string;
    country: string;
    userAgent: string;
    language: string;
    route: string;
    timestamp: string;
  };
}) {
  await ensureDatabase();
  await requireDocumentAcceptanceForUser(input.userId);
  const user = await getUserById(input.userId);
  if (!user) {
    throw new Error("User not found.");
  }
  if (userHasKycAccess(user)) {
    throw new Error("KYC details cannot be edited after verification.");
  }
  if (["submitted", "review"].includes(user.kycStatus)) {
    throw new Error("KYC details cannot be edited while verification is in review.");
  }

  const timestamp = nowIso();
  const existing = await getUserKycProfile(input.userId);
  const profileId = existing?.id ?? randomUUID();
  const values = {
    firstName: normalizeKycName(input.firstName, "First name"),
    lastName: normalizeKycName(input.lastName, "Last name"),
    dateOfBirth: normalizeKycDateOfBirth(input.dateOfBirth),
    countryOfResidence: normalizeIsoCountry(input.countryOfResidence, "Country of residence"),
    documentCountry: normalizeIsoCountry(input.documentCountry, "Document country"),
    email: normalizeKycEmail(input.email),
    phone: normalizeKycPhone(input.phone),
    addressLine1: normalizeKycOptionalText(input.addressLine1),
    addressLine2: normalizeKycOptionalText(input.addressLine2),
    city: normalizeKycOptionalText(input.city, 80),
    postalCode: normalizeKycOptionalText(input.postalCode, 32),
    state: normalizeKycOptionalText(input.state, 80),
  };

  await execute(
    `insert into user_kyc_profiles (
      id, user_id, first_name, last_name, date_of_birth, country_of_residence,
      document_country, email, phone, address_line1, address_line2, city,
      postal_code, state, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(user_id) do update set
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      date_of_birth = excluded.date_of_birth,
      country_of_residence = excluded.country_of_residence,
      document_country = excluded.document_country,
      email = excluded.email,
      phone = excluded.phone,
      address_line1 = excluded.address_line1,
      address_line2 = excluded.address_line2,
      city = excluded.city,
      postal_code = excluded.postal_code,
      state = excluded.state,
      updated_at = excluded.updated_at`,
    [
      profileId,
      input.userId,
      values.firstName,
      values.lastName,
      values.dateOfBirth,
      values.countryOfResidence,
      values.documentCountry,
      values.email,
      values.phone,
      values.addressLine1,
      values.addressLine2,
      values.city,
      values.postalCode,
      values.state,
      existing?.createdAt ?? timestamp,
      timestamp,
    ],
  );

  if (input.auditMeta) {
    await insertSecurityAuditEvent({
      eventType: existing ? "kyc_profile_updated" : "kyc_profile_created",
      userId: user.id,
      username: user.username,
      telegramUsername: user.telegramUsername,
      role: user.role,
      ...input.auditMeta,
    });
  }

  return getUserKycProfile(input.userId);
}

export async function createVeriffKycSessionForUser(input: {
  userId: string;
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  route: string;
  timestamp: string;
}) {
  await ensureDatabase();
  await requireDocumentAcceptanceForUser(input.userId);
  const user = await getUserById(input.userId);

  if (!user) {
    throw new Error("User not found.");
  }

  if (userHasKycAccess(user)) {
    return {
      alreadyVerified: true as const,
      verificationUrl: null,
      sessionId: user.veriffSessionId,
      status: user.kycStatus,
    };
  }

  const kycProfile = await getUserKycProfile(user.id);
  if (!kycProfile) {
    throw new Error("Please enter your verification details before starting KYC.");
  }

  const session = await createVeriffSession({
    userId: user.id,
    firstName: kycProfile.firstName,
    lastName: kycProfile.lastName,
    dateOfBirth: kycProfile.dateOfBirth,
    documentCountry: kycProfile.documentCountry,
    email: kycProfile.email,
    phone: kycProfile.phone,
    address: {
      fullAddress: buildKycFullAddress(kycProfile),
      city: kycProfile.city,
      postcode: kycProfile.postalCode,
      state: kycProfile.state,
    },
  });
  const timestamp = input.timestamp || nowIso();

  await execute(
    `update users set
      kyc_status = 'session_created',
      kyc_verified = 0,
      kyc_provider = 'veriff',
      veriff_session_id = ?,
      veriff_verification_id = ?,
      veriff_status = ?,
      kyc_started_at = coalesce(kyc_started_at, ?),
      updated_at = ?
     where id = ?`,
    [
      session.sessionId,
      session.verificationId,
      session.status,
      timestamp,
      timestamp,
      user.id,
    ],
  );

  await insertSecurityAuditEvent({
    eventType: "kyc_session_created",
    userId: user.id,
    username: user.username,
    telegramUsername: user.telegramUsername,
    role: user.role,
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp: input.timestamp,
  });
  await insertSecurityAuditEvent({
    eventType: "verification_started",
    userId: user.id,
    username: user.username,
    telegramUsername: user.telegramUsername,
    role: user.role,
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp: input.timestamp,
  });

  revalidatePrivate(user.id);

  return {
    alreadyVerified: false as const,
    verificationUrl: session.verificationUrl,
    sessionId: session.sessionId,
    status: "session_created" as const,
  };
}

async function getUserRowByVeriffIdentifiers(input: {
  userId?: string | null;
  sessionId?: string | null;
  verificationId?: string | null;
}) {
  if (input.userId) {
    const row = await getUserRowById(input.userId);
    if (row) {
      return row;
    }
  }

  if (!input.sessionId && !input.verificationId) {
    return null;
  }

  const sessionId = input.sessionId ?? null;
  const verificationId = input.verificationId ?? null;

  return queryOne(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.telegram_chat_id, profiles.telegram_verified, profiles.telegram_verified_at,
      profiles.withdrawal_wallet, profiles.payment_phone, profiles.gate2_first_name, profiles.gate2_last_name, profiles.gate2_phone, profiles.gate2_details_updated_at, profiles.verified
     from users
     inner join profiles on profiles.user_id = users.id
     where (? is not null and users.veriff_session_id = ?)
        or (? is not null and users.veriff_verification_id = ?)
     limit 1`,
    [
      sessionId,
      sessionId,
      verificationId,
      verificationId,
    ],
  );
}

async function applyVeriffDecisionToUser(input: {
  userId?: string | null;
  sessionId?: string | null;
  verificationId?: string | null;
  payload: unknown;
  source: "webhook" | "manual_sync" | "user_sync";
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  route: string;
  timestamp: string;
}) {
  const row = await getUserRowByVeriffIdentifiers({
    userId: input.userId,
    sessionId: input.sessionId,
    verificationId: input.verificationId,
  });

  if (!row) {
    throw new Error("Veriff user was not found.");
  }

  const user = normalizeUser(row);
  const normalized = normalizeVeriffStatus(input.payload);
  const timestamp = input.timestamp || nowIso();
  const sessionId = input.sessionId ?? null;
  const verificationId = input.verificationId ?? null;
  const knownIdentifiers = new Set(
    [
      user.veriffSessionId,
      user.veriffVerificationId,
    ].filter(Boolean),
  );

  if (input.userId && input.userId !== user.id) {
    throw new Error("Veriff webhook user mismatch.");
  }

  if (sessionId && knownIdentifiers.size > 0 && !knownIdentifiers.has(sessionId)) {
    throw new Error("Veriff webhook session mismatch.");
  }

  if (verificationId && knownIdentifiers.size > 0 && !knownIdentifiers.has(verificationId)) {
    throw new Error("Veriff webhook verification mismatch.");
  }

  const currentTerminalStatus = [
    "approved",
    "manual_approved",
    "declined",
    "manual_declined",
    "manual_rejected",
    "expired",
    "abandoned",
  ].includes(user.kycStatus);
  const nextStatus =
    normalized.decision || !currentTerminalStatus
      ? normalized.internalStatus
      : user.kycStatus;
  const nextVerified =
    normalized.decision || !currentTerminalStatus
      ? normalized.verified
      : isKycVerified(user);

  console.info("[KYC_VERIFF] decision_normalized", {
    userId: user.id,
    source: input.source,
    sessionId,
    verificationId,
    providerStatus: normalized.status,
    decision: normalized.decision,
    nextStatus,
    verified: nextVerified,
  });

  await execute(
    `update users set
      kyc_status = ?,
      kyc_verified = ?,
      kyc_provider = 'veriff',
      veriff_session_id = coalesce(?, veriff_session_id),
      veriff_verification_id = coalesce(?, veriff_verification_id),
      veriff_status = ?,
      veriff_decision = ?,
      veriff_reason = ?,
      kyc_submitted_at = case when ? in ('submitted', 'review') then coalesce(kyc_submitted_at, ?) else kyc_submitted_at end,
      kyc_verified_at = case when ? = 1 then ? else kyc_verified_at end,
      kyc_declined_at = case when ? in ('declined', 'expired', 'abandoned') then ? else kyc_declined_at end,
      kyc_last_webhook_at = ?,
      updated_at = ?
     where id = ?`,
    [
      nextStatus,
      nextVerified ? 1 : 0,
      sessionId,
      verificationId,
      normalized.status,
      normalized.decision,
      normalized.reason,
      nextStatus,
      timestamp,
      nextVerified ? 1 : 0,
      timestamp,
      nextStatus,
      timestamp,
      timestamp,
      timestamp,
      user.id,
    ],
  );

  await insertSecurityAuditEvent({
    eventType:
      input.source === "webhook"
        ? "kyc_webhook_received"
        : input.source === "manual_sync"
          ? "kyc_manual_veriff_sync"
          : "kyc_user_veriff_sync",
    userId: user.id,
    username: user.username,
    telegramUsername: user.telegramUsername,
    role: user.role,
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp,
  });

  const statusEvent =
    nextVerified
      ? "kyc_approved"
      : nextStatus === "declined" || nextStatus === "manual_rejected"
        ? "kyc_declined"
        : nextStatus === "expired"
          ? "kyc_expired"
          : nextStatus === "abandoned"
            ? "verification_abandoned"
            : nextStatus === "review" || nextStatus === "submitted"
              ? "kyc_review"
              : null;

  if (nextVerified && normalized.decision === "approved" && input.source === "webhook") {
    await insertSecurityAuditEvent({
      eventType: "veriff_webhook_approved",
      userId: user.id,
      username: user.username,
      telegramUsername: user.telegramUsername,
      role: user.role,
      ipAddress: input.ipAddress,
      country: input.country,
      userAgent: input.userAgent,
      language: input.language,
      route: input.route,
      timestamp,
    });
  }

  if (statusEvent) {
    await insertSecurityAuditEvent({
      eventType: statusEvent,
      userId: user.id,
      username: user.username,
      telegramUsername: user.telegramUsername,
      role: user.role,
      ipAddress: input.ipAddress,
      country: input.country,
      userAgent: input.userAgent,
      language: input.language,
      route: input.route,
      timestamp,
    });
  }

  revalidatePrivate(user.id);
  revalidateAdmin();

  return {
    ok: true,
    userId: user.id,
    status: nextStatus,
    verified: nextVerified,
    decision: normalized.decision,
  };
}

export async function processVeriffWebhook(input: {
  rawBody: string;
  signature: string | null;
  authClient: string | null;
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  route: string;
  timestamp: string;
}) {
  await ensureDatabase();

  if (!getVeriffWebhookAuthClientIsValid(input.authClient)) {
    console.warn("[VERIFF_WEBHOOK] invalid auth client");
    throw new Error("Invalid Veriff auth client.");
  }

  if (!verifyVeriffWebhookSignature(input.rawBody, input.signature)) {
    console.warn("[VERIFF_WEBHOOK] invalid signature");
    throw new Error("Invalid Veriff webhook signature.");
  }

  const payload = JSON.parse(input.rawBody) as Record<string, unknown>;
  const fields = extractVeriffWebhookFields(payload);
  const userId = extractVeriffUserId(fields.vendorData);

  console.info("[VERIFF_WEBHOOK] received", {
    eventType: fields.eventType,
    hasVendorData: Boolean(fields.vendorData),
    hasSessionId: Boolean(fields.sessionId),
    userId,
  });

  return applyVeriffDecisionToUser({
    userId,
    sessionId: fields.sessionId,
    verificationId: fields.verificationId,
    payload,
    source: "webhook",
    ...input,
  });
}

export async function syncCurrentUserVeriffStatus(input: {
  userId: string;
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  route: string;
  timestamp: string;
}) {
  await ensureDatabase();
  const user = await getUserById(input.userId);

  if (!user) {
    throw new Error("User not found.");
  }

  if (!user.veriffSessionId) {
    throw new Error("No Veriff session is linked to this account.");
  }

  const payload = await fetchVeriffSessionStatus(user.veriffSessionId);
  const fields = extractVeriffWebhookFields(payload);

  return applyVeriffDecisionToUser({
    userId: user.id,
    sessionId: fields.sessionId ?? user.veriffSessionId,
    verificationId: fields.verificationId ?? user.veriffVerificationId,
    payload,
    source: "user_sync",
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp: input.timestamp,
  });
}

export async function logKycVerificationResultViewed(input: {
  userId: string;
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  route: string;
  timestamp: string;
}) {
  await ensureDatabase();
  const user = await getUserById(input.userId);

  if (!user) {
    return;
  }

  await insertSecurityAuditEvent({
    eventType: "callback_viewed",
    userId: user.id,
    username: user.username,
    telegramUsername: user.telegramUsername,
    role: user.role,
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp: input.timestamp,
  });
  await insertSecurityAuditEvent({
    eventType: "verification_result_viewed",
    userId: user.id,
    username: user.username,
    telegramUsername: user.telegramUsername,
    role: user.role,
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp: input.timestamp,
  });
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

export async function updateUserGate2PaymentDetails(input: {
  userId: string;
  firstName: unknown;
  lastName: unknown;
  phone: unknown;
  ipAddress?: string;
  country?: string;
  userAgent?: string;
  language?: string;
  route?: string;
  timestamp?: string;
}) {
  await ensureDatabase();
  const user = await getUserById(input.userId);

  if (!user) {
    throw new Error("User not found.");
  }

  const firstName = normalizeGate2Name(input.firstName, "First name", user.username);
  const lastName = normalizeGate2Name(input.lastName, "Last name", user.username);
  const phone = normalizeGate2Phone(input.phone);
  const timestamp = input.timestamp || nowIso();
  const eventType = user.gate2DetailsUpdatedAt ? "gate2_details_updated" : "gate2_details_created";

  await execute(
    `update profiles set
      gate2_first_name = ?,
      gate2_last_name = ?,
      gate2_phone = ?,
      payment_phone = ?,
      gate2_details_updated_at = ?,
      updated_at = ?
     where user_id = ?`,
    [firstName, lastName, phone, phone, timestamp, timestamp, input.userId],
  );

  await insertSecurityAuditEvent({
    eventType,
    userId: user.id,
    username: user.username,
    telegramUsername: user.telegramUsername,
    role: user.role,
    ipAddress: input.ipAddress ?? "unknown",
    country: input.country ?? "unknown",
    userAgent: input.userAgent ?? "unknown",
    language: input.language ?? "unknown",
    route: input.route ?? "/dashboard/settings",
    timestamp,
  });

  revalidatePrivate(input.userId);
}

export async function updateUserPaymentPhone(userId: string, paymentPhone: unknown) {
  const user = await getUserById(userId);
  const profile = user ? await getUserKycProfile(user.id) : null;
  await updateUserGate2PaymentDetails({
    userId,
    firstName: user?.gate2FirstName ?? profile?.firstName ?? "",
    lastName: user?.gate2LastName ?? profile?.lastName ?? "",
    phone: paymentPhone,
  });
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
      profiles.withdrawal_wallet, profiles.payment_phone, profiles.gate2_first_name, profiles.gate2_last_name, profiles.gate2_phone, profiles.gate2_details_updated_at, profiles.verified
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
  return withPerf("query=getDashboardStats", async () => {
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
  });
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

export async function getUserOrders(userId: string, limit?: number) {
  return withPerf("query=getUserOrders", async () => {
  await ensureDatabase();
  const limitClause = limit ? " limit ?" : "";
  const args: SqlValue[] = limit ? [userId, limit] : [userId];
  const rows = await queryMany(
    `select
      orders.*,
      coalesce(sum(order_items.quantity), 0) as item_count
     from orders
     left join order_items on order_items.order_id = orders.id
     where orders.user_id = ?
     group by orders.id
     order by orders.created_at desc${limitClause}`,
    args,
  );

  return rows.map((row) => normalizeOrder(row));
  });
}

export async function getUserInventory(userId: string, limit?: number) {
  return withPerf("query=getUserInventory", async () => {
  await ensureDatabase();
  const limitClause = limit ? " limit ?" : "";
  const args: SqlValue[] = limit ? [userId, limit] : [userId];
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
     order by owned_cards.acquired_at desc${limitClause}`,
    args,
  );

  return rows.map((row) => ({
    inventoryId: String(row.inventory_id),
    orderId: String(row.order_id),
    quantity: Number(row.quantity),
    acquiredAt: String(row.acquired_at),
    product: normalizeProduct(row),
  }));
  });
}

export async function getUserTransactions(userId: string, limit = 12) {
  return withPerf("query=getUserTransactions", async () => {
  await ensureDatabase();
  const rows = await queryMany(
    "select * from transactions where user_id = ? order by created_at desc limit ?",
    [userId, limit],
  );
  return rows.map((row) => normalizeTransaction(row));
  });
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
  return withPerf("query=getUserWithdrawals", async () => {
  await ensureDatabase();
  const rows = await queryMany(
    "select * from withdrawal_requests where user_id = ? order by created_at desc limit ?",
    [userId, limit],
  );
  return rows.map((row) => normalizeWithdrawal(row));
  });
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
  await requireDocumentAcceptanceForUser(input.userId);

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
  void input;
  await ensureDatabase();
  throw new Error("Withdrawals are currently disabled.");
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

  if (!userHasKycAccess(account.user)) {
    throw new KycVerificationRequiredError(
      "Please complete verification before making a card payment.",
    );
  }

  const existingSession = await getActivePaymentSession(input.userId, "purchase");
  if (existingSession) {
    return {
      sessionId: existingSession.id,
      paymentUrl: existingSession.paymentUrl,
      embedUrl: null,
      useEmbed: false,
      redirectPath:
        existingSession.provider === "TransVoucher"
          ? `/payment/transvoucher?session=${encodeURIComponent(existingSession.id)}`
          : existingSession.paymentUrl,
      activeSession: existingSession,
      reusedExistingSession: true,
    };
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
      "pending",
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
      null,
      null,
      "initializing",
      null,
      account.balance.available,
      timestamp,
      timestamp,
      null,
    ],
  );
  await insertCheckoutOrderItems({ orderId, items: input.items, productMap });
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
    providerStatus: "initializing",
    status: "attempting",
    referenceId: orderId,
    summary: "Preparing secure payment session",
    meta: {
      currency: input.currency,
      paymentMethod: input.paymentMethod,
      provider: "TransVoucher",
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
      "attempting",
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
      null,
      null,
      null,
      "initializing",
      null,
      timestamp,
      timestamp,
      expiresAt,
    ],
  );

  try {
    await reserveRandomizedOrderItems({
      orderId,
      userId: input.userId,
      expiresAt,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unable to reserve a card.";
    const failedAt = nowIso();
    await execute(
      "update orders set status = 'Declined', payment_state = 'failed', failure_reason = ?, updated_at = ? where id = ?",
      [reason, failedAt, orderId],
    );
    await execute(
      "update payment_sessions set status = 'failed', provider_status = 'reservation_failed', updated_at = ? where id = ?",
      [failedAt, sessionId],
    );
    await execute(
      "update transactions set status = 'failed', summary = 'Card reservation failed', last_error = ?, updated_at = ? where id = ?",
      [reason, failedAt, transactionId],
    );
    throw error;
  }

  let payment: Awaited<ReturnType<typeof createTransVoucherPayment>>;
  try {
    payment = await createTransVoucherPayment({
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
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Payment provider did not respond.";
    const failedAt = nowIso();
    await execute(
      `update orders set failure_reason = ?, provider_status = 'initialization_unknown',
        updated_at = ? where id = ? and payment_state = 'pending'`,
      [reason, failedAt, orderId],
    );
    await execute(
      `update payment_sessions set status = 'processing', provider_status = 'initialization_unknown',
        updated_at = ? where id = ? and status <> 'completed'`,
      [failedAt, sessionId],
    );
    await execute(
      `update transactions set status = 'processing', summary = 'Payment initialization requires reconciliation',
        last_error = ?, provider_status = 'initialization_unknown', updated_at = ?
        where id = ? and status <> 'completed'`,
      [reason, failedAt, transactionId],
    );
    throw error;
  }
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
    `update orders set payment_state = ?, transvoucher_transaction_id = ?,
      transvoucher_reference_id = ?, provider_status = ?, failure_reason = ?,
      updated_at = ? where id = ? and payment_state <> 'completed'`,
    [
      ["failed", "expired"].includes(initialTransactionStatus) ? "failed" : "pending",
      payment.transactionId,
      payment.referenceId,
      providerStatus || null,
      ["failed", "expired"].includes(initialTransactionStatus)
        ? "Unable to initialize TransVoucher payment."
        : null,
      timestamp,
      orderId,
    ],
  );

  await execute(
    `update transactions set transvoucher_transaction_id = ?,
      transvoucher_reference_id = ?, payment_url = ?, provider_status = ?,
      raw_provider_response = ?, status = ?, summary = ?, meta_json = ?, updated_at = ?
      where id = ? and status <> 'completed'`,
    [
      payment.transactionId,
      payment.referenceId,
      payment.paymentUrl,
      providerStatus || null,
      toJson(payment.raw),
      initialTransactionStatus,
      "Awaiting TransVoucher payment confirmation",
      toJson({
        currency: input.currency,
        paymentMethod: input.paymentMethod,
        provider: "TransVoucher",
        paymentReference,
        paymentSessionId: sessionId,
        telegramUsername: account.user.telegramUsername,
        items: input.items,
      }),
      timestamp,
      transactionId,
    ],
  );

  await execute(
    `update payment_sessions set status = ?, transvoucher_transaction_id = ?,
      transvoucher_reference_id = ?, payment_url = ?, provider_status = ?,
      raw_provider_response = ?, updated_at = ? where id = ? and status <> 'completed'`,
    [
      initialSessionStatus,
      payment.transactionId,
      payment.referenceId,
      payment.paymentUrl,
      providerStatus || null,
      toJson(payment.raw),
      timestamp,
      sessionId,
    ],
  );

  if (["failed", "expired"].includes(initialTransactionStatus)) {
    await releaseRandomizedOrderReservations(orderId, "payment_initialization_failed");
  }

  return {
    sessionId,
    paymentUrl: payment.paymentUrl,
    embedUrl: payment.embedUrl,
    useEmbed: payment.useEmbed && Boolean(payment.embedUrl),
    redirectPath: `/payment/transvoucher?session=${encodeURIComponent(sessionId)}`,
    activeSession: null,
    reusedExistingSession: false,
  };
}

export async function getActivePaymentSession(
  userId: string,
  type?: "deposit" | "purchase",
): Promise<ActivePaymentSessionRecord | null> {
  return withPerf("query=getActivePaymentSession", async () => {
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
  });
}

async function getActiveDepositPaymentSessionForProvider(
  userId: string,
  providerKey: PaymentProviderKey,
  providerName: Exclude<PaymentProviderName, "Internal Wallet">,
): Promise<ActivePaymentSessionRecord | null> {
  const cacheKey = `${userId}:${providerKey}`;
  const cachedSession = activeDepositSessionCache.get(cacheKey);
  if (cachedSession && cachedSession.cachedUntil > Date.now()) {
    return cachedSession.session;
  }

  const activeStatuses = ["created", "pending", "attempting", "processing"];
  const row = await queryOne(
    `select * from deposit_payment_sessions
     where user_id = ?
       and (provider_key = ? or payment_provider = ?)
       and status in (${activeStatuses.map(() => "?").join(", ")})
       and expires_at > ?
     limit 1`,
    [userId, providerKey, providerName, ...activeStatuses, nowIso()],
  );

  if (!row) {
    return null;
  }

  const session = normalizeActiveDepositSession(row);
  activeDepositSessionCache.set(cacheKey, {
    session,
    cachedUntil: Date.now() + 60_000,
  });
  return session;
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

export async function getWertGateCheckoutSession(input: {
  userId: string;
  sessionId: string;
}) {
  await ensureDatabase();

  const row = await queryOne(
    `select *
     from deposit_payment_sessions
     where id = ?
       and user_id = ?
       and provider_key = 'wert'
     limit 1`,
    [input.sessionId, input.userId],
  );

  if (!row) {
    return null;
  }

  let widgetOptions: WertWidgetOptions | null = null;
  if (row.raw_provider_response) {
    try {
      const parsed = JSON.parse(String(row.raw_provider_response)) as {
        widgetOptions?: WertWidgetOptions;
      };
      widgetOptions = parsed.widgetOptions ?? null;
    } catch {
      widgetOptions = null;
    }
  }

  return {
    session: normalizeActiveDepositSession(row),
    widgetOptions,
    contractAddress: row.contract_address ? String(row.contract_address) : null,
    contractOrderId: row.contract_order_id ? String(row.contract_order_id) : null,
    recipientWallet: row.recipient_wallet ? String(row.recipient_wallet) : null,
    nftDeliveryMode: row.nft_delivery_mode ? String(row.nft_delivery_mode) : null,
  };
}

export async function getCoinflowGateCheckoutSession(input: {
  userId: string;
  sessionId: string;
}) {
  await ensureDatabase();
  await ensureCoinflowDepositPaymentSessionColumns();
  const row = await queryOne(
    `select *
     from deposit_payment_sessions
     where id = ?
       and user_id = ?
       and provider_key = 'coinflow'
     limit 1`,
    [input.sessionId, input.userId],
  );

  if (!row) {
    return null;
  }

  return {
    session: normalizeActiveDepositSession(row),
    amountCents: Number(row.amount_cents ?? Math.round(Number(row.original_amount) * 100)),
    environment: row.provider_environment ? String(row.provider_environment) : "sandbox",
    checkoutEnv: row.provider_checkout_env ? String(row.provider_checkout_env) : "sandbox",
    credited: Boolean(row.balance_credited_at),
    providerPaymentId: row.provider_payment_id ? String(row.provider_payment_id) : null,
    webhookInfo: row.coinflow_webhook_info ? String(row.coinflow_webhook_info) : null,
  };
}

export async function createCoinflowCheckoutTokenForSession(input: {
  userId: string;
  sessionId: string;
}) {
  await ensureDatabase();
  await ensureCoinflowDepositPaymentSessionColumns();
  const row = await queryOne(
    `select deposit_payment_sessions.*, users.email as user_email, users.kyc_status as user_kyc_status
     from deposit_payment_sessions
     join users on users.id = deposit_payment_sessions.user_id
     where deposit_payment_sessions.id = ?
       and deposit_payment_sessions.user_id = ?
       and deposit_payment_sessions.provider_key = 'coinflow'
     limit 1`,
    [input.sessionId, input.userId],
  );

  if (!row) {
    throw new Error("Gate #4 session not found.");
  }

  const status = String(row.status);
  if (!["created", "pending", "attempting", "processing"].includes(status)) {
    throw new Error("Gate #4 session is no longer active.");
  }

  const sessionId = String(row.id);
  const userId = String(row.user_id);
  const localTransactionId = String(row.transaction_id ?? row.transvoucher_reference_id ?? row.id);
  const amount = Number(row.original_amount);
  const amountCents = Number(row.amount_cents ?? Math.round(amount * 100));
  const email = String(row.user_email ?? "");
  const idempotencyKey = String(row.idempotency_key ?? `coinflow_credit:${sessionId}`);

  if (!email) {
    throw new Error("Gate #4 requires an email address before payment.");
  }

  const token = await createCoinflowCheckoutToken({
    sessionId,
    userId,
    localTransactionId,
    idempotencyKey,
    amount,
    amountCents,
    currency: "USD",
    email,
    kycStatus: row.user_kyc_status ? String(row.user_kyc_status) : null,
  });
  const timestamp = nowIso();

  await execute(
    `update deposit_payment_sessions set
      provider_session_key = ?,
      provider_checkout_jwt = ?,
      provider_status = 'pending',
      raw_provider_response = ?,
      updated_at = ?
     where id = ?`,
    [
      token.sessionKey,
      token.checkoutJwtToken,
      toJson(token.raw),
      timestamp,
      sessionId,
    ],
  );

  const publicConfig = getCoinflowPublicConfig();
  const sessionEnvironment = String(row.provider_environment ?? publicConfig.serverEnv ?? "sandbox");

  if (sessionEnvironment !== publicConfig.serverEnv || publicConfig.env !== publicConfig.serverEnv) {
    console.error(`[COINFLOW_GATE4][${publicConfig.serverEnv}][card] config_environment_mismatch`, {
      sessionId,
      sessionEnvironment,
      frontendEnvironment: publicConfig.env,
    });
    throw new Error("Gate #4 checkout is not configured correctly.");
  }

  const webhookInfo = buildCoinflowWebhookInfo({
    sessionId,
    userId,
    localTransactionId,
    idempotencyKey,
    amount,
    amountCents,
    currency: "USD",
    email,
    kycStatus: row.user_kyc_status ? String(row.user_kyc_status) : null,
  });
  const chargebackProtectionData = buildCoinflowChargebackProtectionData({
    sessionId,
    userId,
    localTransactionId,
    idempotencyKey,
    amount,
    amountCents,
    currency: "USD",
    email,
    kycStatus: row.user_kyc_status ? String(row.user_kyc_status) : null,
  });

  return {
    session: {
      id: sessionId,
      amount,
      amountCents,
      currency: "USD" as const,
      status: "pending",
    },
    coinflow: {
      merchantId: publicConfig.merchantId,
      env: publicConfig.env,
      sessionKey: token.sessionKey,
      checkoutJwtToken: token.checkoutJwtToken,
      subtotal: {
        cents: amountCents,
        currency: "USD" as const,
      },
      email,
      settlementType: publicConfig.settlementType,
      webhookInfo,
      chargebackProtectionData,
      enableApplePay: publicConfig.enableApplePay,
      enableGooglePay: publicConfig.enableGooglePay,
      enableCard: publicConfig.enableCard,
      enableAch: publicConfig.enableAch,
      enableSepa: publicConfig.enableSepa,
      enableUkFasterPayments: publicConfig.enableUkFasterPayments,
      enablePix: publicConfig.enablePix,
    },
  };
}

export async function getCoinflowGateSessionStatus(input: {
  userId: string;
  sessionId: string;
}) {
  await ensureDatabase();
  await ensureCoinflowDepositPaymentSessionColumns();
  const row = await queryOne(
    `select *
     from deposit_payment_sessions
     where id = ?
       and user_id = ?
       and provider_key = 'coinflow'
     limit 1`,
    [input.sessionId, input.userId],
  );

  if (!row) {
    return null;
  }

  const providerStatus = String(row.provider_status ?? row.status ?? "pending");
  const normalized = normalizeCoinflowStatus(providerStatus);
  return {
    status: normalized,
    amount: Number(row.original_amount),
    currency: "USD" as const,
    environment: row.provider_environment ? String(row.provider_environment) : "sandbox",
    credited: Boolean(row.balance_credited_at),
    message: coinflowStatusMessage(normalized),
  };
}

function isTransVoucherFinalTransactionStatus(status: string | null | undefined) {
  return ["completed", "failed", "expired"].includes(String(status ?? ""));
}

function getPaymentStatusMessage(transaction: TransactionRecord | null) {
  if (!transaction) {
    return "Checking payment provider...";
  }

  if (transaction.status === "completed") {
    return transaction.kind === "deposit"
      ? "Payment confirmed. Your balance has been updated."
      : "Payment confirmed.";
  }

  if (transaction.status === "failed") {
    return "Payment was not completed. No funds were credited.";
  }

  if (transaction.status === "expired") {
    return "Payment session expired. No funds were credited.";
  }

  return "Checking payment provider...";
}

async function getPaymentSessionTransaction(input: {
  userId: string;
  sessionId?: string | null;
  type?: "deposit" | "purchase";
}) {
  await ensureDatabase();

  if (input.sessionId) {
    const depositRow =
      !input.type || input.type === "deposit"
        ? await queryOne(
            "select * from deposit_payment_sessions where id = ? and user_id = ? limit 1",
            [input.sessionId, input.userId],
          )
        : null;
    if (depositRow) {
      const session = normalizeActiveDepositSession(depositRow);
      const transactionRow = session.transactionId
        ? await queryOne("select * from transactions where id = ? and user_id = ? limit 1", [
            session.transactionId,
            input.userId,
          ])
        : null;
      return {
        session,
        transaction: transactionRow ? normalizeTransaction(transactionRow) : null,
      };
    }

    const checkoutRow =
      !input.type || input.type === "purchase"
        ? await queryOne(
            "select * from payment_sessions where id = ? and user_id = ? limit 1",
            [input.sessionId, input.userId],
          )
        : null;
    if (checkoutRow) {
      const session = normalizeActiveCheckoutSession(checkoutRow);
      const transactionRow = session.transactionId
        ? await queryOne("select * from transactions where id = ? and user_id = ? limit 1", [
            session.transactionId,
            input.userId,
          ])
        : null;
      return {
        session,
        transaction: transactionRow ? normalizeTransaction(transactionRow) : null,
      };
    }

    return { session: null, transaction: null };
  }

  const session = await getActivePaymentSession(input.userId, input.type);
  if (!session?.transactionId) {
    return { session, transaction: null };
  }

  const transactionRow = await queryOne(
    "select * from transactions where id = ? and user_id = ? limit 1",
    [session.transactionId, input.userId],
  );

  return {
    session,
    transaction: transactionRow ? normalizeTransaction(transactionRow) : null,
  };
}

async function maybeRefreshTransVoucherTransactionStatus(input: {
  transaction: TransactionRecord | null;
  userId: string;
  minIntervalMs?: number;
}) {
  if (!input.transaction) {
    return null;
  }

  if (
    input.transaction.paymentProvider === "Wert.io" &&
    !isTransVoucherFinalTransactionStatus(input.transaction.status)
  ) {
    const minIntervalMs = input.minIntervalMs ?? 5_000;
    const lastCheckedMs = input.transaction.providerCheckedAt
      ? new Date(input.transaction.providerCheckedAt).getTime()
      : 0;

    if (
      Number.isFinite(lastCheckedMs) &&
      lastCheckedMs > 0 &&
      Date.now() - lastCheckedMs < minIntervalMs
    ) {
      return input.transaction;
    }

    try {
      await syncWertOrderStatus({
        clickId: input.transaction.transvoucherReferenceId ?? input.transaction.id,
        wertOrderId: input.transaction.transvoucherTransactionId,
        source: "status_poll",
      });
    } catch (error) {
      console.warn("Wert status polling skipped.", {
        transactionId: input.transaction.id,
        error: error instanceof Error ? error.message : "Unknown Wert polling error.",
      });
      return input.transaction;
    }
    const updated = await getTransactionById(input.transaction.id, input.userId);
    return updated ?? input.transaction;
  }

  if (
    !["TransVoucher", "Cleffo"].includes(String(input.transaction.paymentProvider)) ||
    !input.transaction.transvoucherTransactionId ||
    isTransVoucherFinalTransactionStatus(input.transaction.status)
  ) {
    return input.transaction;
  }

  const minIntervalMs = input.minIntervalMs ?? 3_000;
  const lastCheckedMs = input.transaction.providerCheckedAt
    ? new Date(input.transaction.providerCheckedAt).getTime()
    : 0;

  if (
    Number.isFinite(lastCheckedMs) &&
    lastCheckedMs > 0 &&
    Date.now() - lastCheckedMs < minIntervalMs
  ) {
    return input.transaction;
  }

  return input.transaction.paymentProvider === "Cleffo"
    ? refreshCleffoTransactionStatus(input.transaction.id, input.userId)
    : refreshTransVoucherTransactionStatus(input.transaction.id, input.userId);
}

async function buildPaymentSessionStatusResponse(input: {
  userId: string;
  session: ActivePaymentSessionRecord | null;
  transaction: TransactionRecord | null;
}) {
  const balance = await getBalanceByUserId(input.userId);
  const normalizedStatus = input.transaction
    ? normalizeProviderStatus(input.transaction.providerStatus ?? input.transaction.status)
    : input.session?.status ?? null;

  return {
    ok: true as const,
    sessionId: input.session?.id ?? null,
    status: normalizedStatus,
    transactionStatus: input.transaction?.status ?? null,
    depositStatus:
      input.transaction?.kind === "deposit" ? input.transaction.status : null,
    kind: input.transaction?.kind ?? input.session?.type ?? null,
    amount: input.session?.amount ?? input.transaction?.amount ?? null,
    currency: input.session?.currency ?? input.transaction?.displayCurrency ?? "USD",
    provider: input.session?.provider ?? input.transaction?.paymentProvider ?? null,
    lastCheckedAt: input.transaction?.providerCheckedAt ?? null,
    balanceCredited: Boolean(input.transaction?.creditedAt),
    availableBalance: balance?.available ?? null,
    message: getPaymentStatusMessage(input.transaction),
    final: input.transaction
      ? isTransVoucherFinalTransactionStatus(input.transaction.status)
      : false,
  };
}

export async function checkActivePaymentSessionStatus(input: {
  userId: string;
  type?: "deposit" | "purchase";
  sessionId?: string;
}) {
  const current = await getPaymentSessionTransaction(input);
  const transaction = await maybeRefreshTransVoucherTransactionStatus({
    transaction: current.transaction,
    userId: input.userId,
  });
  const next = await getPaymentSessionTransaction({
    userId: input.userId,
    sessionId: current.session?.id ?? input.sessionId,
    type: current.session?.type ?? input.type,
  });

  return buildPaymentSessionStatusResponse({
    userId: input.userId,
    session: next.session ?? current.session,
    transaction: next.transaction ?? transaction,
  });
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
  if (input.type === "purchase" && row.order_id) {
    await releaseRandomizedOrderReservations(
      String(row.order_id),
      "payment_session_canceled",
    );
  }
  revalidatePrivate(input.userId);
  return { ok: true };
}

export async function createDepositPaymentSession(input: {
  userId: string;
  amount: number;
  paymentMethod: Exclude<PaymentMethodName, "Archive Balance">;
  provider?: Exclude<PaymentProviderName, "Internal Wallet">;
  gateNumber?: number;
  currency: SupportedCurrency;
}) {
  await ensureDatabase();
  await requireDocumentAcceptanceForUser(input.userId);

  if (input.amount <= 0) {
    throw new Error("Deposit amount must be greater than zero.");
  }

  if (input.paymentMethod === "Crypto") {
    throw new Error("Crypto deposits are not available in hosted gate flows.");
  }

  const requestedProviderName = getRequestedDepositProviderName({
    provider: input.provider ?? null,
    gateNumber: input.gateNumber ?? null,
  });
  const requestedProviderKey = getRequestedDepositProviderKey({
    provider: input.provider ?? null,
    gateNumber: input.gateNumber ?? null,
  });
  const existingSession = requestedProviderKey
    ? await getActiveDepositPaymentSessionForProvider(
        input.userId,
        requestedProviderKey,
        requestedProviderName ?? input.provider ?? "TransVoucher",
      )
    : await getActivePaymentSession(input.userId, "deposit");

  if (existingSession && requestedProviderName && existingSession.provider === requestedProviderName) {
    return {
      sessionId: existingSession.id,
      paymentUrl:
        existingSession.provider === "Wert.io"
          ? `/checkout/gate-3/${encodeURIComponent(existingSession.id)}`
          : existingSession.provider === "Coinflow"
            ? `/checkout/gate-4/${encodeURIComponent(existingSession.id)}`
          : existingSession.paymentUrl,
      embedUrl: null,
      useEmbed: false,
      wertWidgetOptions: null,
      redirectPath:
        existingSession.provider === "TransVoucher"
          ? `/payment/deposit/transvoucher?session=${encodeURIComponent(existingSession.id)}`
          : existingSession.provider === "Wert.io"
            ? `/checkout/gate-3/${encodeURIComponent(existingSession.id)}`
            : existingSession.provider === "Coinflow"
              ? `/checkout/gate-4/${encodeURIComponent(existingSession.id)}`
          : existingSession.paymentUrl ?? "/dashboard/deposit",
      activeSession: existingSession,
      reusedExistingSession: true,
    };
  }

  const account = await getUserAndBalance(input.userId);

  if (!account) {
    throw new Error("Unable to load collector account.");
  }

  if (!userHasKycAccess(account.user)) {
    throw new KycVerificationRequiredError(
      "Please complete verification before making a card payment.",
    );
  }

  const gate = await resolveDepositGateForUser({
    userId: input.userId,
    provider: input.provider ?? null,
    gateNumber: input.gateNumber ?? null,
    amount: input.amount,
    currency: input.currency,
  });

  const conversion = await convertAmount(input.amount, input.currency, "USD");
  const sessionId = randomUUID();
  const depositId = createReadableId("DEP");
  const transactionId = createReadableId("TXN");
  const timestamp = nowIso();
  const expiresAt = new Date(
    Date.now() + CHECKOUT_PAYMENT_SESSION_TTL_MINUTES * 60 * 1000,
  ).toISOString();

  if (gate.providerName === "Coinflow") {
    await ensureCoinflowDepositPaymentSessionColumns();
    const coinflowConfig = getCoinflowPublicConfig();
    console.info(`[COINFLOW_GATE4][${coinflowConfig.serverEnv}][card] session_create_requested`, {
      userId: input.userId,
      amount: input.amount,
      currency: "USD",
    });
    if (!account.user.email) {
      throw new Error("Gate #4 requires an email address before payment.");
    }
    if (!coinflowConfig.merchantId || !coinflowConfig.apiKeyConfigured) {
      throw new Error(
        "Gate #4 checkout could not be prepared. Please try another gate or contact support.",
      );
    }

    const amountCents = Math.round(input.amount * 100);
    const idempotencyKey = `coinflow_credit:${sessionId}`;
    const webhookInfo = buildCoinflowWebhookInfo({
      sessionId,
      userId: input.userId,
      localTransactionId: transactionId,
      idempotencyKey,
      amount: input.amount,
      amountCents,
      currency: "USD",
      email: account.user.email,
      kycStatus: account.user.kycStatus,
    });
    const chargebackProtectionData = buildCoinflowChargebackProtectionData({
      sessionId,
      userId: input.userId,
      localTransactionId: transactionId,
      idempotencyKey,
      amount: input.amount,
      amountCents,
      currency: "USD",
      email: account.user.email,
      kycStatus: account.user.kycStatus,
    });
    const coinflowMetaJson = toJson({
      internalDepositId: depositId,
      internalTransactionId: transactionId,
      gate: gate.publicName,
      provider: "Coinflow",
      webhookInfo,
      chargebackProtectionData,
      environment: coinflowConfig.serverEnv,
      paymentMethod: "card",
    });
    const coinflowRawResponseJson = toJson({ webhookInfo, chargebackProtectionData });
    const coinflowWebhookInfoJson = toJson(webhookInfo);

    await execute(
      `insert into deposit_payment_sessions (
        id, user_id, payment_method, payment_provider, currency, original_amount,
        credited_amount_usd, exchange_rate, status, meta_json, deposit_id, transaction_id,
        transvoucher_transaction_id, transvoucher_reference_id, payment_url,
        provider_status, raw_provider_response, provider_key, provider_click_id,
        provider_order_id, provider_payment_id, provider_environment, provider_checkout_env,
        amount_cents, coinflow_webhook_info,
        coinflow_settlement_type, idempotency_key, created_at, updated_at, expires_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        input.userId,
        "card",
        "Coinflow",
        "USD",
        input.amount,
        conversion.convertedAmount,
        conversion.exchangeRate,
        "pending",
        coinflowMetaJson,
        depositId,
        transactionId,
        null,
        transactionId,
        `/checkout/gate-4/${encodeURIComponent(sessionId)}`,
        "created",
        coinflowRawResponseJson,
        "coinflow",
        transactionId,
        null,
        null,
        coinflowConfig.serverEnv,
        coinflowConfig.env,
        amountCents,
        coinflowWebhookInfoJson,
        coinflowConfig.settlementType,
        idempotencyKey,
        timestamp,
        timestamp,
        expiresAt,
      ],
    );

    console.info(`[COINFLOW_GATE4][${coinflowConfig.serverEnv}][card] session_created`, {
      sessionId,
      userId: input.userId,
      amount: input.amount,
      currency: "USD",
    });

    return {
      sessionId,
      paymentUrl: `/checkout/gate-4/${encodeURIComponent(sessionId)}`,
      embedUrl: null,
      useEmbed: false,
      redirectPath: `/checkout/gate-4/${encodeURIComponent(sessionId)}`,
      activeSession: null,
      reusedExistingSession: false,
    };
  }

  if (gate.providerName === "Wert.io") {
    let widgetOptions: WertWidgetOptions;
    const clickId = transactionId;

    try {
      widgetOptions = createWertSignedWidgetOptions({
        clickId,
        localTransactionId: transactionId,
        depositId,
        userId: input.userId,
        fiatAmount: input.amount,
        fiatCurrency: "USD",
        recipientWallet: account.user.withdrawalWallet,
      });
    } catch (error) {
      await insertSecurityAuditEvent({
        eventType: "wert_signature_error",
        userId: account.user.id,
        username: account.user.username,
        telegramUsername: account.user.telegramUsername,
        role: account.user.role,
        ipAddress: "system",
        country: "unknown",
        userAgent: "server",
        language: "unknown",
        route: "/api/deposit/session",
        timestamp,
      });
      console.error("Wert signature generation failed.", error);
      throw new Error(
        "Gate #3 is temporarily unavailable. Please try another payment gate or contact support.",
      );
    }

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
        "USD",
        conversion.convertedAmount,
        conversion.exchangeRate,
        input.paymentMethod,
        "Wert.io",
        null,
        clickId,
        "Gate #3 smart contract checkout",
        clickId,
        "processing",
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
      originalCurrency: "USD",
      displayCurrency: "USD",
      creditedAmountUsd: conversion.convertedAmount,
      exchangeRate: conversion.exchangeRate,
      paymentMethod: input.paymentMethod,
      paymentProvider: "Wert.io",
      transvoucherTransactionId: null,
      transvoucherReferenceId: clickId,
      paymentUrl: widgetOptions.origin,
      providerStatus: "created",
      rawProviderResponse: toJson({ widgetOptions }),
      status: "pending",
      referenceId: depositId,
      summary: "Awaiting Gate #3 deposit confirmation",
      meta: {
        gate: gate.publicName,
        provider: "Wert.io",
        clickId,
        originalAmount: input.amount,
        originalCurrency: "USD",
        creditedAmountUsd: conversion.convertedAmount,
        exchangeRate: conversion.exchangeRate,
        paymentMethod: input.paymentMethod,
        relatedOrderId: depositId,
        wert: {
          environment: widgetOptions.extra.environment,
          commodity: widgetOptions.commodity,
          commodityAmount: widgetOptions.commodity_amount,
          network: widgetOptions.network,
          scAddress: widgetOptions.sc_address,
          scInputData: widgetOptions.sc_input_data,
          contractOrderId: widgetOptions.extra.contract_order_id,
          tokenId: widgetOptions.extra.token_id,
          tokenQuantity: widgetOptions.extra.token_quantity,
          nftDeliveryMode: widgetOptions.extra.nft_delivery_mode,
        },
      },
    });

    await execute(
      `insert into deposit_payment_sessions (
        id, user_id, payment_method, payment_provider, currency, original_amount,
        credited_amount_usd, exchange_rate, status, meta_json, deposit_id, transaction_id,
        transvoucher_transaction_id, transvoucher_reference_id, payment_url,
        provider_status, raw_provider_response, provider_key, provider_click_id,
        provider_order_id, balance_credited_at, token_id, token_quantity,
        contract_address, contract_order_id, sc_input_data, chain_network,
        recipient_wallet, nft_delivery_mode, chain_tx_hash, nft_delivered_at,
        created_at, updated_at, expires_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        input.userId,
        input.paymentMethod,
        "Wert.io",
        "USD",
        input.amount,
        conversion.convertedAmount,
        conversion.exchangeRate,
        "pending",
        toJson({
          internalDepositId: depositId,
          internalTransactionId: transactionId,
          clickId,
          gate: gate.publicName,
          provider: "Wert.io",
          wertEnvironment: widgetOptions.extra.environment,
        }),
        depositId,
        transactionId,
        null,
        clickId,
        widgetOptions.origin,
        "created",
        toJson({ widgetOptions }),
        "wert",
        clickId,
        null,
        null,
        widgetOptions.extra.token_id,
        widgetOptions.extra.token_quantity,
        widgetOptions.sc_address,
        widgetOptions.extra.contract_order_id,
        widgetOptions.sc_input_data,
        widgetOptions.network,
        widgetOptions.address,
        widgetOptions.extra.nft_delivery_mode,
        null,
        null,
        timestamp,
        timestamp,
        expiresAt,
      ],
    );

    await execute(
      `insert into wert_payment_sessions (
        id, user_id, provider_key, gate_number, type, local_transaction_id,
        deposit_id, click_id, wert_order_id, wert_status, amount_fiat,
        fiat_currency, commodity, commodity_amount, network, user_wallet_address,
        sc_address, sc_input_data, signature_hash, token_id, token_quantity,
        contract_order_id, recipient_wallet, nft_delivery_mode, chain_tx_hash,
        status, balance_credited_at, nft_delivered_at, provider_payload_safe,
        last_status_check_at, last_webhook_at, created_at, updated_at
      ) values (?, ?, 'wert', 3, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        input.userId,
        widgetOptions.extra.type,
        transactionId,
        depositId,
        clickId,
        null,
        "created",
        input.amount,
        "USD",
        widgetOptions.commodity,
        widgetOptions.commodity_amount,
        widgetOptions.network,
        null,
        widgetOptions.sc_address,
        widgetOptions.sc_input_data,
        hashWertSignature(widgetOptions.signature),
        widgetOptions.extra.token_id,
        widgetOptions.extra.token_quantity,
        widgetOptions.extra.contract_order_id,
        widgetOptions.address,
        widgetOptions.extra.nft_delivery_mode,
        null,
        "created",
        null,
        null,
        toJson({
          widgetOptions: {
            ...widgetOptions,
            signature: "[redacted]",
          },
        }),
        null,
        null,
        timestamp,
        timestamp,
      ],
    );

    await insertSecurityAuditEvent({
      eventType: "wert_session_created",
      userId: account.user.id,
      username: account.user.username,
      telegramUsername: account.user.telegramUsername,
      role: account.user.role,
      ipAddress: "system",
      country: "unknown",
      userAgent: "server",
      language: "unknown",
      route: "/api/deposit/session",
      timestamp,
    });

    await insertSecurityAuditEvent({
      eventType: "wert_widget_options_generated",
      userId: account.user.id,
      username: account.user.username,
      telegramUsername: account.user.telegramUsername,
      role: account.user.role,
      ipAddress: "system",
      country: "unknown",
      userAgent: "server",
      language: "unknown",
      route: "/api/deposit/session",
      timestamp,
    });

    return {
      sessionId,
      paymentUrl: `/checkout/gate-3/${encodeURIComponent(sessionId)}`,
      embedUrl: null,
      useEmbed: false,
      wertWidgetOptions: null,
      redirectPath: `/checkout/gate-3/${encodeURIComponent(sessionId)}`,
      activeSession: null,
      reusedExistingSession: false,
    };
  }

  if (gate.providerName === "Cleffo") {
    let firstName = "";
    let lastName = "";
    let phone = "";

    try {
      firstName = normalizeGate2Name(
        account.user.gate2FirstName,
        "First name",
        account.user.username,
      );
      lastName = normalizeGate2Name(
        account.user.gate2LastName,
        "Last name",
        account.user.username,
      );
      phone = normalizeGate2Phone(account.user.gate2Phone ?? account.user.paymentPhone);
    } catch {
      await insertSecurityAuditEvent({
        eventType: "gate2_payment_blocked_missing_details",
        userId: account.user.id,
        username: account.user.username,
        telegramUsername: account.user.telegramUsername,
        role: account.user.role,
        ipAddress: "unknown",
        country: "unknown",
        userAgent: "server",
        language: "unknown",
        route: "/api/deposit/session",
        timestamp,
      });
      throw new Gate2DetailsRequiredError(
        "Gate #2 requires your first name, last name, and phone number before payment.",
      );
    }

    const redirectUrl = `${SITE_BASE_URL.replace(/\/+$/, "")}/dashboard/deposit`;
    const payment = await createCleffoPaymentLink({
      merchantOrderId: transactionId,
      amount: input.amount,
      currency: "USD",
      customer: {
        firstName,
        lastName,
        email: account.user.email,
        phone,
      },
      redirectUrl,
      metadata: {
        type: "deposit",
        user_id: account.user.id,
        username: account.user.username,
        internal_deposit_id: depositId,
        internal_transaction_id: transactionId,
      },
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
        "Cleffo",
        payment.transactionId,
        payment.referenceId,
        "Gate #2 hosted payment",
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
      paymentProvider: "Cleffo",
      transvoucherTransactionId: payment.transactionId,
      transvoucherReferenceId: payment.referenceId,
      paymentUrl: payment.paymentUrl,
      providerStatus: providerStatus || null,
      rawProviderResponse: toJson(payment.raw),
      status: initialTransactionStatus,
      referenceId: depositId,
      summary: "Awaiting Gate #2 deposit confirmation",
      meta: {
        gate: gate.publicName,
        provider: "Cleffo",
        originalAmount: input.amount,
        originalCurrency: input.currency,
        creditedAmountUsd: conversion.convertedAmount,
        exchangeRate: conversion.exchangeRate,
        paymentMethod: input.paymentMethod,
        paymentReference,
        relatedOrderId: depositId,
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
        "Cleffo",
        input.currency,
        input.amount,
        conversion.convertedAmount,
        conversion.exchangeRate,
        initialSessionStatus,
        toJson({
          internalDepositId: depositId,
          internalTransactionId: transactionId,
          redirectUrl,
          gate: gate.publicName,
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

    await insertSecurityAuditEvent({
      eventType: "cleffo_payment_created",
      userId: account.user.id,
      username: account.user.username,
      telegramUsername: account.user.telegramUsername,
      role: account.user.role,
      ipAddress: "system",
      country: "unknown",
      userAgent: "server",
      language: "unknown",
      route: "/api/deposit/session",
      timestamp,
    });

    return {
      sessionId,
      paymentUrl: payment.paymentUrl,
      embedUrl: null,
      useEmbed: false,
      redirectPath: payment.paymentUrl,
      activeSession: null,
      reusedExistingSession: false,
    };
  }

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
    embedUrl: payment.embedUrl,
    useEmbed: payment.useEmbed && Boolean(payment.embedUrl),
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
  await requireDocumentAcceptanceForUser(input.userId);
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
  await requireDocumentAcceptanceForUser(input.userId);
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
    const account = await getUserAndBalance(input.order.userId);
    if (!account) {
      throw new Error("Unable to load collector account for TransVoucher reconciliation.");
    }

    let completion: Awaited<ReturnType<typeof completeTransVoucherOrderAtomically>>;
    try {
      if (input.order.paymentState !== "completed") {
        await releaseExpiredRandomizedPackReservations();
        await reserveRandomizedOrderItems({
          orderId: input.order.id,
          userId: input.order.userId,
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        });
      }
      completion = await completeTransVoucherOrderAtomically({
        order: input.order,
        transaction: input.transaction,
        session: input.session,
        providerStatus: input.providerStatus,
        providerTransactionId: input.providerTransactionId,
        providerReferenceId: input.providerReferenceId,
        paymentUrl: input.paymentUrl,
        rawProviderResponse,
        metaJson: toJson(mergedMeta),
        paidAt: input.paidAt ?? timestamp,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Paid order fulfillment failed.";
      await execute(
        `update orders set status = 'Pending', payment_state = 'paid_unfulfilled',
          failure_reason = ?, provider_status = ?, paid_at = coalesce(paid_at, ?), updated_at = ?
          where id = ? and payment_state <> 'completed'`,
        [reason, input.providerStatus, input.paidAt ?? timestamp, timestamp, input.order.id],
      );
      await execute(
        `update transactions set status = 'processing', summary = 'Paid order requires fulfillment',
          last_error = ?, provider_status = ?, raw_provider_response = ?, updated_at = ?
          where id = ? and status <> 'completed'`,
        [reason, input.providerStatus, rawProviderResponse, timestamp, input.transaction.id],
      );
      if (input.session) {
        await execute(
          `update payment_sessions set status = 'paid_unfulfilled', provider_status = ?,
            raw_provider_response = ?, updated_at = ? where id = ? and status <> 'completed'`,
          [input.providerStatus, rawProviderResponse, timestamp, input.session.id],
        );
      }
      await notifySafely(() =>
        sendTelegramAdminMessage(
          [
            "<b>Paid randomized order requires fulfillment</b>",
            "",
            `Order: ${escapeTelegramHtml(input.order.id)}`,
            `User: ${escapeTelegramHtml(account.user.telegramUsername)}`,
            `Reason: ${escapeTelegramHtml(reason)}`,
          ].join("\n"),
        ),
      );
      revalidatePrivate(input.order.userId);
      revalidateAdmin();
      return;
    }

    if (completion.completedNow) {
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
          items: completion.delivered,
          timestamp: input.paidAt ?? timestamp,
        }),
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
      await releaseRandomizedOrderReservations(input.order.id, "payment_failed");
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
  providerName?: Exclude<PaymentProviderName, "Internal Wallet">;
  providerStatus: string;
  providerTransactionId: string | null;
  providerReferenceId: string | null;
  paymentUrl: string | null;
  paidAt: string | null;
  rawProviderResponse: unknown;
}) {
  const timestamp = nowIso();
  const providerName = input.providerName ?? "TransVoucher";
  const rawProviderResponse = toJson(input.rawProviderResponse);
  const paymentReference = buildTransVoucherPaymentReference({
    referenceId: input.providerReferenceId,
    transactionId: input.providerTransactionId,
  });
  const mergedMeta = {
    ...getTransactionMeta(input.transaction),
    provider: providerName,
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
          provider: providerName,
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
        providerName,
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
        providerName,
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
          balance_credited_at = coalesce(balance_credited_at, ?),
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
      `Payment failed or was declined by ${providerName}.`;

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
          provider: providerName,
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
        providerName,
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
        providerName,
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
      providerName,
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
      providerName,
      input.providerTransactionId,
      input.providerReferenceId,
      input.paymentUrl,
      input.providerStatus,
      rawProviderResponse,
      mapProviderStatusToTransactionStatus(input.providerStatus),
      `${providerName} deposit status updated`,
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
  localReferenceId?: string | null;
  providerTransactionId?: string | null;
  providerReferenceId?: string | null;
  providerName?: Exclude<PaymentProviderName, "Internal Wallet">;
  providerStatus: string;
  source?: "webhook" | "reconciliation" | "manual_check";
  paymentUrl?: string | null;
  paidAt?: string | null;
  rawProviderResponse: unknown;
}) {
  await ensureDatabase();

  const lookupIds = [
    input.transactionId,
    input.localReferenceId,
    input.providerReferenceId,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  let transactionRow = null as Awaited<ReturnType<typeof queryOne>>;

  for (const id of lookupIds) {
    transactionRow = await queryOne(
      `select * from transactions
       where id = ? or reference_id = ? or transvoucher_reference_id = ?
       limit 1`,
      [id, id, id],
    );
    if (transactionRow) {
      break;
    }
  }

  if (!transactionRow && input.providerTransactionId) {
    transactionRow = await queryOne(
      "select * from transactions where transvoucher_transaction_id = ? limit 1",
      [input.providerTransactionId],
    );
  }

  if (!transactionRow) {
    console.warn("TransVoucher update skipped: local transaction not found.", {
      providerTransactionId: input.providerTransactionId,
      providerReferenceId: input.providerReferenceId,
      localReferenceId: input.localReferenceId,
      rawStatus: input.providerStatus,
      normalizedStatus: normalizeProviderStatus(input.providerStatus),
    });
    return null;
  }

  const transaction = normalizeTransaction(transactionRow);
  const providerName =
    input.providerName ??
    (transaction.paymentProvider === "Cleffo" ? "Cleffo" : "TransVoucher");
  const normalizedProviderStatus = normalizeProviderStatus(input.providerStatus);
  console.info(`Processing ${providerName} payment update.`, {
    source: input.source ?? "manual_check",
    transactionId: transaction.id,
    providerTransactionId: input.providerTransactionId ?? transaction.transvoucherTransactionId,
    providerReferenceId: input.providerReferenceId ?? transaction.transvoucherReferenceId,
    rawStatus: input.providerStatus,
    normalizedStatus: normalizedProviderStatus,
    previousStatus: transaction.status,
    kind: transaction.kind,
  });

  if (
    transaction.processedAt &&
    ["completed", "failed", "expired"].includes(transaction.status)
  ) {
    console.info("Skipped TransVoucher update because transaction is already final.", {
      transactionId: transaction.id,
      previousStatus: transaction.status,
      processedAt: transaction.processedAt,
    });
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
      providerName,
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

  const updated = updatedRow ? normalizeTransaction(updatedRow) : transaction;
  console.info(`Finished ${providerName} payment update.`, {
    source: input.source ?? "manual_check",
    transactionId: transaction.id,
    previousStatus: transaction.status,
    newStatus: updated.status,
    providerStatus: updated.providerStatus,
    credited: Boolean(updated.creditedAt),
  });

  return updated;
}

function readCoinflowString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return null;
}

function readCoinflowAmount(record: Record<string, unknown>) {
  const cents = record.amountCents ?? record.amount_cents ?? record.cents;
  if (typeof cents === "number" && Number.isFinite(cents)) {
    return cents / 100;
  }
  const amount = record.amount ?? record.total ?? record.subtotal;
  if (typeof amount === "number" && Number.isFinite(amount)) {
    return amount;
  }
  if (typeof amount === "string" && amount.trim()) {
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function processCoinflowWebhookPayload(payload: Record<string, unknown>) {
  await ensureDatabase();
  await ensureCoinflowDepositPaymentSessionColumns();
  const timestamp = nowIso();
  const eventType = getCoinflowEventType(payload);
  const eventId = getCoinflowEventId(payload);
  const data = getCoinflowData(payload);
  const webhookInfo = getCoinflowWebhookInfo(payload);
  const sessionId = readCoinflowString(webhookInfo, ["rebohrome_session_id", "sessionId"]);
  const localTransactionId = readCoinflowString(webhookInfo, [
    "local_transaction_id",
    "localTransactionId",
  ]);
  const providerPaymentId = readCoinflowString(data, ["id", "paymentId", "payment_id"]);
  const rawStatus =
    eventType || readCoinflowString(data, ["status", "paymentStatus", "state"]) || "pending";
  const coinflowStatus = normalizeCoinflowStatus(rawStatus);
  const providerStatus = mapCoinflowToProviderStatus(coinflowStatus);
  const rawPayload = toJson(payload);
  const requestedEnvironment =
    readCoinflowString(webhookInfo, ["environment", "coinflow_env"]) ?? "sandbox";

  console.info(`[COINFLOW_GATE4][${requestedEnvironment}][card] webhook_event_mapped`, {
    eventType,
    sessionId,
    providerPaymentId,
    status: coinflowStatus,
  });

  if (!sessionId && !localTransactionId && !providerPaymentId) {
    console.warn(`[COINFLOW_GATE4][${requestedEnvironment}][card] webhook skipped: no local identifiers`);
    return { ok: true, skipped: true, reason: "missing_identifier" };
  }

  const sessionRow = await queryOne(
    `select *
     from deposit_payment_sessions
     where provider_key = 'coinflow'
       and (
        id = ?
        or transaction_id = ?
        or provider_payment_id = ?
        or transvoucher_reference_id = ?
       )
     limit 1`,
    [
      sessionId ?? "",
      localTransactionId ?? "",
      providerPaymentId ?? "",
      localTransactionId ?? "",
    ],
  );

  if (!sessionRow) {
    console.warn(`[COINFLOW_GATE4][${requestedEnvironment}][card] webhook skipped: session not found`, {
      sessionId,
      localTransactionId,
      providerPaymentId,
    });
    return { ok: true, skipped: true, reason: "session_not_found" };
  }

  const session = normalizeDepositPaymentSession(sessionRow);
  const sessionEnvironment = sessionRow.provider_environment
    ? String(sessionRow.provider_environment)
    : requestedEnvironment;
  const amount = readCoinflowAmount(data);
  const currency = readCoinflowString(data, ["currency", "fiatCurrency"]) ?? "USD";

  if (amount !== null && Math.abs(amount - session.originalAmount) > 0.01) {
    await execute(
      `update deposit_payment_sessions set
        provider_status = ?,
        provider_raw_status = ?,
        provider_raw_payload = ?,
        raw_provider_response = ?,
        updated_at = ?
       where id = ?`,
      [
        "amount_mismatch",
        rawStatus,
        rawPayload,
        rawPayload,
        timestamp,
        session.id,
      ],
    );
    console.warn(`[COINFLOW_GATE4][${sessionEnvironment}][card] webhook amount mismatch`, {
      sessionId: session.id,
      expected: session.originalAmount,
      actual: amount,
    });
    return { ok: true, skipped: true, reason: "amount_mismatch" };
  }

  if (currency !== "USD") {
    return { ok: true, skipped: true, reason: "currency_mismatch" };
  }

  await execute(
    `update deposit_payment_sessions set
      provider_payment_id = coalesce(provider_payment_id, ?),
      provider_order_id = coalesce(provider_order_id, ?),
      provider_event_id = coalesce(provider_event_id, ?),
      provider_status = ?,
      provider_raw_status = ?,
      provider_raw_payload = ?,
      raw_provider_response = ?,
      coinflow_payment_id = coalesce(coinflow_payment_id, ?),
      coinflow_customer_id = coalesce(coinflow_customer_id, ?),
      coinflow_last4 = coalesce(coinflow_last4, ?),
      coinflow_bin = coalesce(coinflow_bin, ?),
      updated_at = ?
     where id = ?`,
    [
      providerPaymentId,
      providerPaymentId,
      eventId || null,
      providerStatus,
      rawStatus,
      rawPayload,
      rawPayload,
      providerPaymentId,
      readCoinflowString(data, ["customerId", "customer_id"]),
      readCoinflowString(data, ["last4", "cardLast4"]),
      readCoinflowString(data, ["bin", "cardBin"]),
      timestamp,
      session.id,
    ],
  );

  let transactionRow = await queryOne(
    "select * from transactions where id = ? and user_id = ? limit 1",
    [session.transactionId ?? "", session.userId],
  );
  let depositRow = await queryOne(
    "select * from deposits where id = ? and user_id = ? limit 1",
    [session.depositId ?? "", session.userId],
  );

  if (!transactionRow || !depositRow) {
    if (coinflowStatus !== "settled") {
      return { ok: true, skipped: true, reason: "deposit_or_transaction_missing" };
    }

    const account = await getUserAndBalance(session.userId);
    if (!account || !session.depositId || !session.transactionId) {
      return { ok: true, skipped: true, reason: "deposit_or_transaction_missing" };
    }

    if (!depositRow) {
      await execute(
        `insert into deposits (
          id, user_id, amount, original_amount, original_currency, credited_amount_usd,
          exchange_rate, payment_method, payment_provider, transvoucher_transaction_id,
          transvoucher_reference_id, cardholder_name, card_masked, status, balance_before,
          balance_after, created_at, updated_at, completed_at, paid_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.depositId,
          session.userId,
          session.creditedAmountUsd,
          session.originalAmount,
          "USD",
          session.creditedAmountUsd,
          session.exchangeRate,
          "card",
          "Coinflow",
          providerPaymentId,
          localTransactionId ?? session.transvoucherReferenceId,
          "Gate #4 hosted checkout",
          localTransactionId ?? session.transactionId,
          "processing",
          account.balance.available,
          account.balance.available,
          timestamp,
          timestamp,
          null,
          null,
        ],
      );
    }

    if (!transactionRow) {
      await createTransactionRecord({
        id: session.transactionId,
        userId: session.userId,
        kind: "deposit",
        amount: session.creditedAmountUsd,
        originalAmount: session.originalAmount,
        originalCurrency: "USD",
        displayCurrency: "USD",
        creditedAmountUsd: session.creditedAmountUsd,
        exchangeRate: session.exchangeRate,
        paymentMethod: "card",
        paymentProvider: "Coinflow",
        transvoucherTransactionId: providerPaymentId,
        transvoucherReferenceId: localTransactionId ?? session.transvoucherReferenceId,
        paymentUrl: session.paymentUrl,
        providerStatus,
        rawProviderResponse: rawPayload,
        status: "pending",
        referenceId: session.depositId,
        summary: "Awaiting Gate #4 deposit confirmation",
        meta: {
          provider: "Coinflow",
          sessionId: session.id,
          originalAmount: session.originalAmount,
          originalCurrency: "USD",
          creditedAmountUsd: session.creditedAmountUsd,
          exchangeRate: session.exchangeRate,
          paymentMethod: "card",
          relatedOrderId: session.depositId,
          environment: sessionEnvironment,
        },
      });
    }

    transactionRow = await queryOne(
      "select * from transactions where id = ? and user_id = ? limit 1",
      [session.transactionId, session.userId],
    );
    depositRow = await queryOne(
      "select * from deposits where id = ? and user_id = ? limit 1",
      [session.depositId, session.userId],
    );

    if (!transactionRow || !depositRow) {
      return { ok: true, skipped: true, reason: "deposit_or_transaction_missing" };
    }
  }

  if (coinflowStatus === "settled") {
    console.info(`[COINFLOW_GATE4][${sessionEnvironment}][card] balance_credit_attempt`, {
      sessionId: session.id,
      providerPaymentId,
    });
  }

  await reconcileTransVoucherDeposit({
    transaction: normalizeTransaction(transactionRow),
    deposit: normalizeDeposit(depositRow),
    session,
    providerName: "Coinflow",
    providerStatus,
    providerTransactionId: providerPaymentId,
    providerReferenceId: localTransactionId ?? session.transvoucherReferenceId,
    paymentUrl: session.paymentUrl,
    paidAt: coinflowStatus === "settled" ? timestamp : null,
    rawProviderResponse: sanitizeCoinflowResponse(payload),
  });

  if (coinflowStatus === "settled") {
    console.info(`[COINFLOW_GATE4][${sessionEnvironment}][card] balance_credit_success`, {
      sessionId: session.id,
      providerPaymentId,
    });
  }

  return {
    ok: true,
    environment: sessionEnvironment,
    status: coinflowStatus,
    providerStatus,
    credited: coinflowStatus === "settled",
  };
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
    source: userId ? "manual_check" : "reconciliation",
    paymentUrl: providerStatus.paymentUrl,
    paidAt: providerStatus.paidAt,
    rawProviderResponse: providerStatus.raw,
  });
}

export async function refreshCleffoTransactionStatus(
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

  if (transaction.paymentProvider !== "Cleffo") {
    return transaction;
  }

  if (!transaction.transvoucherTransactionId) {
    return transaction;
  }

  const timestamp = nowIso();
  await execute(
    `update transactions set
      provider_checked_at = ?,
      reconciliation_attempts = reconciliation_attempts + 1,
      updated_at = ?
     where id = ?`,
    [timestamp, timestamp, transaction.id],
  );

  try {
    const providerStatus = await getCleffoPaymentLinkStatus(
      transaction.transvoucherTransactionId,
    );

    const updated = await applyTransVoucherPaymentStatus({
      transactionId: transaction.id,
      providerName: "Cleffo",
      providerTransactionId:
        providerStatus.transactionReferenceNumber ??
        transaction.transvoucherTransactionId,
      providerReferenceId:
        providerStatus.referenceId ?? transaction.transvoucherReferenceId,
      providerStatus: providerStatus.status,
      source: userId ? "manual_check" : "reconciliation",
      paymentUrl: providerStatus.paymentUrl ?? transaction.paymentUrl,
      paidAt: providerStatus.paidAt,
      rawProviderResponse: providerStatus.raw,
    });

    await insertSecurityAuditEvent({
      eventType: "cleffo_payment_status_updated",
      userId: transaction.userId,
      username: null,
      telegramUsername: null,
      role: null,
      ipAddress: "system",
      country: "unknown",
      userAgent: "server",
      language: "unknown",
      route: "cleffo-status-refresh",
      timestamp,
    });

    return updated;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to refresh Gate #2 status.";
    await execute(
      `update transactions set
        last_error = ?,
        next_check_at = ?,
        updated_at = ?
       where id = ?`,
      [
        message,
        new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        nowIso(),
        transaction.id,
      ],
    );
    await insertSecurityAuditEvent({
      eventType: "cleffo_payment_failed",
      userId: transaction.userId,
      username: null,
      telegramUsername: null,
      role: null,
      ipAddress: "system",
      country: "unknown",
      userAgent: "server",
      language: "unknown",
      route: "cleffo-status-refresh",
      timestamp,
    });
    throw error;
  }
}

export async function reconcilePendingTransVoucherPayments(input?: {
  limit?: number;
  triggerSource?: "cron" | "manual" | "active_polling";
  activeOnly?: boolean;
}) {
  await ensureDatabase();

  const limit = Math.min(Math.max(Number(input?.limit ?? 50), 1), 200);
  const runId = randomUUID();
  const startedAt = nowIso();
  const baselineAt = await getTransVoucherReconciliationBaselineAt();
  const activeWindowAt = input?.activeOnly
    ? new Date(Date.now() - 30 * 60 * 1000).toISOString()
    : null;

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
       and (? is null or created_at >= ?)
       and processed_at is null
       and credited_at is null
       and (next_check_at is null or next_check_at <= ?)
       and (
         status in ('pending', 'attempting', 'processing')
         or lower(coalesce(provider_status, '')) in (
           '', 'pending', 'attempting', 'processing', 'created',
           'waiting', 'in_progress', 'unknown'
         )
       )
     order by coalesce(provider_checked_at, created_at) asc
     limit ?`,
    [baselineAt, baselineAt, activeWindowAt, activeWindowAt, startedAt, limit],
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
        source: "reconciliation",
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

function getNestedProviderString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const direct = payload[key];
    if (typeof direct === "string" && direct.trim()) {
      return direct.trim();
    }

    if (typeof direct === "number" && Number.isFinite(direct)) {
      return String(direct);
    }

    for (const value of Object.values(payload)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nested = (value as Record<string, unknown>)[key];
        if (typeof nested === "string" && nested.trim()) {
          return nested.trim();
        }

        if (typeof nested === "number" && Number.isFinite(nested)) {
          return String(nested);
        }
      }
    }
  }

  return null;
}

export function normalizeWertStatus(rawStatus: string | null | undefined) {
  const normalized = String(rawStatus ?? "").trim().toLowerCase();

  if (
    ["success", "succeeded", "complete", "completed", "paid", "approved", "executed"].includes(
      normalized,
    )
  ) {
    return "succeeded";
  }

  if (
    [
      "failed",
      "fail",
      "declined",
      "rejected",
      "canceled",
      "cancelled",
      "expired",
      "error",
    ].includes(normalized)
  ) {
    return normalized === "expired" ? "expired" : "failed";
  }

  if (["pending", "processing", "created", "waiting", "submitted"].includes(normalized)) {
    return normalized === "created" ? "pending" : normalized;
  }

  return normalized || "unknown";
}

function getWertOrderString(order: Record<string, unknown> | null, keys: string[]) {
  if (!order) {
    return null;
  }

  for (const key of keys) {
    const value = order[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

async function processWertOrderUpdate(input: {
  clickId: string;
  wertOrderId?: string | null;
  order: Record<string, unknown> | null;
  rawPayload: unknown;
  source: "webhook" | "reconciliation" | "manual_check" | "status_poll";
}) {
  await ensureDatabase();
  const timestamp = nowIso();
  const rawStatus = getWertOrderString(input.order, ["status", "state"]) ?? "unknown";
  const status = normalizeWertStatus(rawStatus);
  const orderId =
    input.wertOrderId ??
    getWertOrderString(input.order, ["order_id", "id", "external_order_id"]);
  const txHash = getWertOrderString(input.order, ["tx_id", "tx_hash", "transaction_hash"]);

  const sessionRow = await queryOne(
    `select * from deposit_payment_sessions
     where provider_key = 'wert'
       and (provider_click_id = ? or transvoucher_reference_id = ? or transaction_id = ?)
     limit 1`,
    [input.clickId, input.clickId, input.clickId],
  );

  if (!sessionRow) {
    console.warn("Wert update skipped: local session not found.", {
      clickId: input.clickId,
      orderId,
      status,
    });
    return { ok: false, skipped: true, reason: "session_not_found", status };
  }
  const wertSessionRow = await queryOne(
    "select * from wert_payment_sessions where click_id = ? limit 1",
    [input.clickId],
  );

  await execute(
    `update wert_payment_sessions set
      wert_order_id = coalesce(wert_order_id, ?),
      wert_status = ?,
      status = ?,
      chain_tx_hash = coalesce(chain_tx_hash, ?),
      provider_payload_safe = ?,
      last_status_check_at = case when ? in ('reconciliation', 'manual_check', 'status_poll') then ? else last_status_check_at end,
      last_webhook_at = case when ? = 'webhook' then ? else last_webhook_at end,
      updated_at = ?
     where click_id = ?`,
    [
      orderId,
      status,
      isProviderCompletedStatus(status)
        ? "succeeded"
        : isProviderTerminalFailureStatus(status)
          ? status === "expired"
            ? "expired"
            : "failed"
          : status === "unknown"
            ? "manual_review"
            : "pending",
      txHash,
      toJson(input.rawPayload),
      input.source,
      timestamp,
      input.source,
      timestamp,
      timestamp,
      input.clickId,
    ],
  );

  if (status === "unknown") {
    await insertSecurityAuditEvent({
      eventType: "wert_unknown_status",
      userId: sessionRow.user_id ? String(sessionRow.user_id) : null,
      ipAddress: "unknown",
      country: "unknown",
      userAgent: "server",
      language: "unknown",
      route: "/api/webhooks/wert",
      timestamp,
    });
    return { ok: true, status, transaction: null };
  }

  let transaction: TransactionRecord | null = null;

  if (
    isProviderCompletedStatus(status) &&
    String(wertSessionRow?.type ?? "balance_topup") === "nft_purchase"
  ) {
    if (!wertSessionRow?.nft_delivered_at) {
      await execute(
        `insert into user_collectibles (
          id, user_id, token_id, quantity, source_payment_session_id,
          provider_key, chain_tx_hash, delivered_at, created_at
        ) values (?, ?, ?, ?, ?, 'wert', ?, ?, ?)`,
        [
          randomUUID(),
          String(sessionRow.user_id),
          Number(wertSessionRow?.token_id ?? 1),
          Number(wertSessionRow?.token_quantity ?? 1),
          String(sessionRow.id),
          txHash,
          timestamp,
          timestamp,
        ],
      );
      await execute(
        `update wert_payment_sessions set
          nft_delivered_at = coalesce(nft_delivered_at, ?),
          chain_tx_hash = coalesce(chain_tx_hash, ?),
          status = 'succeeded',
          updated_at = ?
         where click_id = ?`,
        [timestamp, txHash, timestamp, input.clickId],
      );
      await execute(
        `update deposit_payment_sessions set
          status = 'completed',
          nft_delivered_at = coalesce(nft_delivered_at, ?),
          chain_tx_hash = coalesce(chain_tx_hash, ?),
          provider_status = ?,
          raw_provider_response = ?,
          updated_at = ?
         where id = ?`,
        [
          timestamp,
          txHash,
          status,
          toJson(input.rawPayload),
          timestamp,
          String(sessionRow.id),
        ],
      );
    }
  } else {
    transaction = await applyTransVoucherPaymentStatus({
    transactionId: String(sessionRow.transaction_id ?? input.clickId),
    localReferenceId: String(sessionRow.deposit_id ?? ""),
    providerTransactionId: orderId,
    providerReferenceId: input.clickId,
    providerName: "Wert.io",
    providerStatus: status,
    source: input.source === "webhook" ? "webhook" : "manual_check",
    paymentUrl: String(sessionRow.payment_url ?? ""),
    paidAt: isProviderCompletedStatus(status) ? timestamp : null,
    rawProviderResponse: input.rawPayload,
    });
  }

  if (txHash) {
    await execute(
      `update deposit_payment_sessions set
        chain_tx_hash = coalesce(chain_tx_hash, ?),
        updated_at = ?
       where id = ?`,
      [txHash, timestamp, String(sessionRow.id)],
    );
  }

  await insertSecurityAuditEvent({
    eventType: isProviderCompletedStatus(status)
      ? "wert_payment_succeeded"
      : isProviderTerminalFailureStatus(status)
        ? "wert_payment_failed"
        : "wert_status_updated",
    userId: sessionRow.user_id ? String(sessionRow.user_id) : null,
    ipAddress: "unknown",
    country: "unknown",
    userAgent: "server",
    language: "unknown",
    route: "/api/webhooks/wert",
    timestamp,
  });

  if (isProviderCompletedStatus(status) && String(wertSessionRow?.type ?? "balance_topup") === "balance_topup") {
    await execute(
      `update wert_payment_sessions set
        balance_credited_at = coalesce(balance_credited_at, ?)
       where click_id = ?`,
      [timestamp, input.clickId],
    );
    await insertSecurityAuditEvent({
      eventType: "wert_credit_applied",
      userId: sessionRow.user_id ? String(sessionRow.user_id) : null,
      ipAddress: "unknown",
      country: "unknown",
      userAgent: "server",
      language: "unknown",
      route: "/api/webhooks/wert",
      timestamp,
    });
  }

  return { ok: true, status, transaction };
}

export async function syncWertOrderStatus(input: {
  clickId?: string | null;
  wertOrderId?: string | null;
  source?: "reconciliation" | "manual_check" | "status_poll";
}) {
  const lookup = await lookupWertOrderStatus({
    clickId: input.clickId,
    wertOrderId: input.wertOrderId,
  });
  const clickId =
    input.clickId ??
    getWertOrderString(lookup.order, ["click_id"]) ??
    "";

  if (!clickId) {
    throw new Error("Wert order lookup did not return click_id.");
  }

  return processWertOrderUpdate({
    clickId,
    wertOrderId:
      input.wertOrderId ?? getWertOrderString(lookup.order, ["order_id", "id"]),
    order: lookup.order,
    rawPayload: lookup.raw,
    source: input.source ?? "manual_check",
  });
}

export async function reconcilePendingWertPayments(input?: {
  limit?: number;
  maxAgeMinutes?: number;
}) {
  await ensureDatabase();
  const startedAt = nowIso();
  const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100);
  const maxAgeMinutes = Math.min(Math.max(input?.maxAgeMinutes ?? 60, 5), 240);
  const since = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
  const rows = await queryMany(
    `select * from wert_payment_sessions
     where status in ('created', 'pending', 'manual_review')
       and created_at >= ?
     order by coalesce(last_status_check_at, created_at) asc
     limit ?`,
    [since, limit],
  );
  const summary = {
    checked: 0,
    updated: 0,
    succeeded: 0,
    failed: 0,
    pending: 0,
    manualReview: 0,
    errors: 0,
    lastRunAt: startedAt,
    lastError: null as string | null,
  };

  for (const row of rows) {
    summary.checked += 1;
    try {
      const result = await syncWertOrderStatus({
        clickId: String(row.click_id),
        wertOrderId: row.wert_order_id ? String(row.wert_order_id) : null,
        source: "reconciliation",
      });
      if (result.status === "succeeded") {
        summary.succeeded += 1;
      } else if (["failed", "expired"].includes(String(result.status))) {
        summary.failed += 1;
      } else if (result.status === "unknown") {
        summary.manualReview += 1;
      } else {
        summary.pending += 1;
      }
      summary.updated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Wert reconciliation error.";
      summary.errors += 1;
      summary.lastError = message;
      await execute(
        `update wert_payment_sessions set
          last_status_check_at = ?,
          provider_payload_safe = ?,
          updated_at = ?
         where id = ?`,
        [
          nowIso(),
          toJson({ reconciliationError: message }),
          nowIso(),
          String(row.id),
        ],
      );
    }
  }

  return summary;
}

export async function processWertWebhookPayload(payload: Record<string, unknown>) {
  await ensureDatabase();
  const timestamp = nowIso();
  const clickId = getNestedProviderString(payload, [
    "click_id",
    "clickId",
    "reference_id",
    "referenceId",
    "local_transaction_id",
    "transaction_id",
  ]);
  const providerOrderId = getNestedProviderString(payload, [
    "order_id",
    "orderId",
    "payment_id",
    "paymentId",
    "id",
  ]);
  const rawStatus =
    getNestedProviderString(payload, ["status", "state", "order_status", "payment_status"]) ??
    "unknown";
  const status = normalizeWertStatus(rawStatus);

  await insertSecurityAuditEvent({
    eventType: "wert_webhook_received",
    ipAddress: "unknown",
    country: "unknown",
    userAgent: "server",
    language: "unknown",
    route: "/api/webhooks/wert",
    timestamp,
  });

  const sessionRow = clickId
    ? await queryOne(
        `select * from deposit_payment_sessions
         where provider_key = 'wert'
           and (provider_click_id = ? or transvoucher_reference_id = ? or transaction_id = ?)
         limit 1`,
        [clickId, clickId, clickId],
      )
    : null;

  if (!sessionRow) {
    await insertSecurityAuditEvent({
      eventType: "wert_unknown_status",
      ipAddress: "unknown",
      country: "unknown",
      userAgent: "server",
      language: "unknown",
      route: "/api/webhooks/wert",
      timestamp,
    });
    console.warn("Wert webhook skipped: local session not found.", {
      clickId,
      providerOrderId,
      status,
    });
    return { ok: false, skipped: true, reason: "session_not_found" };
  }
  const resolvedClickId = String(clickId);

  if (providerOrderId) {
    await execute(
      `update deposit_payment_sessions set
        provider_order_id = coalesce(provider_order_id, ?),
        updated_at = ?
       where id = ?`,
      [providerOrderId, timestamp, String(sessionRow.id)],
    );
  }

  await execute(
    `update wert_payment_sessions set
      last_webhook_at = ?,
      provider_payload_safe = ?,
      updated_at = ?
     where click_id = ?`,
    [timestamp, toJson(payload), timestamp, resolvedClickId],
  );

  const lookup = await lookupWertOrderStatus({
    clickId: resolvedClickId,
    wertOrderId: providerOrderId,
  });

  return processWertOrderUpdate({
    clickId: resolvedClickId,
    wertOrderId: providerOrderId,
    order: lookup.order,
    rawPayload: {
      webhook: payload,
      dataApi: lookup.raw,
      webhookStatus: status,
    },
    source: "webhook",
  });
}

function extractWebhookRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function firstWebhookString(
  ...values: unknown[]
) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function extractTransVoucherWebhookStatus(
  payload: Record<string, unknown>,
  envelope: Record<string, unknown>,
  eventType: string,
) {
  const directStatus = firstWebhookString(
    envelope.status,
    envelope.payment_status,
    envelope.paymentStatus,
    envelope.transaction_status,
    envelope.transactionStatus,
    envelope.provider_status,
    envelope.providerStatus,
    envelope.result,
    envelope.state,
    payload.status,
    payload.payment_status,
    payload.transaction_status,
    payload.result,
    payload.state,
  );

  if (directStatus) {
    return directStatus;
  }

  const normalizedEvent = eventType.toLowerCase();
  if (/(succeeded|success|paid|completed|approved|captured|confirmed)/.test(normalizedEvent)) {
    return "succeeded";
  }

  if (/(declined|failed|rejected|cancelled|canceled|expired|error)/.test(normalizedEvent)) {
    return "failed";
  }

  if (/(processing|attempting|pending|created|waiting)/.test(normalizedEvent)) {
    return "processing";
  }

  return "pending";
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
    firstWebhookString(
      metadata.internal_transaction_id,
      metadata.internalTransactionId,
      metadata.transactionId,
      metadata.transaction_id,
      payload.internal_transaction_id,
    );
  const localReferenceId =
    firstWebhookString(
      metadata.depositId,
      metadata.deposit_id,
      metadata.orderId,
      metadata.order_id,
      metadata.referenceId,
      metadata.reference_id,
      envelope.external_id,
      envelope.externalId,
      envelope.reference,
      payload.external_id,
      payload.reference,
    );
  const providerTransactionId =
    firstWebhookString(
      envelope.transaction_id,
      envelope.transactionId,
      envelope.payment_id,
      envelope.paymentId,
      envelope.id,
      payload.transaction_id,
      payload.transactionId,
      payload.payment_id,
      payload.id,
    );
  const providerReferenceId =
    firstWebhookString(
      envelope.reference_id,
      envelope.referenceId,
      envelope.reference,
      envelope.external_id,
      envelope.externalId,
      payload.reference_id,
      payload.referenceId,
      payload.reference,
    );
  const providerStatus = extractTransVoucherWebhookStatus(payload, envelope, eventType);
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
    localReferenceId,
    providerTransactionId,
    providerReferenceId,
    providerStatus,
    source: "webhook",
    paymentUrl,
    paidAt,
    rawProviderResponse: payload,
  });

  return {
    ok: true as const,
    eventType,
    transactionId: transaction?.id ?? null,
    providerTransactionId,
    providerReferenceId,
    rawStatus: providerStatus,
    normalizedStatus: normalizeProviderStatus(providerStatus),
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
  await requireDocumentAcceptanceForUser(input.userId);

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

  await insertCheckoutOrderItems({ orderId, items: input.items, productMap });

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

  const status: OrderStatus = shipping > 0 ? "Processing" : "Completed";
  const transactionId = await createTransactionRecord({
    userId: input.userId,
    kind: "purchase",
    amount: -total,
    originalAmount: total,
    originalCurrency: checkoutCurrency,
    displayCurrency: checkoutCurrency,
    paymentMethod: input.paymentMethod,
    paymentProvider,
    status: "processing",
    referenceId: orderId,
    summary: "Finalizing card purchase",
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

  let completion: Awaited<ReturnType<typeof completeArchiveBalanceOrderAtomically>>;
  try {
    completion = await completeArchiveBalanceOrderAtomically({
      orderId,
      transactionId,
      userId: input.userId,
      total,
      status,
      completedAt: timestamp,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unable to complete card delivery.";
    await releaseRandomizedOrderReservations(orderId, "archive_balance_fulfillment_failed");
    await execute(
      `update orders set status = 'Declined', payment_state = 'failed',
        failure_reason = ?, updated_at = ? where id = ?`,
      [reason, nowIso(), orderId],
    );
    await execute(
      `update transactions set status = 'failed', summary = 'Card purchase failed',
        last_error = ?, updated_at = ? where id = ?`,
      [reason, nowIso(), transactionId],
    );
    await notifySafely(() =>
      sendPurchaseFailureNotification({
        username: account.user.username,
        telegramUsername: account.user.telegramUsername,
        orderId,
        amount: total,
        currency: checkoutCurrency,
        paymentMethod: `${input.paymentMethod} ${paymentReference}`,
        provider: paymentProvider,
        reason,
        timestamp,
      }),
    );
    return {
      ok: false as const,
      orderId,
      transactionId,
      reason,
      paymentMethod: input.paymentMethod,
      provider: paymentProvider,
      currency: checkoutCurrency,
      paymentReference,
      remainingBalance: account.balance.available,
      timestamp,
      telegramUsername: account.user.telegramUsername,
    };
  }
  const remainingBalance = completion.remainingBalance ?? account.balance.available;

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
      items: completion.delivered,
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
      order_items.id as order_item_id,
      order_items.quantity,
      order_items.unit_price,
      order_items.delivery_type,
      products.*
     from order_items
     inner join products on products.id = order_items.product_id
     where order_items.order_id = ?`,
    [orderId],
  );

  const drawRows = randomizedPackEngineEnabled()
    ? await queryMany(
        `select randomized_pack_draws.order_item_id,
          randomized_pack_draws.version_id,
          randomized_pack_draws.probability_bps,
          randomized_pack_draws.price_snapshot,
          randomized_pack_draws.created_at as drawn_at,
          products.*
         from randomized_pack_draws
         inner join products on products.id = randomized_pack_draws.outcome_product_id
         where randomized_pack_draws.order_id = ?`,
        [orderId],
      )
    : [];
  const drawMap = new Map(
    drawRows.map((row) => [String(row.order_item_id), row] as const),
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
    items: itemRows.map((row) => {
      const orderItemId = String(row.order_item_id);
      const sourceProduct = normalizeProduct(row);
      const draw = drawMap.get(orderItemId);
      const drawnProduct = draw ? normalizeProduct(draw) : null;
      return {
        id: orderItemId,
        quantity: Number(row.quantity),
        unitPrice: Number(row.unit_price),
        deliveryType: row.delivery_type as DeliveryType,
        product: drawnProduct ?? sourceProduct,
        packProduct: drawnProduct ? sourceProduct : null,
        randomizedDraw: draw
          ? {
              versionId: String(draw.version_id),
              probabilityBps: Number(draw.probability_bps),
              priceSnapshot: Number(draw.price_snapshot),
              drawnAt: String(draw.drawn_at),
            }
          : null,
      };
    }),
    transaction: transactionRow ? normalizeTransaction(transactionRow) : null,
    transactionMeta: transactionRow
      ? fromJson<Record<string, unknown>>(transactionRow.meta_json)
      : null,
  };
}

export async function getAdminStats() {
  await ensureDatabase();
  const [revenue, orders, users, pendingOrders] = await Promise.all([
    queryOne("select coalesce(sum(total), 0) as value from orders where payment_state = 'completed'"),
    queryOne("select count(*) as value from orders"),
    queryOne("select count(*) as value from profiles where role = 'user'"),
    queryOne(
      `select count(*) as value
       from orders
       where payment_state in ('pending', 'processing')`,
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
      label: "Pending orders",
      value: `${Number(pendingOrders?.value ?? 0)}`,
      change: "Review",
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

export async function getAdminRandomizedPackVersions() {
  await ensureDatabase();
  return Promise.all(
    RANDOMIZED_PACK_POLICIES.map(async (policy) => {
      const packRow = await queryOne(
        "select id, title, status from products where id = ? and archived = 0 limit 1",
        [policy.productId],
      );
      const versionRows = await queryMany(
        `select randomized_pack_versions.*,
          (select count(*) from randomized_pack_outcomes
           where randomized_pack_outcomes.version_id = randomized_pack_versions.id) as outcome_count
         from randomized_pack_versions
         where pack_product_id = ?
         order by version desc limit 5`,
        [policy.productId],
      );
      const current = versionRows.find((row) => String(row.status) === "published") ?? null;
      const outcomeRows = current
        ? await queryMany(
            `select randomized_pack_outcomes.probability_bps,
              randomized_pack_outcomes.price_snapshot, products.id, products.title,
              products.stock, products.status, products.archived
             from randomized_pack_outcomes
             inner join products on products.id = randomized_pack_outcomes.outcome_product_id
             where randomized_pack_outcomes.version_id = ?
             order by randomized_pack_outcomes.ordinal asc`,
            [String(current.id)],
          )
        : [];
      const errors: string[] = [];
      if (!packRow) errors.push("Pack product is missing.");
      if (packRow && String(packRow.status) !== "active") {
        errors.push("Pack sales are paused.");
      }
      if (!current) errors.push("No valid published probability version.");
      if (
        current &&
        (Number(current.total_probability_bps) !== 10_000 ||
          outcomeRows.reduce((total, row) => total + Number(row.probability_bps), 0) !== 10_000)
      ) {
        errors.push("Published probabilities do not total 100%.");
      }
      const availableOutcomeCount = outcomeRows.filter(
        (row) =>
          Number(row.stock) > 0 &&
          Number(row.archived) === 0 &&
          String(row.status) === "active",
      ).length;
      if (current && availableOutcomeCount < 2) {
        errors.push("The published pool has fewer than two available cards.");
      }
      return {
        productId: policy.productId,
        title: packRow ? String(packRow.title) : policy.publicTitle,
        productStatus: packRow ? String(packRow.status) : "missing",
        current: current
          ? {
              id: String(current.id),
              version: Number(current.version),
              expectedValue: Number(current.expected_value),
              bigWinProbabilityBps: Number(current.big_win_probability_bps),
              totalProbabilityBps: Number(current.total_probability_bps),
              publishedAt: current.published_at ? String(current.published_at) : null,
              outcomes: outcomeRows.map((row) => ({
                productId: String(row.id),
                title: String(row.title),
                stock: Number(row.stock),
                priceSnapshot: Number(row.price_snapshot),
                probabilityBps: Number(row.probability_bps),
              })),
            }
          : null,
        history: versionRows.map((row) => ({
          id: String(row.id),
          version: Number(row.version),
          status: String(row.status),
          outcomeCount: Number(row.outcome_count),
          publishedAt: row.published_at ? String(row.published_at) : null,
        })),
        errors,
      };
    }),
  );
}

type AdminAuditInput = {
  adminId: string;
  targetUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function requireReason(value: unknown) {
  const reason = normalizeEditableOptionalString(value);
  if (reason.length < 3) {
    throw new Error("Reason is required.");
  }
  return reason;
}

function normalizePositiveAmount(value: unknown, label: string) {
  const amount = normalizeEditableDepositLimit(value, label);
  if (amount <= 0) {
    throw new Error(`${label} must be greater than 0.`);
  }
  return amount;
}

function normalizePositiveQuantity(value: unknown) {
  const quantity = Number(
    typeof value === "string" ? value.trim() : value,
  );
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive integer.");
  }
  return quantity;
}

function normalizeOptionalPastIsoDate(value: unknown, label: string) {
  const raw = normalizeEditableOptionalString(value);
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} is invalid.`);
  }
  if (date.getTime() > Date.now()) {
    throw new Error(`${label} cannot be in the future.`);
  }
  return date.toISOString();
}

async function insertAdminAuditLog(input: AdminAuditInput) {
  await ensureAdminUserManagementTables();
  await execute(
    `insert into admin_audit_logs (
      id, admin_id, target_user_id, action, entity_type, entity_id,
      before_json, after_json, reason, ip_address, user_agent, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.adminId,
      input.targetUserId ?? null,
      input.action,
      input.entityType,
      input.entityId,
      input.before ? toJson(input.before) : null,
      input.after ? toJson(input.after) : null,
      input.reason,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      nowIso(),
    ],
  );
}

async function getBalanceRowForUser(userId: string) {
  const row = await queryOne("select * from balances where user_id = ? limit 1", [userId]);
  if (!row) {
    throw new Error("User balance not found.");
  }
  return row;
}

async function getProductRowForAdmin(productId: string) {
  const row = await queryOne(
    "select * from products where id = ? and archived = 0 limit 1",
    [productId],
  );
  if (!row) {
    throw new Error("Product not found.");
  }
  return row;
}

export async function getAdminUserDetail(userId: string) {
  await ensureDatabase();
  await ensureAdminUserManagementTables();
  return getAdminUserEntryById(userId);
}

export async function getAdminUserTransactions(input: {
  userId: string;
  query?: string | null;
  type?: string | null;
  status?: string | null;
  source?: string | null;
  provider?: string | null;
  limit?: number;
}) {
  await ensureDatabase();
  await ensureAdminUserManagementTables();
  const where = ["transactions.user_id = ?"];
  const args: SqlValue[] = [input.userId];
  const query = normalizeEditableOptionalString(input.query);

  if (input.type && input.type !== "all") {
    where.push("transactions.kind = ?");
    args.push(input.type);
  }
  if (input.status && input.status !== "all") {
    where.push("transactions.status = ?");
    args.push(input.status);
  }
  if (input.source && input.source !== "all") {
    where.push("coalesce(transactions.source, 'system') = ?");
    args.push(input.source);
  }
  if (input.provider && input.provider !== "all") {
    where.push("coalesce(transactions.payment_provider, '') = ?");
    args.push(input.provider);
  }
  if (query) {
    where.push(
      `(transactions.id like ? or transactions.reference_id like ? or coalesce(transactions.transvoucher_transaction_id, '') like ? or coalesce(transactions.admin_note, '') like ? or coalesce(transactions.summary, '') like ?)`,
    );
    const like = `%${query}%`;
    args.push(like, like, like, like, like);
  }

  args.push(Math.max(1, Math.min(200, input.limit ?? 100)));
  const rows = await queryMany(
    `select transactions.*, products.title as related_product_title, orders.id as related_order
     from transactions
     left join products on products.id = transactions.related_product_id
     left join orders on orders.id = coalesce(transactions.related_order_id, transactions.reference_id)
     where ${where.join(" and ")}
     order by transactions.created_at desc
     limit ?`,
    args,
  );

  return rows.map((row) => ({
    transaction: normalizeTransaction(row),
    direction: row.direction ? String(row.direction) : inferTransactionDirection(String(row.kind)),
    source: row.source ? String(row.source) : "system",
    balanceBefore:
      row.balance_before === null || row.balance_before === undefined
        ? null
        : Number(row.balance_before),
    balanceAfter:
      row.balance_after === null || row.balance_after === undefined
        ? null
        : Number(row.balance_after),
    adminNote: row.admin_note ? String(row.admin_note) : null,
    supportNote: row.support_note ? String(row.support_note) : null,
    visibleDescription: row.visible_description ? String(row.visible_description) : null,
    relatedProductId: row.related_product_id ? String(row.related_product_id) : null,
    relatedProductTitle: row.related_product_title ? String(row.related_product_title) : null,
    relatedOrderId: row.related_order_id
      ? String(row.related_order_id)
      : row.related_order
        ? String(row.related_order)
        : null,
  }));
}

function inferTransactionDirection(kind: string) {
  if (["deposit", "refund", "manual_credit", "product_remove"].includes(kind)) {
    return "credit";
  }
  if (["withdrawal", "purchase", "manual_debit", "product_grant"].includes(kind)) {
    return "debit";
  }
  return "neutral";
}

export async function getAdminUserInventory(userId: string) {
  await ensureDatabase();
  await ensureAdminUserManagementTables();
  const rows = await queryMany(
    `select
      owned_cards.id as inventory_id,
      owned_cards.quantity,
      owned_cards.order_id,
      owned_cards.acquired_at,
      owned_cards.status as inventory_status,
      owned_cards.acquisition_source,
      owned_cards.removed_at,
      owned_cards.delivery_mode,
      owned_cards.admin_note,
      owned_cards.visible_user_note,
      owned_cards.related_transaction_id,
      owned_cards.related_order_id,
      products.*
     from owned_cards
     inner join products on products.id = owned_cards.product_id
     where owned_cards.user_id = ?
     order by owned_cards.acquired_at desc`,
    [userId],
  );

  return rows.map((row) => ({
    inventoryId: String(row.inventory_id),
    quantity: Number(row.quantity),
    orderId: String(row.related_order_id ?? row.order_id ?? ""),
    acquiredAt: String(row.acquired_at),
    status: row.inventory_status ? String(row.inventory_status) : "active",
    acquisitionSource: row.acquisition_source
      ? String(row.acquisition_source)
      : "purchase",
    removedAt: row.removed_at ? String(row.removed_at) : null,
    deliveryMode: row.delivery_mode ? String(row.delivery_mode) : "digital",
    adminNote: row.admin_note ? String(row.admin_note) : null,
    visibleUserNote: row.visible_user_note ? String(row.visible_user_note) : null,
    relatedTransactionId: row.related_transaction_id
      ? String(row.related_transaction_id)
      : null,
    product: normalizeProduct(row),
  }));
}

export async function searchAdminProducts(input: {
  query?: string | null;
  limit?: number;
}) {
  await ensureDatabase();
  const query = normalizeEditableOptionalString(input.query);
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const rows = query
    ? await queryMany(
        `select * from products
         where archived = 0
           and (id like ? or title like ? or collection like ? or category like ? or edition like ?)
         order by status = 'active' desc, title asc
         limit ?`,
        [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, limit],
      )
    : await queryMany(
        `select * from products
         where archived = 0
         order by status = 'active' desc, homepage_featured desc, updated_at desc
         limit ?`,
        [limit],
      );

  return rows.map((row) => normalizeProduct(row));
}

export async function getAdminUserAuditLog(userId: string, limit = 100) {
  await ensureDatabase();
  await ensureAdminUserManagementTables();
  const rows = await queryMany(
    `select admin_audit_logs.*, users.username as admin_username
     from admin_audit_logs
     left join users on users.id = admin_audit_logs.admin_id
     where admin_audit_logs.target_user_id = ?
     order by admin_audit_logs.created_at desc
     limit ?`,
    [userId, Math.max(1, Math.min(200, limit))],
  );

  return rows.map((row) => ({
    id: String(row.id),
    adminId: String(row.admin_id),
    adminUsername: row.admin_username ? String(row.admin_username) : "Admin",
    targetUserId: row.target_user_id ? String(row.target_user_id) : null,
    action: String(row.action),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    before: fromJson<Record<string, unknown>>(row.before_json),
    after: fromJson<Record<string, unknown>>(row.after_json),
    reason: String(row.reason),
    ipAddress: row.ip_address ? String(row.ip_address) : null,
    userAgent: row.user_agent ? String(row.user_agent) : null,
    createdAt: String(row.created_at),
  }));
}

export async function adminAdjustUserBalance(input: {
  adminUserId: string;
  targetUserId: string;
  adjustmentType: unknown;
  amount: unknown;
  currency?: unknown;
  reason: unknown;
  internalNote?: unknown;
  visibleUserNote?: unknown;
  linkedTransactionId?: unknown;
  linkedOrderId?: unknown;
  ipAddress?: string;
  userAgent?: string;
}) {
  await ensureDatabase();
  const admin = await getAdminIdentity(input.adminUserId);
  const target = await getAdminUserEntryById(input.targetUserId);
  if (!target) {
    throw new Error("User not found.");
  }

  const type = String(input.adjustmentType);
  if (type !== "credit" && type !== "debit") {
    throw new Error("Adjustment type must be credit or debit.");
  }
  const amount = normalizePositiveAmount(input.amount, "Amount");
  const reason = requireReason(input.reason);
  const currency = (normalizeEditableOptionalString(input.currency) || "USD") as SupportedCurrency;
  if (currency !== "USD" && currency !== "EUR") {
    throw new Error("Unsupported currency.");
  }

  const balanceRow = await getBalanceRowForUser(input.targetUserId);
  const balanceBefore = Number(balanceRow.available);
  const balanceAfter =
    type === "credit" ? balanceBefore + amount : balanceBefore - amount;
  if (balanceAfter < 0) {
    throw new Error("Debit cannot make user balance negative.");
  }

  const timestamp = nowIso();
  const transactionId = createReadableId("TXN");
  const kind = type === "credit" ? "manual_credit" : "manual_debit";
  const direction = type === "credit" ? "credit" : "debit";
  const summary =
    normalizeEditableOptionalString(input.visibleUserNote) ||
    (type === "credit" ? "Manual balance credit" : "Manual balance debit");

  await execute(
    `insert into transactions (
      id, user_id, kind, amount, original_amount, original_currency, display_currency,
      credited_amount_usd, exchange_rate, payment_method, payment_provider, status,
      reference_id, summary, meta_json, created_at, updated_at, processed_at, credited_at,
      direction, balance_before, balance_after, source, admin_note, support_note,
      visible_description, related_order_id, edited_by_admin_id, edited_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      transactionId,
      input.targetUserId,
      kind,
      amount,
      amount,
      currency,
      currency,
      currency === "USD" ? amount : null,
      currency === "USD" ? 1 : null,
      "Admin Adjustment",
      "Admin",
      "completed",
      normalizeEditableNullableString(input.linkedTransactionId) ?? transactionId,
      summary,
      toJson({ reason, linkedTransactionId: normalizeEditableNullableString(input.linkedTransactionId) }),
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      direction,
      balanceBefore,
      balanceAfter,
      "admin_action",
      normalizeEditableNullableString(input.internalNote),
      null,
      normalizeEditableNullableString(input.visibleUserNote),
      normalizeEditableNullableString(input.linkedOrderId),
      admin.id,
      timestamp,
    ],
  );
  await execute(
    `update balances set available = ?, updated_at = ? where user_id = ?`,
    [balanceAfter, timestamp, input.targetUserId],
  );
  await appendArchiveLedgerEntry({
    eventType: kind,
    userId: input.targetUserId,
    adminId: admin.id,
    entityType: "transaction",
    entityId: transactionId,
    relatedTransactionId: transactionId,
    title: summary,
    description: reason,
    metadata: { balanceBefore, balanceAfter, amount, direction },
  });
  await insertAdminAuditLog({
    adminId: admin.id,
    targetUserId: input.targetUserId,
    action: type === "credit" ? "balance_credit" : "balance_debit",
    entityType: "transaction",
    entityId: transactionId,
    before: { available: balanceBefore },
    after: { available: balanceAfter },
    reason,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return getAdminUserDetail(input.targetUserId);
}

export async function adminAddProductToUser(input: {
  adminUserId: string;
  targetUserId: string;
  productId: unknown;
  quantity: unknown;
  purchaseDate?: unknown;
  acquisitionSource?: unknown;
  reason: unknown;
  adminNote?: unknown;
  visibleUserNote?: unknown;
  reduceStock?: unknown;
  createTransaction?: unknown;
  chargeBalance?: unknown;
  ipAddress?: string;
  userAgent?: string;
}) {
  await ensureDatabase();
  const admin = await getAdminIdentity(input.adminUserId);
  const target = await getAdminUserEntryById(input.targetUserId);
  if (!target) {
    throw new Error("User not found.");
  }
  const productId = normalizeEditableOptionalString(input.productId);
  const productRow = await getProductRowForAdmin(productId);
  const product = normalizeProduct(productRow);
  const quantity = normalizePositiveQuantity(input.quantity);
  const reason = requireReason(input.reason);
  const reduceStock = normalizeEditableBoolean(input.reduceStock ?? true);
  const createTransaction = normalizeEditableBoolean(input.createTransaction ?? true);
  const chargeBalance = normalizeEditableBoolean(input.chargeBalance ?? true);
  const grantedTimestamp = nowIso();
  const purchaseTimestamp =
    normalizeOptionalPastIsoDate(input.purchaseDate, "Purchase date") ?? grantedTimestamp;
  const stockBefore = Number(productRow.stock);
  const stockAfter = reduceStock ? stockBefore - quantity : stockBefore;
  const purchaseAmount = Number((product.price * quantity).toFixed(2));
  const balanceRow = await getBalanceRowForUser(input.targetUserId);
  const balanceBefore = Number(balanceRow.available);
  const balanceAfter = chargeBalance
    ? Number((balanceBefore - purchaseAmount).toFixed(2))
    : balanceBefore;
  if (reduceStock && stockAfter < 0) {
    throw new Error("Product stock is not sufficient.");
  }
  if (chargeBalance && balanceAfter < 0) {
    throw new Error("User balance is not sufficient for this store purchase.");
  }

  const existingRow = await queryOne(
    `select * from owned_cards
     where user_id = ? and product_id = ? and coalesce(status, 'active') = 'active'
     limit 1`,
    [input.targetUserId, productId],
  );
  const quantityBefore = existingRow ? Number(existingRow.quantity) : 0;
  const quantityAfter = quantityBefore + quantity;
  const inventoryId = existingRow ? String(existingRow.id) : randomUUID();
  const orderId = createReadableId("ORD");
  const transactionId = createTransaction ? createReadableId("TXN") : null;
  const nextAcquiredAt =
    existingRow && String(existingRow.acquired_at) < purchaseTimestamp
      ? String(existingRow.acquired_at)
      : purchaseTimestamp;

  if (existingRow) {
    await execute(
      `update owned_cards set
        quantity = ?, order_id = ?, acquired_at = ?, acquisition_source = ?,
        admin_note = ?, visible_user_note = ?, related_transaction_id = coalesce(?, related_transaction_id),
        related_order_id = ?, updated_at = ?
       where id = ?`,
      [
        quantityAfter,
        orderId,
        nextAcquiredAt,
        normalizeEditableOptionalString(input.acquisitionSource) ||
          (chargeBalance ? "store_checkout" : "admin_grant"),
        normalizeEditableNullableString(input.adminNote),
        normalizeEditableNullableString(input.visibleUserNote),
        transactionId,
        orderId,
        grantedTimestamp,
        inventoryId,
      ],
    );
  } else {
    await execute(
      `insert into owned_cards (
        id, user_id, product_id, order_id, quantity, acquired_at, status,
        acquisition_source, delivery_mode, admin_note, visible_user_note,
        related_transaction_id, related_order_id, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        inventoryId,
        input.targetUserId,
        productId,
        orderId,
        quantity,
        purchaseTimestamp,
        "active",
        normalizeEditableOptionalString(input.acquisitionSource) ||
          (chargeBalance ? "store_checkout" : "admin_grant"),
        product.defaultDeliveryType,
        normalizeEditableNullableString(input.adminNote),
        normalizeEditableNullableString(input.visibleUserNote),
        transactionId,
        orderId,
        grantedTimestamp,
      ],
    );
  }

  await execute(
    `insert into orders (
      id, user_id, status, payment_state, subtotal, shipping, total, currency,
      shipping_name, shipping_email, shipping_address, shipping_city,
      shipping_postal_code, payment_method, payment_provider,
      failure_reason, remaining_balance, created_at, updated_at, paid_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      input.targetUserId,
      "Completed",
      "completed",
      purchaseAmount,
      0,
      purchaseAmount,
      product.currency,
      target.user.name || target.user.username,
      target.user.email,
      "Digital delivery",
      "Archive",
      "00000",
      chargeBalance ? "Archive Balance" : "Admin Grant",
      chargeBalance ? "Internal Wallet" : "Admin",
      null,
      chargeBalance ? balanceAfter : balanceBefore,
      purchaseTimestamp,
      grantedTimestamp,
      purchaseTimestamp,
    ],
  );

  await execute(
    `insert into order_items (
      id, order_id, product_id, quantity, unit_price, delivery_type
    ) values (?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      orderId,
      productId,
      quantity,
      product.price,
      product.defaultDeliveryType,
    ],
  );

  if (reduceStock) {
    await execute("update products set stock = ?, updated_at = ? where id = ?", [
      stockAfter,
      grantedTimestamp,
      productId,
    ]);
    if (randomizedPackEngineEnabled()) {
      await rebuildAllRandomizedPackVersions();
    }
    await execute(
      `insert into product_inventory_movements (
        id, product_id, movement_type, quantity_delta, stock_before, stock_after,
        reason, source, admin_id, user_id, related_user_inventory_id,
        related_transaction_id, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        productId,
        "admin_grant",
        -quantity,
        stockBefore,
        stockAfter,
        reason,
        chargeBalance ? "store_checkout" : "admin_action",
        admin.id,
        input.targetUserId,
        inventoryId,
        transactionId,
        purchaseTimestamp,
      ],
    );
  }

  if (transactionId) {
    await execute(
      `insert into transactions (
        id, user_id, kind, amount, original_amount, original_currency,
        display_currency, credited_amount_usd, exchange_rate, payment_method,
        payment_provider, status, reference_id, summary, meta_json, created_at,
        updated_at, processed_at, credited_at, direction, balance_before,
        balance_after, source, admin_note, visible_description, related_product_id,
        edited_by_admin_id, edited_at, related_order_id
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionId,
        input.targetUserId,
        "product_grant",
        chargeBalance ? purchaseAmount : 0,
        chargeBalance ? purchaseAmount : 0,
        product.currency,
        product.currency,
        product.currency === "USD" && chargeBalance ? purchaseAmount : null,
        product.currency === "USD" ? 1 : null,
        "Archive Balance",
        "Store Checkout",
        "completed",
        orderId,
        chargeBalance ? `Purchased: ${product.title}` : `Product added: ${product.title}`,
        toJson({
          reason,
          quantity,
          stockImpact: reduceStock,
          purchaseAmount,
          balanceBefore,
          balanceAfter,
          chargedBalance: chargeBalance,
          purchaseDate: purchaseTimestamp,
          grantedAt: grantedTimestamp,
          orderId,
          inventoryId,
        }),
        purchaseTimestamp,
        grantedTimestamp,
        purchaseTimestamp,
        chargeBalance ? purchaseTimestamp : null,
        chargeBalance ? "debit" : "neutral",
        chargeBalance ? balanceBefore : null,
        chargeBalance ? balanceAfter : null,
        chargeBalance ? "store_checkout" : "admin_action",
        normalizeEditableNullableString(input.adminNote),
        normalizeEditableNullableString(input.visibleUserNote),
        productId,
        admin.id,
        grantedTimestamp,
        orderId,
      ],
    );
    if (chargeBalance) {
      await execute(
        "update balances set available = ?, total_spent = total_spent + ?, updated_at = ? where user_id = ?",
        [balanceAfter, purchaseAmount, grantedTimestamp, input.targetUserId],
      );
      await appendArchiveLedgerEntry({
        eventType: "purchase",
        userId: input.targetUserId,
        adminId: admin.id,
        entityType: "transaction",
        entityId: transactionId,
        relatedOrderId: orderId,
        relatedTransactionId: transactionId,
        relatedProductId: productId,
        title: `Purchased: ${product.title}`,
        description: reason,
        metadata: {
          quantity,
          purchaseAmount,
          balanceBefore,
          balanceAfter,
          source: "store_checkout",
          purchaseDate: purchaseTimestamp,
          grantedAt: grantedTimestamp,
        },
        createdAt: purchaseTimestamp,
      });
    }
  }

  await execute(
    `insert into user_inventory_ledger (
      id, user_id, product_id, user_inventory_id, action_type, quantity_delta,
      quantity_before, quantity_after, stock_before, stock_after, reason,
      admin_note, visible_user_note, source, created_by_admin_id, created_at,
      related_transaction_id, related_order_id
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.targetUserId,
      productId,
      inventoryId,
      quantityBefore === 0 ? "admin_add" : "admin_increase",
      quantity,
      quantityBefore,
      quantityAfter,
      stockBefore,
      stockAfter,
      reason,
      normalizeEditableNullableString(input.adminNote),
      normalizeEditableNullableString(input.visibleUserNote),
      chargeBalance
        ? "store_checkout"
        : reduceStock
          ? "admin_grant"
          : "admin_grant_no_stock_impact",
      admin.id,
      purchaseTimestamp,
      transactionId,
      orderId,
    ],
  );
  await insertAdminAuditLog({
    adminId: admin.id,
    targetUserId: input.targetUserId,
    action: "ADMIN_GRANTED_PRODUCT",
    entityType: "owned_cards",
    entityId: inventoryId,
    before: { quantity: quantityBefore, stock: stockBefore },
    after: {
      quantity: quantityAfter,
      stock: stockAfter,
      productId,
      orderId,
      transactionId,
      purchaseDate: purchaseTimestamp,
      grantedAt: grantedTimestamp,
    },
    reason,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return {
    detail: await getAdminUserDetail(input.targetUserId),
    inventory: await getAdminUserInventory(input.targetUserId),
    transactions: await getAdminUserTransactions({ userId: input.targetUserId, limit: 100 }),
  };
}

export async function adminChangeUserInventoryQuantity(input: {
  adminUserId: string;
  targetUserId: string;
  inventoryId: string;
  action: "increase" | "decrease" | "remove";
  quantity?: unknown;
  reason: unknown;
  adminNote?: unknown;
  visibleUserNote?: unknown;
  returnStock?: unknown;
  reduceStock?: unknown;
  ipAddress?: string;
  userAgent?: string;
}) {
  await ensureDatabase();
  const admin = await getAdminIdentity(input.adminUserId);
  const reason = requireReason(input.reason);
  const row = await queryOne(
    `select owned_cards.*, products.stock, products.title
     from owned_cards
     inner join products on products.id = owned_cards.product_id
     where owned_cards.id = ? and owned_cards.user_id = ?
     limit 1`,
    [input.inventoryId, input.targetUserId],
  );
  if (!row) {
    throw new Error("User inventory item not found.");
  }

  const quantityBefore = Number(row.quantity);
  const productId = String(row.product_id);
  const stockBefore = Number(row.stock);
  const timestamp = nowIso();
  let delta = 0;
  let quantityAfter = quantityBefore;
  let stockAfter = stockBefore;
  let nextStatus = row.status ? String(row.status) : "active";
  const requestedQuantity =
    input.action === "remove"
      ? quantityBefore
      : normalizePositiveQuantity(input.quantity ?? 1);

  if (input.action === "increase") {
    delta = requestedQuantity;
    quantityAfter = quantityBefore + requestedQuantity;
    if (normalizeEditableBoolean(input.reduceStock ?? true)) {
      stockAfter = stockBefore - requestedQuantity;
      if (stockAfter < 0) {
        throw new Error("Product stock is not sufficient.");
      }
    }
  } else {
    delta = -requestedQuantity;
    quantityAfter = quantityBefore - requestedQuantity;
    if (quantityAfter < 0) {
      throw new Error("Quantity cannot go below zero.");
    }
    if (normalizeEditableBoolean(input.returnStock ?? false)) {
      stockAfter = stockBefore + requestedQuantity;
    }
    if (quantityAfter === 0 || input.action === "remove") {
      quantityAfter = Math.max(0, quantityAfter);
      nextStatus = "removed";
    }
  }

  await execute(
    `update owned_cards set
      quantity = ?, status = ?, removed_at = ?, admin_note = ?, visible_user_note = ?,
      updated_at = ?
     where id = ?`,
    [
      quantityAfter,
      nextStatus,
      nextStatus === "removed" ? timestamp : null,
      normalizeEditableNullableString(input.adminNote),
      normalizeEditableNullableString(input.visibleUserNote),
      timestamp,
      input.inventoryId,
    ],
  );
  if (stockAfter !== stockBefore) {
    await execute("update products set stock = ?, updated_at = ? where id = ?", [
      stockAfter,
      timestamp,
      productId,
    ]);
    if (randomizedPackEngineEnabled()) {
      await rebuildAllRandomizedPackVersions();
    }
    await execute(
      `insert into product_inventory_movements (
        id, product_id, movement_type, quantity_delta, stock_before, stock_after,
        reason, source, admin_id, user_id, related_user_inventory_id, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        productId,
        input.action === "increase" ? "admin_grant" : "admin_return",
        stockAfter - stockBefore,
        stockBefore,
        stockAfter,
        reason,
        "admin_action",
        admin.id,
        input.targetUserId,
        input.inventoryId,
        timestamp,
      ],
    );
  }

  const transactionId = createReadableId("TXN");
  await execute(
    `insert into transactions (
      id, user_id, kind, amount, payment_method, payment_provider, status,
      reference_id, summary, meta_json, created_at, updated_at, processed_at,
      direction, source, admin_note, visible_description, related_product_id,
      edited_by_admin_id, edited_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      transactionId,
      input.targetUserId,
      input.action === "remove" ? "product_remove" : "product_quantity_adjustment",
      0,
      "Admin Inventory",
      "Admin",
      "completed",
      input.inventoryId,
      `${input.action === "increase" ? "Increased" : input.action === "decrease" ? "Decreased" : "Removed"} product: ${String(row.title)}`,
      toJson({ reason, quantityDelta: delta, quantityBefore, quantityAfter }),
      timestamp,
      timestamp,
      timestamp,
      "neutral",
      "admin_action",
      normalizeEditableNullableString(input.adminNote),
      normalizeEditableNullableString(input.visibleUserNote),
      productId,
      admin.id,
      timestamp,
    ],
  );
  await execute(
    `insert into user_inventory_ledger (
      id, user_id, product_id, user_inventory_id, action_type, quantity_delta,
      quantity_before, quantity_after, stock_before, stock_after, reason,
      admin_note, visible_user_note, source, created_by_admin_id, created_at,
      related_transaction_id
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.targetUserId,
      productId,
      input.inventoryId,
      input.action === "increase"
        ? "admin_increase"
        : input.action === "decrease"
          ? "admin_decrease"
          : "admin_remove",
      delta,
      quantityBefore,
      quantityAfter,
      stockBefore,
      stockAfter,
      reason,
      normalizeEditableNullableString(input.adminNote),
      normalizeEditableNullableString(input.visibleUserNote),
      "admin_action",
      admin.id,
      timestamp,
      transactionId,
    ],
  );
  await insertAdminAuditLog({
    adminId: admin.id,
    targetUserId: input.targetUserId,
    action:
      input.action === "increase"
        ? "product_quantity_increase"
        : input.action === "decrease"
          ? "product_quantity_decrease"
          : "product_remove_from_user",
    entityType: "owned_cards",
    entityId: input.inventoryId,
    before: { quantity: quantityBefore, status: row.status ?? "active", stock: stockBefore },
    after: { quantity: quantityAfter, status: nextStatus, stock: stockAfter },
    reason,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return {
    inventory: await getAdminUserInventory(input.targetUserId),
    auditLog: await getAdminUserAuditLog(input.targetUserId),
  };
}

export async function adminUpdateTransaction(input: {
  adminUserId: string;
  transactionId: string;
  status?: unknown;
  paymentProvider?: unknown;
  source?: unknown;
  adminNote?: unknown;
  supportNote?: unknown;
  visibleDescription?: unknown;
  relatedProductId?: unknown;
  relatedOrderId?: unknown;
  reason: unknown;
  ipAddress?: string;
  userAgent?: string;
}) {
  await ensureDatabase();
  const admin = await getAdminIdentity(input.adminUserId);
  const currentRow = await queryOne("select * from transactions where id = ? limit 1", [
    input.transactionId,
  ]);
  if (!currentRow) {
    throw new Error("Transaction not found.");
  }
  const reason = requireReason(input.reason);
  const status = normalizeEditableOptionalString(input.status) || String(currentRow.status);
  const allowedStatuses = [
    "pending",
    "completed",
    "failed",
    "canceled",
    "refunded",
    "chargeback",
    "reversed",
    "manually_adjusted",
  ];
  if (!allowedStatuses.includes(status)) {
    throw new Error("Unsupported transaction status.");
  }
  const paymentProvider =
    normalizeEditableOptionalString(input.paymentProvider) ||
    (currentRow.payment_provider ? String(currentRow.payment_provider) : null);
  const allowedProviders = [
    "Store Checkout",
    "Internal Wallet",
    "TransVoucher",
    "Cleffo",
    "Wert.io",
    "Coinflow",
    "Admin",
  ];
  if (paymentProvider && !allowedProviders.includes(paymentProvider)) {
    throw new Error("Unsupported payment provider.");
  }
  const source =
    normalizeEditableOptionalString(input.source) ||
    (currentRow.source ? String(currentRow.source) : "system");
  const allowedSources = [
    "store_checkout",
    "user_action",
    "provider_webhook",
    "provider_api_sync",
    "admin_action",
    "system",
    "migration",
  ];
  if (!allowedSources.includes(source)) {
    throw new Error("Unsupported transaction source.");
  }

  const timestamp = nowIso();
  await execute(
    `update transactions set
      status = ?, payment_provider = ?, source = ?, admin_note = ?, support_note = ?, visible_description = ?,
      related_product_id = ?, related_order_id = ?, edited_by_admin_id = ?,
      edited_at = ?, updated_at = ?
     where id = ?`,
    [
      status,
      paymentProvider,
      source,
      normalizeEditableNullableString(input.adminNote),
      normalizeEditableNullableString(input.supportNote),
      normalizeEditableNullableString(input.visibleDescription),
      normalizeEditableNullableString(input.relatedProductId),
      normalizeEditableNullableString(input.relatedOrderId),
      admin.id,
      timestamp,
      timestamp,
      input.transactionId,
    ],
  );
  await insertAdminAuditLog({
    adminId: admin.id,
    targetUserId: String(currentRow.user_id),
    action: "transaction_update",
    entityType: "transaction",
    entityId: input.transactionId,
    before: {
      status: currentRow.status,
      paymentProvider: currentRow.payment_provider ?? null,
      source: currentRow.source ?? null,
      adminNote: currentRow.admin_note ?? null,
      supportNote: currentRow.support_note ?? null,
    },
    after: {
      status,
      paymentProvider,
      source,
      adminNote: normalizeEditableNullableString(input.adminNote),
      supportNote: normalizeEditableNullableString(input.supportNote),
    },
    reason,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return getAdminUserTransactions({ userId: String(currentRow.user_id), limit: 100 });
}

export async function getAdminUsers() {
  return withPerf("query=getAdminUsers", async () => {
  await ensureDatabase();
  await ensurePaymentProviderRegistry();
  const rows = await queryMany(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.telegram_chat_id, profiles.telegram_verified, profiles.telegram_verified_at,
      profiles.withdrawal_wallet, profiles.payment_phone, profiles.gate2_first_name, profiles.gate2_last_name, profiles.gate2_phone, profiles.gate2_details_updated_at, profiles.verified,
      balances.available, balances.pending_withdrawal, balances.total_deposited,
      balances.total_spent, balances.total_withdrawn,
      balances.payout_bonus_override_enabled, balances.payout_bonus_percent,
      balances.updated_at as balance_updated_at
     from users
     inner join profiles on profiles.user_id = users.id
     inner join balances on balances.user_id = users.id
     order by users.created_at desc`,
  );

  if (rows.length === 0) {
    return [];
  }

  const userIds = rows.map((row) => String(row.id));
  const placeholders = userIds.map(() => "?").join(", ");
  const [kycRows, providerRows, gateAccessRows] = await Promise.all([
    queryMany(
      `select * from user_kyc_profiles where user_id in (${placeholders})`,
      userIds,
    ),
    queryMany(
      `select * from payment_providers
       order by priority asc, gate_number asc`,
    ),
    queryMany(
      `select * from user_payment_gate_access where user_id in (${placeholders})`,
      userIds,
    ),
  ]);

  const kycByUserId = new Map(
    kycRows.map((row) => [String(row.user_id), normalizeUserKycProfile(row)]),
  );
  const accessByUserAndProvider = new Map(
    gateAccessRows.map((row) => [
      `${String(row.user_id)}:${String(row.provider_key)}`,
      row,
    ]),
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
        payout_bonus_override_enabled: row.payout_bonus_override_enabled,
        payout_bonus_percent: row.payout_bonus_percent,
        updated_at: row.balance_updated_at,
      }),
      kycProfile: kycByUserId.get(String(row.id)) ?? null,
      paymentGateAccess: providerRows.map((providerRow) => {
        const accessRow = accessByUserAndProvider.get(
          `${String(row.id)}:${String(providerRow.provider_key)}`,
        );
        return normalizePaymentGateAccess({
          ...providerRow,
          user_access_enabled: accessRow?.enabled ?? null,
          reason: accessRow?.reason ?? null,
          access_updated_at: accessRow?.updated_at ?? null,
        });
      }),
    }));
  });
}

export async function getPaymentReconciliationStatus(): Promise<PaymentReconciliationStatus> {
  return withPerf("query=getPaymentReconciliationStatus", async () => {
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
  });
}

async function getAdminUserEntryById(userId: string) {
  const row = await queryOne(
    `select users.*, profiles.role, profiles.telegram_username, profiles.telegram_id,
      profiles.telegram_chat_id, profiles.telegram_verified, profiles.telegram_verified_at,
      profiles.withdrawal_wallet, profiles.payment_phone, profiles.gate2_first_name, profiles.gate2_last_name, profiles.gate2_phone, profiles.gate2_details_updated_at, profiles.verified,
      balances.available, balances.pending_withdrawal, balances.total_deposited,
      balances.total_spent, balances.total_withdrawn,
      balances.payout_bonus_override_enabled, balances.payout_bonus_percent,
      balances.updated_at as balance_updated_at
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
      payout_bonus_override_enabled: row.payout_bonus_override_enabled,
      payout_bonus_percent: row.payout_bonus_percent,
      updated_at: row.balance_updated_at,
    }),
    kycProfile: await getUserKycProfile(String(row.id)),
    paymentGateAccess: await getUserPaymentGateAccess(String(row.id)),
  };
}

function normalizeEditableMoney(value: unknown, label: string) {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${label} must be a valid non-negative number.`);
  }

  return Number(numberValue.toFixed(2));
}

function normalizeEditablePercent(value: unknown, label: string) {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 100) {
    throw new Error(`${label} must be between 0 and 100.`);
  }

  return Math.floor(numberValue);
}

function normalizeEditableDepositLimit(value: unknown, label: string) {
  const raw = typeof value === "string" ? value.trim() : value;
  const numberValue =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.length > 0
        ? Number(raw)
        : Number.NaN;

  if (!Number.isFinite(numberValue)) {
    throw new Error(`${label} must be a valid number.`);
  }

  if (numberValue <= 0) {
    throw new Error(`${label} must be greater than 0.`);
  }

  if (!/^\d+(\.\d{1,2})?$/.test(String(raw))) {
    throw new Error(`${label} can use up to 2 decimal places.`);
  }

  return Number(numberValue.toFixed(2));
}

function normalizeEditableOptionalDepositLimit(value: unknown, label: string) {
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  return normalizeEditableDepositLimit(raw, label);
}

function normalizeEditableOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEditableNullableString(value: unknown) {
  const next = normalizeEditableOptionalString(value);
  return next.length > 0 ? next : null;
}

function normalizeEditableBoolean(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function normalizeEditableDateTime(value: unknown, label: string) {
  const next = normalizeEditableOptionalString(value);
  if (!next) {
    return null;
  }

  const date = new Date(next);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date/time.`);
  }

  return date.toISOString();
}

function collectChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const changed: Record<string, { before: unknown; after: unknown }> = {};

  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      changed[key] = {
        before: before[key] ?? null,
        after: after[key] ?? null,
      };
    }
  }

  return changed;
}

export async function updateAdminUserAccountData(input: {
  adminUserId: string;
  targetUserId: string;
  availableBalance: unknown;
  pendingWithdrawal: unknown;
  totalDeposited: unknown;
  totalSpent: unknown;
  totalWithdrawn: unknown;
  payoutBonusOverrideEnabled: unknown;
  payoutBonusPercent: unknown;
  telegramUsername: unknown;
  telegramId: unknown;
  telegramChatId: unknown;
  telegramVerified: unknown;
  telegramVerifiedAt: unknown;
  gate2FirstName: unknown;
  gate2LastName: unknown;
  gate2Phone: unknown;
  email: unknown;
  role: unknown;
  status: unknown;
  verificationStatus: unknown;
  requirePasswordReset: unknown;
  reason?: unknown;
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  route: string;
  timestamp: string;
}) {
  await ensureDatabase();

  const admin = await getAdminIdentity(input.adminUserId);
  const currentEntry = await getAdminUserEntryById(input.targetUserId);

  if (!currentEntry) {
    throw new Error("User not found.");
  }

  const email = normalizeEmail(normalizeEditableOptionalString(input.email));
  const role = String(input.role) as UserRole;
  const status = String(input.status) as UserStatus;
  const telegramUsername = normalizeTelegramUsername(
    normalizeEditableOptionalString(input.telegramUsername),
  );
  const telegramId = normalizeEditableNullableString(input.telegramId);
  const telegramChatId = normalizeEditableNullableString(input.telegramChatId);
  const telegramVerified = normalizeEditableBoolean(input.telegramVerified);
  const gate2Details = normalizeOptionalGate2Details({
    firstName: input.gate2FirstName,
    lastName: input.gate2LastName,
    phone: input.gate2Phone,
    username: currentEntry.user.username,
  });
  const verificationStatus = normalizeEditableBoolean(input.verificationStatus);
  const requirePasswordReset = normalizeEditableBoolean(input.requirePasswordReset);
  const payoutBonusOverrideEnabled = normalizeEditableBoolean(
    input.payoutBonusOverrideEnabled,
  );
  const payoutBonusPercent = payoutBonusOverrideEnabled
    ? normalizeEditablePercent(input.payoutBonusPercent, "Payout bonus percent")
    : null;
  const timestamp = input.timestamp || nowIso();
  const telegramVerifiedAt = telegramVerified
    ? normalizeEditableDateTime(input.telegramVerifiedAt, "Telegram verified at") ??
      currentEntry.user.telegramVerifiedAt ??
      timestamp
    : null;
  const reason = normalizeEditableOptionalString(input.reason);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (!["user", "admin"].includes(role)) {
    throw new Error("Role must be user or admin.");
  }

  if (!["active", "under_review", "frozen", "blocked", "suspended"].includes(status)) {
    throw new Error("Account status is not allowed.");
  }

  if (input.targetUserId === input.adminUserId && (role !== "admin" || status !== "active")) {
    throw new Error("You cannot remove your own admin access or block your own account.");
  }

  if (!isValidTelegramUsername(telegramUsername)) {
    throw new Error("Telegram username must start with @ and use 5-32 valid characters.");
  }

  const [emailOwner, telegramOwner] = await Promise.all([
    queryOne("select id from users where email = ? and id <> ? limit 1", [
      email,
      input.targetUserId,
    ]),
    queryOne(
      "select user_id from profiles where telegram_username = ? and user_id <> ? limit 1",
      [telegramUsername, input.targetUserId],
    ),
  ]);

  if (emailOwner) {
    throw new Error("Email is already connected to another account.");
  }

  if (telegramOwner) {
    throw new Error("Telegram username is already connected to another account.");
  }

  const nextBalance = {
    available: normalizeEditableMoney(input.availableBalance, "Available balance"),
    pendingWithdrawal: normalizeEditableMoney(input.pendingWithdrawal, "Pending withdrawals"),
    totalDeposited: normalizeEditableMoney(input.totalDeposited, "Total deposited"),
    totalSpent: normalizeEditableMoney(input.totalSpent, "Total spent"),
    totalWithdrawn: normalizeEditableMoney(input.totalWithdrawn, "Total withdrawn"),
    payoutBonusOverrideEnabled,
    payoutBonusPercent,
  };
  const currentBalance = {
    available: currentEntry.balance.available,
    pendingWithdrawal: currentEntry.balance.pendingWithdrawal,
    totalDeposited: currentEntry.balance.totalDeposited,
    totalSpent: currentEntry.balance.totalSpent,
    totalWithdrawn: currentEntry.balance.totalWithdrawn,
    payoutBonusOverrideEnabled: currentEntry.balance.payoutBonusOverrideEnabled,
    payoutBonusPercent: currentEntry.balance.payoutBonusPercent,
  };
  const financialChanges = collectChangedFields(currentBalance, nextBalance);

  if (Object.keys(financialChanges).length > 0 && !reason) {
    throw new Error("Reason is required when editing financial data.");
  }

  const currentAccount = {
    email: currentEntry.user.email,
    role: currentEntry.user.role,
    status: currentEntry.user.status,
    verificationStatus: currentEntry.user.verified,
    requirePasswordReset: currentEntry.user.requirePasswordReset,
  };
  const nextAccount = {
    email,
    role,
    status,
    verificationStatus,
    requirePasswordReset,
  };
  const currentTelegram = {
    telegramUsername: currentEntry.user.telegramUsername,
    telegramId: currentEntry.user.telegramId,
    telegramChatId: currentEntry.user.telegramChatId,
    telegramVerified: currentEntry.user.telegramVerified,
    telegramVerifiedAt: currentEntry.user.telegramVerifiedAt,
  };
  const nextTelegram = {
    telegramUsername,
    telegramId,
    telegramChatId,
    telegramVerified,
    telegramVerifiedAt,
  };
  const currentGate2 = {
    gate2FirstName: currentEntry.user.gate2FirstName,
    gate2LastName: currentEntry.user.gate2LastName,
    gate2Phone: currentEntry.user.gate2Phone ?? currentEntry.user.paymentPhone,
  };
  const nextGate2 = {
    gate2FirstName: gate2Details.firstName,
    gate2LastName: gate2Details.lastName,
    gate2Phone: gate2Details.phone,
  };
  const changedFields = {
    ...financialChanges,
    ...collectChangedFields(currentAccount, nextAccount),
    ...collectChangedFields(currentTelegram, nextTelegram),
    ...collectChangedFields(currentGate2, nextGate2),
  };

  if (Object.keys(changedFields).length === 0) {
    return currentEntry;
  }

  await execute(
    `update users set
      email = ?,
      status = ?,
      require_password_reset = ?,
      updated_at = ?
     where id = ?`,
    [
      email,
      status,
      requirePasswordReset ? 1 : 0,
      timestamp,
      input.targetUserId,
    ],
  );

  await execute(
    `update profiles set
      role = ?,
      telegram_username = ?,
      telegram_id = ?,
      telegram_chat_id = ?,
      telegram_verified = ?,
      telegram_verified_at = ?,
      telegram_linked_at = ?,
      gate2_first_name = ?,
      gate2_last_name = ?,
      gate2_phone = ?,
      payment_phone = ?,
      gate2_details_updated_at = case
        when ? = 1 then ?
        else gate2_details_updated_at
      end,
      verified = ?,
      updated_at = ?
     where user_id = ?`,
    [
      role,
      telegramUsername,
      telegramId,
      telegramChatId,
      telegramVerified ? 1 : 0,
      telegramVerifiedAt,
      telegramVerified ? telegramVerifiedAt : null,
      gate2Details.firstName,
      gate2Details.lastName,
      gate2Details.phone,
      gate2Details.phone,
      Object.keys(collectChangedFields(currentGate2, nextGate2)).length > 0 ? 1 : 0,
      timestamp,
      verificationStatus ? 1 : 0,
      timestamp,
      input.targetUserId,
    ],
  );

  await execute(
    `update balances set
      available = ?,
      pending_withdrawal = ?,
      total_deposited = ?,
      total_spent = ?,
      total_withdrawn = ?,
      payout_bonus_override_enabled = ?,
      payout_bonus_percent = ?,
      updated_at = ?
     where user_id = ?`,
    [
      nextBalance.available,
      nextBalance.pendingWithdrawal,
      nextBalance.totalDeposited,
      nextBalance.totalSpent,
      nextBalance.totalWithdrawn,
      nextBalance.payoutBonusOverrideEnabled ? 1 : 0,
      nextBalance.payoutBonusPercent,
      timestamp,
      input.targetUserId,
    ],
  );

  await logAdminAction(
    admin.id,
    "admin_user_account_data_updated",
    "user",
    input.targetUserId,
    `Updated account data for ${currentEntry.user.username}`,
    {
      metadata: {
        adminId: admin.id,
        adminUsername: admin.username,
        targetUserId: currentEntry.user.id,
        targetUsername: currentEntry.user.username,
        changedFields,
        financialChanges,
        reason: reason || null,
        effectivePayoutBonusPercent: getEffectivePayoutBonusPercent({
          totalDepositedUsd: nextBalance.totalDeposited,
          payoutBonusOverrideEnabled: nextBalance.payoutBonusOverrideEnabled,
          payoutBonusPercent: nextBalance.payoutBonusPercent,
        }),
        ipAddress: input.ipAddress,
        country: input.country,
        timestamp,
      },
    },
  );

  await insertSecurityAuditEvent({
    eventType: "admin_user_account_data_updated",
    userId: currentEntry.user.id,
    username: currentEntry.user.username,
    telegramUsername,
    role,
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp,
  });

  await appendArchiveLedgerEntry({
    eventType:
      Object.keys(financialChanges).length > 0
        ? "admin_balance_adjusted"
        : "admin_account_data_updated",
    userId: currentEntry.user.id,
    adminId: admin.id,
    entityType: "user",
    entityId: currentEntry.user.id,
    title: "Admin account data updated",
    description: `Admin ${admin.username} updated account data for ${currentEntry.user.username}.`,
    metadata: {
      changedFields,
      financialChanges,
      reason: reason || null,
      timestamp,
    },
  });

  revalidatePrivate(input.targetUserId);
  revalidateAdmin();

  return getAdminUserEntryById(input.targetUserId);
}

function buildWithdrawAccessAdminMessage(input: {
  title: string;
  admin: UserRecord;
  target: UserRecord;
  reason?: string | null;
  timestamp: string;
}) {
  return [
    `<b>${escapeTelegramHtml(input.title)}</b>`,
    "",
    `User: ${escapeTelegramHtml(input.target.username)}`,
    `Telegram: ${escapeTelegramHtml(input.target.telegramUsername || "Not provided")}`,
    `Admin: ${escapeTelegramHtml(input.admin.username)}`,
    input.reason ? `Reason: ${escapeTelegramHtml(input.reason)}` : null,
    `Time: ${escapeTelegramHtml(formatUtcDateTime(input.timestamp))} UTC`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function updateAdminUserWithdrawAccess(input: {
  adminUserId: string;
  targetUserId: string;
  enabled: boolean;
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
  const currentEntry = await getAdminUserEntryById(input.targetUserId);

  if (!currentEntry) {
    throw new Error("User not found.");
  }

  const timestamp = input.timestamp || nowIso();
  const reason = input.reason?.trim() || "";

  if (!input.enabled && !reason) {
    throw new Error("Reason is required when disabling withdraw access.");
  }

  if (currentEntry.user.withdrawAccessEnabled === input.enabled) {
    return currentEntry;
  }

  await execute(
    `update users set
      withdraw_access_enabled = ?,
      withdraw_access_disabled_at = ?,
      withdraw_access_disabled_by = ?,
      withdraw_access_disabled_reason = ?,
      withdraw_access_restored_at = ?,
      withdraw_access_restored_by = ?,
      updated_at = ?
     where id = ?`,
    input.enabled
      ? [
          1,
          null,
          null,
          null,
          timestamp,
          admin.username,
          timestamp,
          input.targetUserId,
        ]
      : [
          0,
          timestamp,
          admin.username,
          reason,
          null,
          null,
          timestamp,
          input.targetUserId,
        ],
  );

  const action = input.enabled
    ? "user_withdraw_access_enabled"
    : "user_withdraw_access_disabled";

  await logAdminAction(
    admin.id,
    action,
    "user",
    input.targetUserId,
    `${input.enabled ? "Restored" : "Disabled"} withdraw access for ${currentEntry.user.username}`,
    {
      metadata: {
        adminId: admin.id,
        adminUsername: admin.username,
        targetUserId: currentEntry.user.id,
        targetUsername: currentEntry.user.username,
        oldValue: currentEntry.user.withdrawAccessEnabled,
        newValue: input.enabled,
        reason: reason || null,
        ipAddress: input.ipAddress,
        country: input.country,
        timestamp,
      },
    },
  );

  await insertSecurityAuditEvent({
    eventType: action,
    userId: currentEntry.user.id,
    username: currentEntry.user.username,
    telegramUsername: currentEntry.user.telegramUsername,
    role: currentEntry.user.role,
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp,
  });

  await appendArchiveLedgerEntry({
    eventType: "admin_withdraw_access_updated",
    userId: currentEntry.user.id,
    adminId: admin.id,
    entityType: "user",
    entityId: currentEntry.user.id,
    title: input.enabled ? "Withdraw access restored" : "Withdraw access disabled",
    description: `Admin ${admin.username} ${input.enabled ? "restored" : "disabled"} withdraw access for ${currentEntry.user.username}.`,
    metadata: {
      oldValue: currentEntry.user.withdrawAccessEnabled,
      newValue: input.enabled,
      reason: reason || null,
      timestamp,
    },
  });

  await notifySafely(() =>
    sendTelegramAdminMessage(
      buildWithdrawAccessAdminMessage({
        title: input.enabled ? "Withdraw Access Restored" : "Withdraw Access Disabled",
        admin,
        target: currentEntry.user,
        reason: reason || null,
        timestamp,
      }),
    ),
  );

  revalidatePrivate(input.targetUserId);
  revalidateAdmin();

  return getAdminUserEntryById(input.targetUserId);
}

export async function updateAdminUserKycStatus(input: {
  adminUserId: string;
  targetUserId: string;
  action: "approve" | "decline" | "reset";
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
  const currentEntry = await getAdminUserEntryById(input.targetUserId);

  if (!currentEntry) {
    throw new Error("User not found.");
  }

  const reason = input.reason?.trim() ?? "";
  if (!reason) {
    throw new Error("Reason is required for KYC manual changes.");
  }

  const timestamp = input.timestamp || nowIso();
  const nextStatus =
    input.action === "approve"
      ? "manual_approved"
      : input.action === "decline"
        ? "manual_rejected"
        : "not_started";
  const nextVerified = input.action === "approve";

  await execute(
    `update users set
      kyc_status = ?,
      kyc_verified = ?,
      kyc_provider = case when ? = 'reset' then null else 'manual' end,
      kyc_manual_override = ?,
      kyc_manual_override_by = ?,
      kyc_manual_override_at = ?,
      kyc_manual_override_reason = ?,
      kyc_verified_at = case when ? = 1 then ? else null end,
      kyc_declined_at = case when ? = 'decline' then ? else null end,
      veriff_session_id = case when ? = 'reset' then null else veriff_session_id end,
      veriff_verification_id = case when ? = 'reset' then null else veriff_verification_id end,
      veriff_status = case when ? = 'reset' then null else veriff_status end,
      veriff_decision = case when ? = 'reset' then null else veriff_decision end,
      veriff_reason = case when ? = 'reset' then null else veriff_reason end,
      updated_at = ?
     where id = ?`,
    [
      nextStatus,
      nextVerified ? 1 : 0,
      input.action,
      input.action === "reset" ? 0 : 1,
      input.action === "reset" ? null : admin.username,
      input.action === "reset" ? null : timestamp,
      input.action === "reset" ? null : reason,
      nextVerified ? 1 : 0,
      timestamp,
      input.action,
      timestamp,
      input.action,
      input.action,
      input.action,
      input.action,
      input.action,
      timestamp,
      input.targetUserId,
    ],
  );

  if (input.action === "reset") {
    await execute("delete from user_kyc_profiles where user_id = ?", [input.targetUserId]);
  }

  const eventType =
    input.action === "approve"
      ? "kyc_manual_approved"
      : input.action === "decline"
        ? "kyc_manual_rejected"
        : "kyc_reset";

  await insertSecurityAuditEvent({
    eventType,
    userId: currentEntry.user.id,
    username: currentEntry.user.username,
    telegramUsername: currentEntry.user.telegramUsername,
    role: currentEntry.user.role,
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp,
  });
  if (input.action === "approve") {
    await insertSecurityAuditEvent({
      eventType: "admin_manual_approved",
      userId: currentEntry.user.id,
      username: currentEntry.user.username,
      telegramUsername: currentEntry.user.telegramUsername,
      role: currentEntry.user.role,
      ipAddress: input.ipAddress,
      country: input.country,
      userAgent: input.userAgent,
      language: input.language,
      route: input.route,
      timestamp,
    });
  }

  await logAdminAction(
    admin.id,
    eventType,
    "user",
    input.targetUserId,
    `Updated KYC status for ${currentEntry.user.username}`,
    {
      metadata: {
        adminId: admin.id,
        adminUsername: admin.username,
        targetUserId: currentEntry.user.id,
        targetUsername: currentEntry.user.username,
        previousStatus: currentEntry.user.kycStatus,
        nextStatus,
        previousVerified: currentEntry.user.kycVerified,
        nextVerified,
        reason,
      },
    },
  );

  revalidatePrivate(input.targetUserId);
  revalidateAdmin();

  return getAdminUserEntryById(input.targetUserId);
}

export async function syncAdminUserVeriffStatus(input: {
  adminUserId: string;
  targetUserId: string;
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  route: string;
  timestamp: string;
}) {
  await ensureDatabase();

  const admin = await getAdminIdentity(input.adminUserId);
  const currentEntry = await getAdminUserEntryById(input.targetUserId);

  if (!currentEntry) {
    throw new Error("User not found.");
  }

  if (!currentEntry.user.veriffSessionId) {
    throw new Error("This user does not have a Veriff session to sync.");
  }

  const payload = await fetchVeriffSessionStatus(currentEntry.user.veriffSessionId);
  const fields = extractVeriffWebhookFields(payload);
  const result = await applyVeriffDecisionToUser({
    userId: currentEntry.user.id,
    sessionId: fields.sessionId ?? currentEntry.user.veriffSessionId,
    verificationId: fields.verificationId ?? currentEntry.user.veriffVerificationId,
    payload,
    source: "manual_sync",
    ipAddress: input.ipAddress,
    country: input.country,
    userAgent: input.userAgent,
    language: input.language,
    route: input.route,
    timestamp: input.timestamp,
  });

  await logAdminAction(
    admin.id,
    "kyc_manual_veriff_sync",
    "user",
    input.targetUserId,
    `Synced Veriff status for ${currentEntry.user.username}`,
    {
      metadata: {
        adminId: admin.id,
        adminUsername: admin.username,
        targetUserId: currentEntry.user.id,
        targetUsername: currentEntry.user.username,
        previousStatus: currentEntry.user.kycStatus,
        nextStatus: result.status,
        previousVerified: currentEntry.user.kycVerified,
        nextVerified: result.verified,
      },
    },
  );

  return getAdminUserEntryById(input.targetUserId);
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
  return withPerf("query=getAdminWithdrawalRequests", async () => {
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

async function validateRandomizedProductConfiguration(input: {
  productId: string;
  isRandomized: boolean;
  randomizedOutcomes: ProductRecord["randomizedOutcomes"];
}) {
  if (!input.isRandomized) {
    return;
  }

  const automaticPolicy = getRandomizedPackPolicy(input.productId);
  if (automaticPolicy) {
    return;
  }

  if (randomizedPackEngineEnabled()) {
    throw new Error("This randomized product does not have an automatic pack policy.");
  }

  if (
    !hasValidRandomizedProductOdds({
      id: input.productId,
      isRandomized: input.isRandomized,
      randomizedOutcomes: input.randomizedOutcomes,
    })
  ) {
    throw new Error(
      "Randomized product probabilities must contain unique cards and total exactly 100%.",
    );
  }

  const outcomeIds = input.randomizedOutcomes.map((outcome) => outcome.productId);
  const placeholders = outcomeIds.map(() => "?").join(", ");
  const rows = await queryMany(
    `select id from products
     where id in (${placeholders})
       and archived = 0
       and status = 'active'
       and stock > 0
       and coalesce(is_randomized, 0) = 0`,
    outcomeIds,
  );

  if (rows.length !== outcomeIds.length) {
    throw new Error(
      "Every randomized outcome must reference an active, non-randomized product.",
    );
  }
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

  await validateRandomizedProductConfiguration({
    productId: id,
    isRandomized: input.isRandomized,
    randomizedOutcomes: input.isRandomized ? input.randomizedOutcomes : [],
  });

  if (input.homepageFeatured) {
    await execute(
      "update products set homepage_featured = 0, featured_started_at = null where homepage_featured = 1",
    );
  }

  await execute(
    `insert into products (
      id, title, rarity, price, currency, stock, collection, category, description,
      tagline, default_delivery_type, delivery_digital, delivery_physical, edition,
      shape, image_url, image_path, image_updated_at, featured, homepage_featured,
      featured_started_at, is_randomized, randomized_outcomes_json, showcase_float,
      showcase_rotation_seconds, status, archived, palette_glow, palette_glow_soft,
      palette_core, palette_ring, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
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
      input.isRandomized ? 1 : 0,
      toJson(input.randomizedOutcomes),
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

  if (randomizedPackEngineEnabled()) {
    await rebuildAllRandomizedPackVersions();
  }

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
    randomizedOutcomes:
      input.isRandomized === false
        ? []
        : input.randomizedOutcomes ?? current.randomizedOutcomes,
    palette: input.rarity ? getPaletteByRarity(input.rarity) : current.palette,
  };

  await validateRandomizedProductConfiguration({
    productId: id,
    isRandomized: next.isRandomized,
    randomizedOutcomes: next.randomizedOutcomes,
  });

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
      image_path = ?, image_updated_at = ?, featured = ?, homepage_featured = ?, featured_started_at = ?,
      is_randomized = ?, randomized_outcomes_json = ?, showcase_float = ?,
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
      next.isRandomized ? 1 : 0,
      toJson(next.randomizedOutcomes),
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

  if (randomizedPackEngineEnabled()) {
    await rebuildAllRandomizedPackVersions();
  }

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
  if (randomizedPackEngineEnabled()) {
    await rebuildAllRandomizedPackVersions();
  }

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
    const depositId = `${request.id}-APP-DEPOSIT`;
    const existingXRocketRaw = parseJsonRecord(request.xrocketRawResponse);
    let appDepositResponse =
      existingXRocketRaw && "appDeposit" in existingXRocketRaw
        ? (existingXRocketRaw.appDeposit as Record<string, unknown>)
        : null;
    const feeResponse = await getXRocketWithdrawalQuotas();
    const withdrawalFee = extractXRocketWithdrawalFee(
      feeResponse,
      XROCKET_DEFAULT_CURRENCY,
      XROCKET_DEFAULT_NETWORK,
    );
    const appDepositAmount = Number(amount.toFixed(9));
    const netWithdrawalAmount = Number((amount - withdrawalFee).toFixed(9));

    if (!Number.isFinite(netWithdrawalAmount) || netWithdrawalAmount <= 0) {
      throw new Error(
        `xRocket provider fee ${withdrawalFee} ${XROCKET_DEFAULT_CURRENCY} is greater than or equal to payout amount.`,
      );
    }

    if (!appDepositResponse) {
      appDepositResponse = await createXRocketAppDeposit({
        depositId,
        amount: appDepositAmount,
        currency: XROCKET_DEFAULT_CURRENCY,
      });

      await execute(
        `update withdrawal_requests set
          xrocket_status = 'deposit_created',
          xrocket_raw_response = ?,
          updated_at = ?
         where id = ?`,
        [
          toJson({
            withdrawalFee,
            appDepositAmount,
            netWithdrawalAmount,
            feePaidBy: "user",
            withdrawalFees: feeResponse,
            appDeposit: appDepositResponse,
          }),
          nowIso(),
          request.id,
        ],
      );
    }

    const response = await createXRocketWithdrawal({
      clientWithdrawalId: request.id,
      amount: netWithdrawalAmount,
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
        toJson({
          withdrawalFee,
          appDepositAmount,
          netWithdrawalAmount,
          feePaidBy: "user",
          withdrawalFees: feeResponse,
          appDeposit: appDepositResponse,
          withdrawal: response,
        }),
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
        source: "dashboard",
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
        withdrawalFee,
        appDepositAmount,
        netWithdrawalAmount,
        feePaidBy: "user",
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
          `Gross payout: ${escapeTelegramHtml(String(amount))} ${escapeTelegramHtml(XROCKET_DEFAULT_CURRENCY)}`,
          `Provider fee: ${escapeTelegramHtml(String(withdrawalFee))} ${escapeTelegramHtml(XROCKET_DEFAULT_CURRENCY)}`,
          `Sent to user: ${escapeTelegramHtml(String(netWithdrawalAmount))} ${escapeTelegramHtml(XROCKET_DEFAULT_CURRENCY)}`,
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
      source: "dashboard",
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
