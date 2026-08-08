import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { APP_BASE_URL } from "@/lib/server-config";
import type { PaymentMethodName, SupportedCurrency } from "@/lib/rebohrome-data";

export type TransVoucherMethod = "card" | "apple-pay" | "google-pay";

export type TransVoucherPaymentCreatePayload = {
  amount: number;
  currency: SupportedCurrency;
  title: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  redirectUrl: string;
  customerDetails: {
    email?: string | null;
  };
  metadata: Record<string, unknown>;
  defaultPaymentMethod: TransVoucherMethod;
  paymentMethodForced: boolean;
  lang?: string;
  theme?: string;
};

type TransVoucherEnvelope = {
  transaction_id?: string;
  transactionId?: string;
  id?: string;
  reference_id?: string;
  referenceId?: string;
  payment_url?: string;
  paymentUrl?: string;
  payment_link?: string;
  paymentLink?: string;
  embed_url?: string;
  embedUrl?: string;
  use_embed?: boolean;
  useEmbed?: boolean;
  url?: string;
  expires_at?: string;
  expiresAt?: string;
  amount?: number | string;
  currency?: string;
  status?: string;
  payment_status?: string;
  paymentStatus?: string;
  transaction_status?: string;
  transactionStatus?: string;
  provider_status?: string;
  providerStatus?: string;
  state?: string;
  paid_at?: string;
  paidAt?: string;
  metadata?: Record<string, unknown>;
};

type TransVoucherApiResponse = {
  data?: TransVoucherEnvelope;
  result?: TransVoucherEnvelope;
  message?: string;
  error?: string;
} & TransVoucherEnvelope;

export type TransVoucherPaymentResponse = {
  transactionId: string;
  referenceId: string | null;
  paymentUrl: string;
  embedUrl: string | null;
  useEmbed: boolean;
  expiresAt: string | null;
  amount: number;
  currency: string;
  status: string;
  raw: unknown;
};

export type TransVoucherStatusResponse = {
  transactionId: string;
  referenceId: string | null;
  status: string;
  amount: number | null;
  currency: string | null;
  paidAt: string | null;
  paymentUrl: string | null;
  raw: unknown;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";

  if (!value) {
    throw new Error(`Missing ${name}.`);
  }

  return value;
}

function getTransVoucherConfig() {
  return {
    apiKey: getRequiredEnv("TRANSVOUCHER_API_KEY"),
    apiSecret: getRequiredEnv("TRANSVOUCHER_API_SECRET"),
    webhookSecret: getRequiredEnv("TRANSVOUCHER_WEBHOOK_SECRET"),
    baseUrl: (process.env.TRANSVOUCHER_API_BASE_URL?.trim() ||
      "https://api.trans-voucher.com/v1.0").replace(/\/+$/, ""),
  };
}

function normalizeStatus(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export type NormalizedTransVoucherStatus =
  | "succeeded"
  | "failed"
  | "declined"
  | "expired"
  | "processing"
  | "pending"
  | "unknown";

export function normalizeTransVoucherStatus(rawStatus: unknown): NormalizedTransVoucherStatus {
  const normalized = normalizeStatus(rawStatus).replace(/[\s-]+/g, "_");

  if (
    [
      "success",
      "succeeded",
      "paid",
      "completed",
      "complete",
      "approved",
      "captured",
      "confirmed",
    ].includes(normalized)
  ) {
    return "succeeded";
  }

  if (["expired", "timeout", "timed_out"].includes(normalized)) {
    return "expired";
  }

  if (["declined", "decline", "rejected", "canceled", "cancelled"].includes(normalized)) {
    return "declined";
  }

  if (["failed", "fail", "error", "errored"].includes(normalized)) {
    return "failed";
  }

  if (["processing", "in_progress", "attempting"].includes(normalized)) {
    return "processing";
  }

  if (["pending", "created", "waiting", "new", "initialized", ""].includes(normalized)) {
    return "pending";
  }

  return "unknown";
}

export function mapTransVoucherMethod(
  method: Exclude<PaymentMethodName, "Archive Balance" | "Crypto">,
): TransVoucherMethod {
  switch (method) {
    case "Apple Pay":
      return "apple-pay";
    case "Google Pay":
      return "google-pay";
    case "Credit Card":
    default:
      return "card";
  }
}

export function buildTransVoucherReturnUrls(transactionId: string) {
  return {
    successUrl: `${APP_BASE_URL}/payment/success?tx=${encodeURIComponent(transactionId)}`,
    cancelUrl: `${APP_BASE_URL}/payment/declined?tx=${encodeURIComponent(transactionId)}`,
    redirectUrl: `${APP_BASE_URL}/payment/return?tx=${encodeURIComponent(transactionId)}`,
  };
}

async function transVoucherRequest<T>(pathname: string, init?: RequestInit): Promise<T> {
  const config = getTransVoucherConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${pathname}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
        "X-API-Secret": config.apiSecret,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : typeof payload?.error === "string"
          ? payload.error
          : "TransVoucher request failed.";
    throw new Error(message);
  }

  return payload as T;
}

