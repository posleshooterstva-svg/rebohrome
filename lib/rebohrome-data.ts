export type Rarity = "Legendary" | "Epic" | "Rare";
export type CardShape = "spire" | "void" | "halo" | "crescent" | "shard";
export type DeliveryType = "digital" | "physical";
export type UserRole = "user" | "admin";
export type UserStatus = "active" | "under_review" | "frozen" | "blocked" | "suspended";
export type KycStatus =
  | "not_started"
  | "session_created"
  | "submitted"
  | "review"
  | "approved"
  | "declined"
  | "expired"
  | "abandoned"
  | "manual_approved"
  | "manual_declined"
  | "manual_rejected";
export type ProductStatus = "active" | "inactive";
export type OrderStatus = "Completed" | "Processing" | "Pending" | "Declined";
export type PaymentState = "completed" | "pending" | "failed" | "paid_unfulfilled";
export type PaymentMethodName =
  | "Archive Balance"
  | "Credit Card"
  | "Apple Pay"
  | "Google Pay"
  | "Crypto";
export type SupportedCurrency = "USD" | "EUR";
export type PaymentProviderName =
  | "Internal Wallet"
  | "TransVoucher"
  | "Cleffo"
  | "Wert.io"
  | "Coinflow";
export type PaymentProviderSlug =
  | "internal-wallet"
  | "transvoucher"
  | "cleffo"
  | "wert"
  | "coinflow";
export type PaymentProviderKey = "transvoucher" | "cleffo" | "wert" | "coinflow";
export type CryptoNetwork = "USDT" | "BTC" | "ETH";
export type TransactionKind =
  | "deposit"
  | "purchase"
  | "withdrawal"
  | "refund"
  | "admin_initial_balance"
  | "chargeback"
  | "manual_credit"
  | "manual_debit"
  | "product_grant"
  | "product_remove"
  | "product_quantity_adjustment"
  | "provider_adjustment"
  | "admin_correction";
export type TransactionStatus =
  | "completed"
  | "pending"
  | "attempting"
  | "processing"
  | "failed"
  | "expired"
  | "canceled"
  | "refunded"
  | "chargeback"
  | "reversed"
  | "manually_adjusted";
export type DepositStatus = "processing" | "completed" | "failed";
export type CheckoutPaymentSessionStatus =
  | "pending"
  | "attempting"
  | "processing"
  | "paid_unfulfilled"
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

export type RequiredDocumentKey = "terms" | "privacy" | "refund" | "aml" | "legalConfirmation";

export type DocumentAcceptanceItem = {
  version: string;
  accepted: boolean;
  url: string;
  acceptedAt: string | null;
};

export type DocumentAcceptanceStatusRecord = {
  accepted: boolean;
  acceptedAllAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  currentVersion: string;
  required: Record<RequiredDocumentKey, DocumentAcceptanceItem>;
};

export const RANDOMIZED_ODDS_TOTAL_BPS = 10_000;

export type RandomizedProductOutcomeWeight = {
  productId: string;
  probabilityBps: number;
};

export type RandomizedProductOutcomeDisclosure = {
  product: ProductRecord;
  probabilityBps: number;
  priceSnapshot: number;
};

export type RandomizedProductDisclosure = {
  isRandomized: boolean;
  isReady: boolean;
  totalProbabilityBps: number;
  outcomes: RandomizedProductOutcomeDisclosure[];
  versionId?: string | null;
  version?: number | null;
  publishedAt?: string | null;
  expectedValue?: number | null;
  bigWinProbabilityBps?: number;
};

export function normalizeRandomizedProductOutcomes(
  value: unknown,
): RandomizedProductOutcomeWeight[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const productId = String(
      (entry as Record<string, unknown>).productId ?? "",
    ).trim();
    const probabilityBps = Number(
      (entry as Record<string, unknown>).probabilityBps,
    );

    if (
      !productId ||
      !Number.isInteger(probabilityBps) ||
      probabilityBps <= 0 ||
      probabilityBps > RANDOMIZED_ODDS_TOTAL_BPS
    ) {
      return [];
    }

    return [{ productId, probabilityBps }];
  });
}

export function hasValidRandomizedProductOdds(
  product: Pick<ProductRecord, "id" | "isRandomized" | "randomizedOutcomes">,
) {
  if (!product.isRandomized) {
    return true;
  }

  if (product.randomizedOutcomes.length === 0) {
    return false;
  }

  const productIds = new Set<string>();
  let total = 0;

  for (const outcome of product.randomizedOutcomes) {
    if (
      outcome.productId === product.id ||
      productIds.has(outcome.productId) ||
      !Number.isInteger(outcome.probabilityBps) ||
      outcome.probabilityBps <= 0
    ) {
      return false;
    }

    productIds.add(outcome.productId);
    total += outcome.probabilityBps;
  }

  return total === RANDOMIZED_ODDS_TOTAL_BPS;
}

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
  isRandomized: boolean;
  randomizedOutcomes: RandomizedProductOutcomeWeight[];
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

