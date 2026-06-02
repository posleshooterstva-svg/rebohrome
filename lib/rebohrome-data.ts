export type Rarity = "Legendary" | "Epic" | "Rare";
export type CardShape = "spire" | "void" | "halo" | "crescent" | "shard";
export type DeliveryType = "digital" | "physical";
export type UserRole = "user" | "admin";
export type UserStatus = "active" | "under_review" | "frozen" | "blocked" | "suspended";
export type ProductStatus = "active" | "inactive";
export type OrderStatus = "Completed" | "Processing" | "Pending" | "Declined";
export type PaymentState = "completed" | "pending" | "failed";
export type PaymentMethodName =
  | "Archive Balance"
  | "Credit Card"
  | "Apple Pay"
  | "Google Pay"
  | "Crypto";
export type SupportedCurrency = "USD" | "EUR";
export type PaymentProviderName =
  | "Internal Wallet"
  | "TransVoucher";
export type PaymentProviderSlug = "internal-wallet" | "transvoucher";
export type CryptoNetwork = "USDT" | "BTC" | "ETH";
export type TransactionKind =
  | "deposit"
  | "purchase"
  | "withdrawal"
  | "refund"
  | "admin_initial_balance";
export type TransactionStatus =
  | "completed"
  | "pending"
  | "attempting"
  | "processing"
  | "failed"
  | "expired";
export type DepositStatus = "processing" | "completed" | "failed";
export type CheckoutPaymentSessionStatus =
  | "pending"
  | "attempting"
  | "processing"
  | "completed"
  | "failed"
  | "expired";
export type DepositPaymentSessionStatus =
  | "pending"
  | "attempting"
  | "processing"
  | "completed"
  | "failed"
  | "expired";
export type WithdrawalStatus =
  | "pending"
  | "approved"
  | "processing"
  | "completed"
  | "declined";
export type TelegramSyncStatus = "pending" | "synced" | "error" | "stale";
export type WithdrawalActionType =
  | "approve"
  | "processing"
  | "decline"
  | "complete";
export type WithdrawalActionSource =
  | "dashboard"
  | "telegram"
  | "system"
  | "telegram-unauthorized";

