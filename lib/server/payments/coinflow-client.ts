import "server-only";
import {
  COINFLOW_API_BASE_URL,
  COINFLOW_API_KEY,
  COINFLOW_CHECKOUT_MODE,
  COINFLOW_DEFAULT_CURRENCY,
  COINFLOW_DEFAULT_PAYMENT_METHOD,
  COINFLOW_ENABLE_ACH,
  COINFLOW_ENABLE_APPLE_PAY,
  COINFLOW_ENABLE_CARD,
  COINFLOW_ENABLE_GOOGLE_PAY,
  COINFLOW_ENABLE_PIX,
  COINFLOW_ENABLE_SEPA,
  COINFLOW_ENABLE_UK_FASTER_PAYMENTS,
  COINFLOW_ENV,
  COINFLOW_MERCHANT_ID,
  COINFLOW_SETTLEMENT_TYPE,
  COINFLOW_WEBHOOK_VALIDATION_KEY,
  NEXT_PUBLIC_COINFLOW_ENV,
} from "@/lib/server-config";

export type CoinflowEnv = "prod" | "sandbox";

export type CoinflowCheckoutJwtInput = {
  sessionId: string;
  userId: string;
  localTransactionId: string;
  idempotencyKey: string;
  amount: number;
  amountCents: number;
  currency: "USD";
  email: string;
  accountAgeDays?: number | null;
  kycStatus?: string | null;
  ipAddress?: string | null;
  country?: string | null;
};

export type CoinflowCheckoutToken = {
  sessionKey: string;
  checkoutJwtToken: string;
  raw: unknown;
};

const SANDBOX_API_BASE_URL = "https://api-sandbox.coinflow.cash";
const PROD_API_BASE_URL = "https://api.coinflow.cash";

export function getCoinflowConfig() {
  const env = COINFLOW_ENV;
  const expectedApiBaseUrl = env === "sandbox" ? SANDBOX_API_BASE_URL : PROD_API_BASE_URL;
  const configuredApiBaseUrl = COINFLOW_API_BASE_URL.replace(/\/+$/, "");
  const apiBaseUrl =
    configuredApiBaseUrl === expectedApiBaseUrl ? configuredApiBaseUrl : expectedApiBaseUrl;
  const publicEnv = NEXT_PUBLIC_COINFLOW_ENV === env ? NEXT_PUBLIC_COINFLOW_ENV : env;
  const hasApiUrlMismatch = configuredApiBaseUrl !== expectedApiBaseUrl;
  const hasPublicEnvMismatch = NEXT_PUBLIC_COINFLOW_ENV !== env;

  if (hasApiUrlMismatch) {
    console.warn(`[COINFLOW_GATE4][${env}][card] config_api_url_mismatch`, {
      configuredApiBaseUrl,
      expectedApiBaseUrl,
    });
  }

  if (hasPublicEnvMismatch) {
    console.warn(`[COINFLOW_GATE4][${env}][card] config_public_env_mismatch`, {
      configuredPublicEnv: NEXT_PUBLIC_COINFLOW_ENV,
      expectedPublicEnv: env,
    });
  }

  return {
    env,
    publicEnv,
    apiBaseUrl,
    merchantId: COINFLOW_MERCHANT_ID,
    apiKey: COINFLOW_API_KEY,
    webhookValidationKey: COINFLOW_WEBHOOK_VALIDATION_KEY,
    checkoutMode: COINFLOW_CHECKOUT_MODE,
    defaultPaymentMethod: COINFLOW_DEFAULT_PAYMENT_METHOD,
    settlementType: COINFLOW_SETTLEMENT_TYPE,
    defaultCurrency: COINFLOW_DEFAULT_CURRENCY,
    enableCard: COINFLOW_ENABLE_CARD,
    enableApplePay: COINFLOW_ENABLE_APPLE_PAY,
    enableGooglePay: COINFLOW_ENABLE_GOOGLE_PAY,
    enableAch: COINFLOW_ENABLE_ACH,
    enableSepa: COINFLOW_ENABLE_SEPA,
    enableUkFasterPayments: COINFLOW_ENABLE_UK_FASTER_PAYMENTS,
    enablePix: COINFLOW_ENABLE_PIX,
    apiKeyConfigured: Boolean(COINFLOW_API_KEY),
    merchantIdConfigured: Boolean(COINFLOW_MERCHANT_ID),
    webhookValidationKeyConfigured: Boolean(COINFLOW_WEBHOOK_VALIDATION_KEY),
  };
}