export function getPublicProductTitle(title: string) {
  return title
    .replace(/\bgacha\s+pack\b/gi, "Collectible Pack")
    .replace(/\bgacha\b/gi, "collectible")
    .replace(/\bjackpot\b/gi, "featured pull")
    .replace(/\bwinnings\b/gi, "pulls");
}

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
  paymentPhone: string | null;
  gate2FirstName: string | null;
  gate2LastName: string | null;
  gate2Phone: string | null;
  gate2DetailsUpdatedAt: string | null;
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
  kycStatus: KycStatus;
  kycVerified: boolean;
  kycProvider: string | null;
  veriffSessionId: string | null;
  veriffVerificationId: string | null;
  veriffStatus: string | null;
  veriffDecision: string | null;
  veriffReason: string | null;
  kycStartedAt: string | null;
  kycSubmittedAt: string | null;
  kycVerifiedAt: string | null;
  kycDeclinedAt: string | null;
  kycLastWebhookAt: string | null;
  kycManualOverride: boolean;
  kycManualOverrideBy: string | null;
  kycManualOverrideAt: string | null;
  kycManualOverrideReason: string | null;
  withdrawAccessEnabled: boolean;
  withdrawAccessDisabledAt: string | null;
  withdrawAccessDisabledBy: string | null;
  withdrawAccessDisabledReason: string | null;
  withdrawAccessRestoredAt: string | null;
  withdrawAccessRestoredBy: string | null;
};

export type UserKycProfileRecord = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  countryOfResidence: string;
  documentCountry: string;
  email: string;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  state: string | null;
  createdAt: string;
  updatedAt: string;
};

export function isKycVerified(
  user: Pick<UserRecord, "kycStatus" | "kycVerified"> | null | undefined,
) {
  if (!user) {
    return false;
  }

  return (
    user.kycVerified === true &&
    (user.kycStatus === "approved" || user.kycStatus === "manual_approved")
  );
}

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
  payoutBonusOverrideEnabled: boolean;
  payoutBonusPercent: number | null;
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
  limit?: number;
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

export type PaymentGateAccessRecord = {
  providerKey: PaymentProviderKey;
  gateNumber: number;
  providerName: Exclude<PaymentProviderName, "Internal Wallet">;
  publicName: string;
  adminName: string;
  enabled: boolean;
  accessEnabled: boolean;
  defaultUserVisible: boolean;
  supportsCurrencies: SupportedCurrency[];
  minAmount: number;
  maxAmount: number | null;
  defaultAmount: number | null;
  limitCurrency: SupportedCurrency;
  reason: string | null;
  updatedAt: string | null;
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
  { href: "/dashboard/marketplace", label: "Marketplace" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About" },
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
    description: "Add funds securely.",
  },
  {
    href: "/dashboard/collection",
    title: "Collection",
    description: "Review every owned card, archive ID, and acquisition timestamp.",
  },
  {
    href: "/dashboard/transactions",
    title: "Transactions",
    description: "Follow deposits, purchases, and balance activity in one place.",
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
    label: "Gate #1",
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
  Cleffo: "cleffo",
  "Wert.io": "wert",
  Coinflow: "coinflow",
};

export const paymentProviderSlugMap: Record<
  PaymentProviderSlug,
  PaymentProviderName
> = {
  "internal-wallet": "Internal Wallet",
  transvoucher: "TransVoucher",
  cleffo: "Cleffo",
  wert: "Wert.io",
  coinflow: "Coinflow",
};

export function getPublicPaymentProviderLabel(
  provider?: PaymentProviderName | string | null,
) {
  if (provider === "TransVoucher") {
    return "Gate #1";
  }

  if (provider === "Cleffo") {
    return "Gate #2";
  }

  if (provider === "Wert.io") {
    return "Gate #3";
  }

  if (provider === "Coinflow") {
    return "Gate #4";
  }

  return provider ?? "Unknown";
}

export function getAdminPaymentProviderLabel(
  provider?: PaymentProviderName | string | null,
) {
  if (provider === "TransVoucher") {
    return "Gate #1 - TransVoucher";
  }

  if (provider === "Cleffo") {
    return "Gate #2 - Cleffo";
  }

  if (provider === "Wert.io") {
    return "Gate #3 - Wert.io";
  }

  if (provider === "Coinflow") {
    return "Gate #4 - Coinflow";
  }

  return provider ?? "Unknown";
}

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

export function getEffectivePayoutBonusPercent(input: {
  totalDepositedUsd: number;
  payoutBonusOverrideEnabled?: boolean;
  payoutBonusPercent?: number | null;
}) {
  if (input.payoutBonusOverrideEnabled && input.payoutBonusPercent !== null && input.payoutBonusPercent !== undefined) {
    return Math.max(0, Math.min(100, Math.floor(Number(input.payoutBonusPercent || 0))));
  }

  return getPayoutBonusPercent(input.totalDepositedUsd);
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
  payoutBonusOverrideEnabled?: boolean;
  payoutBonusPercent?: number | null;
}) {
  const requestedAmount = Number(input.requestedAmount || 0);
  const bonusPayoutPercent = getEffectivePayoutBonusPercent(input);
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