export type ProductRecord = {
  id: string;
  title: string;
  rarity: Rarity;
  price: number;
  currency: SupportedCurrency;
  stock: number;
  collection: string;
  category: string;
  description: string;
  tagline: string;
  defaultDeliveryType: DeliveryType;
  deliveryDigital: string;
  deliveryPhysical: string;
  edition: string;
  shape: CardShape;
  imageUrl: string | null;
  imagePath: string | null;
  imageUpdatedAt: string | null;
  featured: boolean;
  homepageFeatured: boolean;
  featuredStartedAt: string | null;
  status: ProductStatus;
  archived?: boolean;
  palette: {
    glow: string;
    glowSoft: string;
    core: string;
    ring: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type ProductInput = Omit<
  ProductRecord,
  | "createdAt"
  | "updatedAt"
  | "featuredStartedAt"
  | "imagePath"
  | "imageUpdatedAt"
> & {
  featuredStartedAt?: string | null;
  imagePath?: string | null;
  imageUpdatedAt?: string | null;
};

export type CollectionSummary = {
  id: string;
  title: string;
  cardCount: number;
  description: string;
  palette: ProductRecord["palette"];
  shape: CardShape;
};

export type CartLine = {
  productId: string;
  quantity: number;
  deliveryType: DeliveryType;
};

export type UserRecord = {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  telegramUsername: string;
  telegramId: string | null;
  telegramChatId: string | null;
  telegramVerified: boolean;
  telegramVerifiedAt: string | null;
  withdrawalWallet: string | null;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  requirePasswordReset: boolean;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
  vaultIntegrityScore: number;
  vaultIntegrityStatus: "Unstable" | "Basic" | "Verified" | "Excellent";
  vaultIntegrityUpdatedAt: string | null;
  archiveRulesAcceptedAt: string | null;
  latestTermsAcceptedAt: string | null;
};

export type VaultIntegrityReport = {
  score: number;
  status: UserRecord["vaultIntegrityStatus"];
  factors: string[];
  issues: string[];
  updatedAt: string | null;
};

export type ArchiveLedgerRecord = {
  id: string;
  ledgerId: string;
  eventType: string;
  userId: string | null;
  adminId: string | null;
  entityType: string;
  entityId: string;
  relatedOrderId: string | null;
  relatedTransactionId: string | null;
  relatedProductId: string | null;
  title: string;
  description: string;
  metadata: string | null;
  previousHash: string | null;
  eventHash: string;
  createdAt: string;
};

export type UserNotificationRecord = {
  id: string;
  userId: string;
  broadcastId: string | null;
  type: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  showAsPopup: boolean;
  dismissedAt: string | null;
  readAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type BroadcastRecord = {
  id: string;
  broadcastId: string;
  title: string;
  body: string;
  previewText: string | null;
  type: string;
  priority: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  targetType: string;
  targetFilters: string | null;
  channels: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  expiresAt: string | null;
  createdBy: string | null;
  telegramChannelEnabled: boolean;
  telegramChannelId: string | null;
  telegramChannelMessageId: string | null;
  telegramChannelStatus: string | null;
  telegramChannelError: string | null;
  telegramChannelSentAt: string | null;
  telegramChannelCaption: string | null;
  telegramChannelTranslated: boolean;
  telegramChannelImagePath: string | null;
  showAsPopup: boolean;
  popupPosition: string;
  allowUserDismiss: boolean;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivePaymentSessionRecord = {
  id: string;
  type: "deposit" | "purchase";
  provider: string;
  transactionId: string | null;
  providerTransactionId: string | null;
  paymentUrl: string | null;
  amount: number;
  currency: SupportedCurrency;
  status: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type BalanceRecord = {
  userId: string;
  available: number;
  pendingWithdrawal: number;
  totalDeposited: number;
  totalSpent: number;
  totalWithdrawn: number;
  updatedAt: string;
};

export type TransactionRecord = {
  id: string;
  userId: string;
  kind: TransactionKind;
  amount: number;
  originalAmount: number | null;
  originalCurrency: SupportedCurrency | null;
  displayCurrency: SupportedCurrency | null;
  creditedAmountUsd: number | null;
  exchangeRate: number | null;
  paymentMethod: string | null;
  paymentProvider: string | null;
  transvoucherTransactionId: string | null;
  transvoucherReferenceId: string | null;
  paymentUrl: string | null;
  providerStatus: string | null;
  rawProviderResponse: string | null;
  status: TransactionStatus;
  referenceId: string;
  summary: string;
  metaJson: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  providerCheckedAt: string | null;
  processedAt: string | null;
  creditedAt: string | null;
  nextCheckAt: string | null;
  lastError: string | null;
  reconciliationAttempts: number;
};

export type PaymentReconciliationStatus = {
  lastRunAt: string | null;
  pendingTransactions: number;
  checkedLastHour: number;
  succeededByCron: number;
  failedByCron: number;
  expiredByCron: number;
  lastError: string | null;
};

export type DepositRecord = {
  id: string;
  userId: string;
  amount: number;
  originalAmount: number | null;
  originalCurrency: SupportedCurrency | null;
  creditedAmountUsd: number | null;
  exchangeRate: number | null;
  paymentMethod: string;
  paymentProvider: string | null;
  transvoucherTransactionId: string | null;
  transvoucherReferenceId: string | null;
  cardholderName: string;
  cardMasked: string;
  status: DepositStatus;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
  completedAt: string | null;
  paidAt: string | null;
};

export type WithdrawalRecord = {
  id: string;
  userId: string;
  amount: number;
  requestedAmount: number;
  basePayoutPercent: number;
  bonusPayoutPercent: number;
  finalPayoutPercent: number;
  payoutAmount: number;
  walletAddress: string;
  telegramId: string;
  status: WithdrawalStatus;
  sourceDepositId: string | null;
  sourceCardMasked: string | null;
  sourceCardholderName: string | null;
  adminNote: string | null;
  telegramChatId: string | null;
  telegramMessageId: string | null;
  telegramSyncStatus: TelegramSyncStatus;
  telegramSyncedAt: string | null;
  telegramLastError: string | null;
  lastActionSource: WithdrawalActionSource;
  lastUpdatedByAdminId: string | null;
  statusUpdatedBy: string | null;
  statusUpdatedAt: string | null;
  payoutProvider: string | null;
  payoutCurrency: string | null;
  payoutNetwork: string | null;
  payoutAddress: string | null;
  xrocketWithdrawalId: string | null;
  xrocketStatus: string | null;
  xrocketRawResponse: string | null;
  xrocketSentAt: string | null;
  xrocketConfirmedAt: string | null;
  payoutTxHash: string | null;
  payoutError: string | null;
  payoutAttempts: number;
  createdAt: string;
  updatedAt: string;
};

export type WithdrawalStatusHistoryRecord = {
  id: string;
  withdrawalId: string;
  actionType: string;
  previousStatus: WithdrawalStatus | null;
  nextStatus: WithdrawalStatus;
  source: WithdrawalActionSource;
  adminUserId: string | null;
  adminUsername: string | null;
  adminTelegramUsername: string | null;
  note: string | null;
  createdAt: string;
};

export type OrderRecord = {
  id: string;
  userId: string;
  status: OrderStatus;
  paymentState: PaymentState;
  subtotal: number;
  shipping: number;
  total: number;
  currency: SupportedCurrency;
  paymentProvider: string | null;
  transvoucherTransactionId: string | null;
  transvoucherReferenceId: string | null;
  providerStatus: string | null;
  shippingName: string;
  shippingEmail: string;
  shippingAddress: string;
  shippingCity: string;
  shippingPostalCode: string;
  paymentMethod: string;
  failureReason: string | null;
  remainingBalance: number | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  itemCount?: number;
};

export type OrderLineRecord = {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  deliveryType: DeliveryType;
};

export type OwnedCardRecord = {
  id: string;
  userId: string;
  productId: string;
  orderId: string;
  quantity: number;
  acquiredAt: string;
};

export type MarketplaceFilters = {
  search?: string;
  rarity?: string;
  collection?: string;
  sort?: string;
};

export type DashboardStat = {
  label: string;
  value: string;
  accent?: "violet" | "cyan" | "emerald" | "rose" | "amber";
};

export type PaymentMethodOption = {
  id: PaymentMethodName;
  label: string;
  sublabel: string;
};

export type PaymentProviderOption = {
  id: PaymentProviderName;
  label: string;
  secureLabel: string;
  speedLabel: string;
  supportedCurrencies: SupportedCurrency[];
};

export type HeaderAccount = {
  user: UserRecord;
  balance: BalanceRecord;
};

export type CheckoutPaymentSessionRecord = {
  id: string;
  userId: string;
  paymentMethod: PaymentMethodName;
  paymentProvider: PaymentProviderName;
  currency: SupportedCurrency;
  subtotal: number;
  shipping: number;
  total: number;
  status: CheckoutPaymentSessionStatus;
  itemsJson: string;
  metaJson: string | null;
  orderId: string | null;
  transactionId: string | null;
  transvoucherTransactionId: string | null;
  transvoucherReferenceId: string | null;
  paymentUrl: string | null;
  providerStatus: string | null;
  rawProviderResponse: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type DepositPaymentSessionRecord = {
  id: string;
  userId: string;
  paymentMethod: PaymentMethodName;
  paymentProvider: PaymentProviderName;
  currency: SupportedCurrency;
  originalAmount: number;
  creditedAmountUsd: number;
  exchangeRate: number;
  status: DepositPaymentSessionStatus;
  metaJson: string | null;
  depositId: string | null;
  transactionId: string | null;
  transvoucherTransactionId: string | null;
  transvoucherReferenceId: string | null;
  paymentUrl: string | null;
  providerStatus: string | null;
  rawProviderResponse: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export const SESSION_COOKIE_NAME = "rebohrome_session";

export const publicNavItems = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/#collections", label: "Collections" },
  { href: "/#drops", label: "Drops" },
  { href: "/dashboard", label: "Vault" },
  { href: "/#about", label: "About" },
];

export const heroMetrics = [
  {
    label: "Cards are added to your private archive immediately after purchase.",
    value: "Instant Ownership",
  },
  {
    label: "Fund your account and purchase collectibles through your archive wallet.",
    value: "Secure Balance",
  },
  {
    label: "Track every card, order, and transaction from one clean dashboard.",
    value: "Verified Collection",
  },
];

export const howItWorksSteps = [
  {
    title: "Discover",
    text: "Browse curated drops, premium digital cards, and archive-grade releases.",
  },
  {
    title: "Acquire",
    text: "Choose a secure payment route and receive verified ownership the moment your order completes.",
  },
  {
    title: "Preserve",
    text: "Manage your balance, orders, and collection from one private ReboHrome vault.",
  },
];

export const dashboardQuickLinks = [
  {
    href: "/dashboard/deposit",
    title: "Fund Balance",
    description: "Add funds to your archive balance for instant collectible purchases.",
  },
  {
    href: "/withdraw",
    title: "Withdraw",
    description: "Submit a manual USDT BEP20 withdrawal request from your available balance.",
  },
  {
    href: "/dashboard/collection",
    title: "Collection",
    description: "Review every owned card, archive ID, and acquisition timestamp.",
  },
  {
    href: "/dashboard/transactions",
    title: "Transactions",
    description: "Follow deposits, purchases, withdrawals, and balance activity in one place.",
  },
];

export const checkoutPaymentOptions: PaymentMethodOption[] = [
  {
    id: "Archive Balance",
    label: "Archive Balance",
    sublabel: "Use your archive wallet for instant collector checkout",
  },
  {
    id: "Credit Card",
    label: "Credit Card",
    sublabel: "Visa, Mastercard, American Express",
  },
  {
    id: "Apple Pay",
    label: "Apple Pay",
    sublabel: "Secure wallet checkout with one-tap confirmation",
  },
  {
    id: "Google Pay",
    label: "Google Pay",
    sublabel: "Fast browser wallet payment with secure authorization",
  },
];

export const depositPaymentOptions: PaymentMethodOption[] = checkoutPaymentOptions.filter(
  (option) => option.id !== "Archive Balance",
);

export const paymentProviderOptions: PaymentProviderOption[] = [
  {
    id: "TransVoucher",
    label: "TransVoucher",
    secureLabel: "Card / Apple Pay / Google Pay",
    speedLabel: "Secure hosted payment",
    supportedCurrencies: ["USD", "EUR"],
  },
];

export const paymentProviderRouteMap: Record<
  PaymentProviderName,
  PaymentProviderSlug
> = {
  "Internal Wallet": "internal-wallet",
  TransVoucher: "transvoucher",
};

export const paymentProviderSlugMap: Record<
  PaymentProviderSlug,
  PaymentProviderName
> = {
  "internal-wallet": "Internal Wallet",
  transvoucher: "TransVoucher",
};

export const cryptoNetworkOptions: CryptoNetwork[] = ["USDT", "BTC", "ETH"];
export const supportedCurrencies: SupportedCurrency[] = ["USD", "EUR"];

export const withdrawalActionOptions: Array<{
  id: WithdrawalActionType;
  label: string;
  targetStatus: WithdrawalStatus;
}> = [
  { id: "approve", label: "Approve", targetStatus: "approved" },
  { id: "processing", label: "Processing", targetStatus: "processing" },
  { id: "decline", label: "Decline", targetStatus: "declined" },
  { id: "complete", label: "Complete", targetStatus: "completed" },
];

export const withdrawalStatusMeta: Record<
  WithdrawalStatus,
  {
    label: string;
    emoji: string;
    toneClass: string;
    softClass: string;
  }
> = {
  pending: {
    label: "Pending",
    emoji: "рџџЎ",
    toneClass: "text-amber-600",
    softClass: "bg-amber-100 text-amber-700",
  },
  approved: {
    label: "Approved",
    emoji: "рџџЈ",
    toneClass: "text-violet-600",
    softClass: "bg-violet-100 text-violet-700",
  },
  processing: {
    label: "Processing",
    emoji: "рџ”µ",
    toneClass: "text-sky-600",
    softClass: "bg-sky-100 text-sky-700",
  },
  completed: {
    label: "Completed",
    emoji: "рџџў",
    toneClass: "text-emerald-600",
    softClass: "bg-emerald-100 text-emerald-700",
  },
  declined: {
    label: "Declined",
    emoji: "рџ”ґ",
    toneClass: "text-rose-600",
    softClass: "bg-rose-100 text-rose-700",
  },
};

export const productShapes: CardShape[] = [
  "spire",
  "void",
  "halo",
  "crescent",
  "shard",
];

export const productRarities: Rarity[] = ["Legendary", "Epic", "Rare"];

export const rarityMeta: Record<
  Rarity,
  {
    textClass: string;
    dotClass: string;
  }
> = {
  Legendary: {
    textClass: "text-amber-500 dark:text-amber-300",
    dotClass: "bg-amber-400 dark:bg-amber-300",
  },
  Epic: {
    textClass: "text-violet-500 dark:text-violet-300",
    dotClass: "bg-violet-400 dark:bg-violet-300",
  },
  Rare: {
    textClass: "text-sky-500 dark:text-sky-300",
    dotClass: "bg-sky-400 dark:bg-sky-300",
  },
};

export function formatCurrency(
  value: number,
  currency: SupportedCurrency = "USD",
) {
  const normalizedValue = Math.abs(value) < 0.005 ? 0 : value;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalizedValue);
}

export function formatUsd(value: number) {
  return formatCurrency(value, "USD");
}

export const PAYOUT_TIER_STEP_USD = 20_000;
export const BASE_WITHDRAWAL_PAYOUT_PERCENT = 60;

export function getPayoutBonusPercent(totalDepositedUsd: number) {
  return Math.max(0, Math.floor(Number(totalDepositedUsd || 0) / PAYOUT_TIER_STEP_USD));
}

export function getPayoutTierProgress(totalDepositedUsd: number) {
  const normalized = Math.max(0, Number(totalDepositedUsd || 0));
  const currentBonus = getPayoutBonusPercent(normalized);
  const nextThreshold = (currentBonus + 1) * PAYOUT_TIER_STEP_USD;

  return {
    currentBonus,
    currentThreshold: currentBonus * PAYOUT_TIER_STEP_USD,
    nextThreshold,
    progressInTier: normalized,
    remainingToNext: Math.max(0, nextThreshold - normalized),
  };
}

export function calculateWithdrawalPayout(input: {
  requestedAmount: number;
  totalDepositedUsd: number;
}) {
  const requestedAmount = Number(input.requestedAmount || 0);
  const bonusPayoutPercent = getPayoutBonusPercent(input.totalDepositedUsd);
  const finalPayoutPercent = BASE_WITHDRAWAL_PAYOUT_PERCENT + bonusPayoutPercent;

  return {
    requestedAmount,
    basePayoutPercent: BASE_WITHDRAWAL_PAYOUT_PERCENT,
    bonusPayoutPercent,
    finalPayoutPercent,
    payoutAmount: Number(((requestedAmount * finalPayoutPercent) / 100).toFixed(2)),
  };
}

export function formatCurrencyPair(
  amount: number,
  currency: SupportedCurrency,
  creditedAmountUsd?: number | null,
) {
  const primary = formatCurrency(amount, currency);

  if (currency === "USD" || creditedAmountUsd === null || creditedAmountUsd === undefined) {
    return primary;
  }

  return `${primary} credited as ${formatUsd(creditedAmountUsd)}`;
}

export function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDisplayDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createProductId(title: string) {
  return slugify(title) || crypto.randomUUID();
}

export function createReadableId(
  prefix: "ORD" | "DEP" | "WDR" | "TXN" | "ARCH" | "BRC",
) {
  const year = new Date().getFullYear();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";

  for (let index = 0; index < 5; index += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return `${prefix}-${year}-${suffix}`;
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeTelegramUsername(value: string) {
  const next = value.trim();
  return next.startsWith("@") ? next.toLowerCase() : `@${next.toLowerCase()}`;
}

export function isValidTelegramUsername(value: string) {
  return /^@[a-zA-Z0-9_]{5,32}$/.test(value.trim());
}

export function maskCardNumber(value: string) {
  const digits = value.replace(/\D+/g, "");
  const last4 = digits.slice(-4) || "0000";
  return `**** **** **** ${last4}`;
}

export function composePaymentLabel(
  method: PaymentMethodName | string,
  provider?: PaymentProviderName | string | null,
) {
  return provider ? `${method} - ${provider}` : method;
}

export function formatUtcDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(value))
    .replace(",", "");
}

export function parseMetaJson<T>(value: string | null) {
  if (!value) {
    return null;
  }

  return JSON.parse(value) as T;
}

export function buildPlaceholderEmail(username: string) {
  return `${normalizeUsername(username)}@rebohrome.local`;
}

export function getPaletteByRarity(rarity: Rarity) {
  switch (rarity) {
    case "Legendary":
      return {
        glow: "rgba(212, 173, 91, 0.34)",
        glowSoft: "rgba(255, 244, 214, 0.88)",
        core: "#fff5df",
        ring: "#f2cc7f",
      };
    case "Epic":
      return {
        glow: "rgba(167, 141, 255, 0.34)",
        glowSoft: "rgba(243, 238, 255, 0.88)",
        core: "#f2edff",
        ring: "#d2c1ff",
      };
    case "Rare":
    default:
      return {
        glow: "rgba(134, 183, 255, 0.34)",
        glowSoft: "rgba(231, 243, 255, 0.88)",
        core: "#eef7ff",
        ring: "#b6d7ff",
      };
  }
}
