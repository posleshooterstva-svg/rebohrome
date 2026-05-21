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
    username: string;
    telegramUsername?: string | null;
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
  url?: string;
  expires_at?: string;
  expiresAt?: string;
  amount?: number | string;
  currency?: string;
  status?: string;
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
  const response = await fetch(`${config.baseUrl}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": config.apiKey,
      "X-API-Secret": config.apiSecret,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

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

export async function createTransVoucherPayment(
  payload: TransVoucherPaymentCreatePayload,
): Promise<TransVoucherPaymentResponse> {
  const result = await transVoucherRequest<TransVoucherApiResponse>("/payment/create", {
    method: "POST",
    body: JSON.stringify({
      amount: payload.amount,
      currency: payload.currency,
      title: payload.title,
      description: payload.description,
      success_url: payload.successUrl,
      cancel_url: payload.cancelUrl,
      redirect_url: payload.redirectUrl,
      customer_details: payload.customerDetails,
      metadata: payload.metadata,
      theme: payload.theme ?? "light",
      lang: payload.lang ?? "en",
      default_payment_method: payload.defaultPaymentMethod,
      payment_method_forced: payload.paymentMethodForced,
    }),
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
      envelope.payment_url ?? envelope.paymentUrl ?? envelope.url ?? "",
    ),
    expiresAt:
      envelope.expires_at || envelope.expiresAt
        ? String(envelope.expires_at ?? envelope.expiresAt)
        : null,
    amount: Number(envelope.amount ?? payload.amount),
    currency: String(envelope.currency ?? payload.currency),
    status: normalizeStatus(envelope.status),
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
    status: normalizeStatus(envelope.status),
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
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const config = getTransVoucherConfig();
  const provided = signatureHeader.slice("sha256=".length).trim();
  const expected = createHmac("sha256", config.webhookSecret)
    .update(rawBody)
    .digest("hex");

  const providedBuffer = Buffer.from(provided, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