function extractTransVoucherEnvelope(payload: TransVoucherApiResponse) {
  return payload?.data ?? payload?.result ?? payload ?? {};
}

function extractTransVoucherStatus(envelope: TransVoucherEnvelope) {
  const record = envelope as Record<string, unknown>;
  return normalizeStatus(
    envelope.status ??
      envelope.payment_status ??
      envelope.paymentStatus ??
      envelope.transaction_status ??
      envelope.transactionStatus ??
      envelope.provider_status ??
      envelope.providerStatus ??
      record.result ??
      envelope.state,
  );
}

function normalizeCustomerEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  return email || null;
}

export function buildTransVoucherPaymentCreateBody(
  payload: TransVoucherPaymentCreatePayload,
) {
  const customerEmail = normalizeCustomerEmail(payload.customerDetails.email);
  const customerDetails = customerEmail ? { email: customerEmail } : {};
  const metadata = {
    ...payload.metadata,
    ...(customerEmail ? { customer_email: customerEmail } : {}),
  };

  return {
    amount: payload.amount,
    currency: payload.currency,
    title: payload.title,
    description: payload.description,
    success_url: payload.successUrl,
    cancel_url: payload.cancelUrl,
    redirect_url: payload.redirectUrl,
    // TransVoucher has accepted customer_details in the current integration.
    // The aliases below keep hosted checkout email prefill working if their
    // frontend reads a different customer field than the API stores.
    customer_details: customerDetails,
    customerDetails,
    customer: customerDetails,
    customer_email: customerEmail,
    email: customerEmail,
    payer_email: customerEmail,
    metadata,
    theme: payload.theme ?? "dark",
    lang: payload.lang ?? "en",
    default_payment_method: payload.defaultPaymentMethod,
    payment_method_forced: payload.paymentMethodForced,
  };
}

export async function createTransVoucherPayment(
  payload: TransVoucherPaymentCreatePayload,
): Promise<TransVoucherPaymentResponse> {
  const result = await transVoucherRequest<TransVoucherApiResponse>("/payment/create", {
    method: "POST",
    body: JSON.stringify(buildTransVoucherPaymentCreateBody(payload)),
  });

  const envelope = extractTransVoucherEnvelope(result);

  return {
    transactionId: String(
      envelope.transaction_id ?? envelope.transactionId ?? envelope.id ?? "",
    ),
    referenceId:
      envelope.reference_id || envelope.referenceId
        ? String(envelope.reference_id ?? envelope.referenceId)
        : null,
    paymentUrl: String(
      envelope.payment_url ??
        envelope.paymentUrl ??
        envelope.payment_link ??
        envelope.paymentLink ??
        envelope.url ??
        "",
    ),
    embedUrl:
      envelope.embed_url || envelope.embedUrl
        ? String(envelope.embed_url ?? envelope.embedUrl)
        : null,
    useEmbed: Boolean(envelope.use_embed ?? envelope.useEmbed),
    expiresAt:
      envelope.expires_at || envelope.expiresAt
        ? String(envelope.expires_at ?? envelope.expiresAt)
        : null,
    amount: Number(envelope.amount ?? payload.amount),
    currency: String(envelope.currency ?? payload.currency),
    status: extractTransVoucherStatus(envelope),
    raw: result,
  };
}

export async function getTransVoucherPaymentStatus(
  transactionId: string,
): Promise<TransVoucherStatusResponse> {
  const result = await transVoucherRequest<TransVoucherApiResponse>(
    `/payment/status/${encodeURIComponent(transactionId)}`,
    { method: "GET" },
  );
  const envelope = extractTransVoucherEnvelope(result);

  return {
    transactionId: String(
      envelope.transaction_id ?? envelope.transactionId ?? transactionId,
    ),
    referenceId:
      envelope.reference_id || envelope.referenceId
        ? String(envelope.reference_id ?? envelope.referenceId)
        : null,
    status: extractTransVoucherStatus(envelope),
    amount:
      envelope.amount === null || envelope.amount === undefined
        ? null
        : Number(envelope.amount),
    currency:
      envelope.currency === null || envelope.currency === undefined
        ? null
        : String(envelope.currency),
    paidAt:
      envelope.paid_at || envelope.paidAt
        ? String(envelope.paid_at ?? envelope.paidAt)
        : null,
    paymentUrl:
      envelope.payment_url || envelope.paymentUrl
        ? String(envelope.payment_url ?? envelope.paymentUrl)
        : null,
    raw: result,
  };
}

export function verifyTransVoucherWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
) {
  const requireSignature = process.env.TRANSVOUCHER_WEBHOOK_REQUIRE_SIGNATURE === "true";
  const webhookSecret = process.env.TRANSVOUCHER_WEBHOOK_SECRET?.trim() ?? "";

  if (!signatureHeader) {
    return !requireSignature;
  }

  if (!signatureHeader.startsWith("sha256=")) {
    return false;
  }

  if (!webhookSecret) {
    return false;
  }

  const provided = signatureHeader.slice("sha256=".length).trim();
  const expected = createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  const providedBuffer = Buffer.from(provided, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