function coinflowUrl(path: string) {
  const config = getCoinflowConfig();
  return `${config.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function assertCoinflowConfigured() {
  const config = getCoinflowConfig();
  if (!config.merchantId) {
    throw new Error("Gate #4 checkout could not be prepared. Missing Coinflow merchant ID.");
  }
  if (!config.apiKey) {
    throw new Error("Gate #4 checkout could not be prepared. Missing Coinflow API key.");
  }
}

async function coinflowRequest(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
    userId?: string;
  } = {},
) {
  assertCoinflowConfigured();
  const config = getCoinflowConfig();
  const method = options.method ?? "POST";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: config.apiKey,
  };

  if (options.userId) {
    headers["x-coinflow-auth-user-id"] = options.userId;
  }

  const response = await fetch(coinflowUrl(path), {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
  });

  const text = await response.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(
      `Coinflow request failed with HTTP ${response.status}: ${extractCoinflowError(data)}`,
    );
  }

  return data;
}

function readString(data: unknown, keys: string[]) {
  if (!data || typeof data !== "object") {
    return null;
  }
  const record = data as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function extractCoinflowError(data: unknown) {
  if (!data || typeof data !== "object") {
    return typeof data === "string" ? data.slice(0, 240) : "Unknown Coinflow error";
  }
  const record = data as Record<string, unknown>;
  return String(
    record.message ??
      record.error ??
      record.detail ??
      record.raw ??
      "Unknown Coinflow error",
  ).slice(0, 240);
}

export function getCoinflowPublicConfig() {
  const config = getCoinflowConfig();
  return {
    merchantId: config.merchantId,
    env: config.publicEnv,
    serverEnv: config.env,
    apiBaseUrl: config.apiBaseUrl,
    checkoutMode: config.checkoutMode,
    defaultPaymentMethod: config.defaultPaymentMethod,
    settlementType: config.settlementType,
    defaultCurrency: config.defaultCurrency,
    enableCard: config.enableCard,
    enableApplePay: config.enableApplePay,
    enableGooglePay: config.enableGooglePay,
    enableAch: config.enableAch,
    enableSepa: config.enableSepa,
    enableUkFasterPayments: config.enableUkFasterPayments,
    enablePix: config.enablePix,
    apiKeyConfigured: config.apiKeyConfigured,
    merchantIdConfigured: config.merchantIdConfigured,
    webhookValidationKeyConfigured: config.webhookValidationKeyConfigured,
  };
}

export function buildCoinflowWebhookInfo(input: CoinflowCheckoutJwtInput) {
  return {
    rebohrome_session_id: input.sessionId,
    rebohrome_user_id: input.userId,
    provider: "coinflow",
    gate_number: "4",
    environment: COINFLOW_ENV,
    payment_method: "card",
    local_transaction_id: input.localTransactionId,
    idempotency_key: input.idempotencyKey,
  };
}

export function buildCoinflowChargebackProtectionData(input: CoinflowCheckoutJwtInput) {
  return [
    {
      productName: "ReboHrome Balance Top-Up",
      productType: "topUp",
      quantity: 1,
      rawProductData: {
        description: "Digital collectible marketplace balance top-up",
        paymentMethod: "card",
        userId: input.userId,
        sessionId: input.sessionId,
        amount: String(input.amount),
        currency: input.currency,
        accountAgeDays: input.accountAgeDays ?? undefined,
        kycStatus: input.kycStatus ?? undefined,
        ip: input.ipAddress ?? undefined,
        country: input.country ?? undefined,
      },
    },
  ];
}

export async function createCoinflowCheckoutToken(
  input: CoinflowCheckoutJwtInput,
): Promise<CoinflowCheckoutToken> {
  const config = getCoinflowConfig();
  const webhookInfo = buildCoinflowWebhookInfo(input);
  const chargebackProtectionData = buildCoinflowChargebackProtectionData(input);
  console.info(`[COINFLOW_GATE4][${config.env}][card] session_key_requested`, {
    sessionId: input.sessionId,
    userId: input.userId,
  });

  const sessionKeyResponse = await coinflowRequest("/api/auth/session-key", {
    method: "GET",
    userId: input.userId,
  });
  const sessionKey =
    readString(sessionKeyResponse, ["sessionKey", "session_key", "key", "id"]) ??
    readString((sessionKeyResponse as { data?: unknown }).data, [
      "sessionKey",
      "session_key",
      "key",
      "id",
    ]);

  if (!sessionKey) {
    throw new Error("Gate #4 checkout could not be prepared. Coinflow did not return session key.");
  }

  console.info(`[COINFLOW_GATE4][${config.env}][card] session_key_created`, {
    sessionId: input.sessionId,
  });
  console.info(`[COINFLOW_GATE4][${config.env}][card] checkout_jwt_requested`, {
    sessionId: input.sessionId,
  });

  const jwtBody = {
    subtotal: {
      cents: input.amountCents,
      currency: input.currency,
    },
    email: input.email,
    webhookInfo,
    chargebackProtectionData,
    settlementType: COINFLOW_SETTLEMENT_TYPE,
  };
  const jwtResponse = await coinflowRequest("/api/checkout/jwt-token", {
    body: jwtBody,
  });
  const checkoutJwtToken =
    readString(jwtResponse, ["checkoutJwtToken", "jwtToken", "jwt", "token"]) ??
    readString((jwtResponse as { data?: unknown }).data, [
      "checkoutJwtToken",
      "jwtToken",
      "jwt",
      "token",
    ]);

  if (!checkoutJwtToken) {
    throw new Error("Gate #4 checkout could not be prepared. Coinflow did not return checkout token.");
  }

  console.info(`[COINFLOW_GATE4][${config.env}][card] checkout_jwt_created`, {
    sessionId: input.sessionId,
  });

  return {
    sessionKey,
    checkoutJwtToken,
    raw: {
      sessionKeyResponse: sanitizeCoinflowResponse(sessionKeyResponse),
      jwtResponse: sanitizeCoinflowResponse(jwtResponse),
    },
  };
}

export async function lookupCoinflowPayment(paymentId: string) {
  assertCoinflowConfigured();
  const config = getCoinflowConfig();
  const response = await fetch(
    coinflowUrl(`/api/merchant/payments/enhanced/${encodeURIComponent(paymentId)}`),
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "x-coinflow-auth-user-id": config.merchantId,
      },
    },
  );
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Coinflow status lookup failed with HTTP ${response.status}`);
  }
  return data;
}

export function sanitizeCoinflowResponse(data: unknown) {
  if (!data || typeof data !== "object") {
    return data;
  }
  const clone = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  for (const key of ["token", "jwt", "jwtToken", "checkoutJwtToken", "sessionKey", "session_key"]) {
    if (key in clone) {
      clone[key] = "[redacted]";
    }
  }
  return clone;
}
