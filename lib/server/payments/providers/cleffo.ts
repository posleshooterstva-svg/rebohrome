import "server-only";
import { createHmac } from "crypto";
import {
  CLEFFO_API_KEY,
  CLEFFO_BASE_URL,
  CLEFFO_CLIENT_KEY,
  CLEFFO_ENV,
  CLEFFO_PRODUCT_IMAGE_URL,
  CLEFFO_SIGNATURE_KEY,
} from "@/lib/server-config";
import type { SupportedCurrency } from "@/lib/rebohrome-data";

type CleffoJson = Record<string, unknown>;

type CleffoPaymentInput = {
  merchantOrderId: string;
  amount: number;
  currency: SupportedCurrency;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  redirectUrl: string;
  metadata: Record<string, string | number | null>;
};

type CleffoStatus = {
  transactionReferenceNumber: string | null;
  referenceId: string | null;
  status: string;
  paymentUrl: string | null;
  paidAt: string | null;
  raw: CleffoJson;
};

function assertCleffoConfigured() {
  if (!CLEFFO_API_KEY || !CLEFFO_SIGNATURE_KEY || !CLEFFO_CLIENT_KEY) {
    throw new Error("Gate #2 is not configured yet.");
  }
}

function cleffoUrl(path: string) {
  return `${CLEFFO_BASE_URL.replace(/\/+$/, "")}${path}`;
}

function signPayload(rawBody: string) {
  return createHmac("sha256", CLEFFO_SIGNATURE_KEY)
    .update(rawBody)
    .digest("hex");
}

function normalizeCleffoStatus(status: unknown) {
  const raw = String(status ?? "").trim().toLowerCase();

  if (["success", "succeeded", "paid", "completed", "complete"].includes(raw)) {
    return "completed";
  }

  if (["failed", "declined", "cancelled", "canceled", "expired", "rejected"].includes(raw)) {
    return raw === "expired" ? "expired" : "failed";
  }

  return "pending";
}

function pickString(source: unknown, keys: string[]): string | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function isPaymentLikeUrl(value: string) {
  if (!/^https?:\/\//i.test(value.trim())) {
    return false;
  }

  return /(pay|payment|checkout|invoice|link|redirect)/i.test(value);
}

function findUrlDeep(source: unknown, depth = 0): string | null {
  if (depth > 6 || !source) {
    return null;
  }

  if (typeof source === "string") {
    return isPaymentLikeUrl(source) ? source.trim() : null;
  }

  if (Array.isArray(source)) {
    for (const item of source) {
      const found = findUrlDeep(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof source !== "object") {
    return null;
  }

  const record = source as Record<string, unknown>;
  const preferredEntries = Object.entries(record).filter(([key]) =>
    /(pay|payment|checkout|invoice|link|redirect|url)/i.test(key),
  );
  const entries = [...preferredEntries, ...Object.entries(record)];

  for (const [, value] of entries) {
    const found = findUrlDeep(value, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

function summarizeCleffoShape(source: unknown): unknown {
  if (!source || typeof source !== "object") {
    return typeof source;
  }

  if (Array.isArray(source)) {
    return source.slice(0, 3).map((item) => summarizeCleffoShape(item));
  }

  return Object.fromEntries(
    Object.entries(source as Record<string, unknown>).map(([key, value]) => [
      key,
      value && typeof value === "object" ? summarizeCleffoShape(value) : typeof value,
    ]),
  );
}

function extractCleffoErrorMessage(body: CleffoJson) {
  const direct =
    pickString(body, ["message", "error", "detail"]) ??
    pickString(body.data, ["message", "error", "detail"]) ??
    pickString(body.errors, ["message", "error", "detail"]);

  const formErrors =
    body.errors &&
    typeof body.errors === "object" &&
    "form_errors" in body.errors &&
    (body.errors as Record<string, unknown>).form_errors;

  if (formErrors && typeof formErrors === "object") {
    const firstError = Object.entries(formErrors as Record<string, unknown>)
      .map(([field, message]) =>
        typeof message === "string" && message.trim()
          ? `${field}: ${message.trim()}`
          : null,
      )
      .find(Boolean);

    if (firstError) {
      return firstError;
    }
  }

  return direct;
}

function extractPaymentUrl(payload: CleffoJson) {
  const candidates = [
    payload,
    payload.data,
    payload.result,
    payload.payment_link,
    payload.paymentLink,
  ];

  for (const candidate of candidates) {
    const direct = pickString(candidate, [
      "payment_url",
      "paymentUrl",
      "payment_link",
      "paymentLink",
      "checkout_url",
      "checkoutUrl",
      "url",
      "link",
    ]);
    if (direct) {
      return direct;
    }

    if (candidate && typeof candidate === "object") {
      const nested = (candidate as Record<string, unknown>).payment_link;
      const nestedUrl = pickString(nested, ["url", "link", "payment_url"]);
      if (nestedUrl) {
        return nestedUrl;
      }
    }
  }

  return findUrlDeep(payload);
}

function extractReference(payload: CleffoJson) {
  return (
    pickString(payload, ["transaction_reference_number", "transactionReferenceNumber"]) ??
    pickString(payload.data, ["transaction_reference_number", "transactionReferenceNumber"]) ??
    pickString(payload.result, ["transaction_reference_number", "transactionReferenceNumber"])
  );
}

function extractStatus(payload: CleffoJson) {
  return (
    pickString(payload, ["status", "payment_status", "paymentStatus"]) ??
    pickString(payload.data, ["status", "payment_status", "paymentStatus"]) ??
    pickString(payload.result, ["status", "payment_status", "paymentStatus"]) ??
    "pending"
  );
}

async function parseCleffoResponse(response: Response) {
  const text = await response.text();
  let body: CleffoJson = {};

  if (text.trim()) {
    try {
      body = JSON.parse(text) as CleffoJson;
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    const message =
      extractCleffoErrorMessage(body) ??
      `Gate #2 request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  if (body.status === false) {
    const message =
      extractCleffoErrorMessage(body) ?? "Gate #2 request was rejected by Cleffo.";
    throw new Error(message);
  }

  return body;
}

export async function createCleffoPaymentLink(input: CleffoPaymentInput) {
  assertCleffoConfigured();

  const total = Number(input.amount.toFixed(2));
  const body = {
    data: {
      merchant_order_id: input.merchantOrderId,
      customer_detail: {
        name: `${input.customer.firstName} ${input.customer.lastName}`.trim(),
        email: input.customer.email,
        phone_no: input.customer.phone,
      },
      products: [
        {
          name: "ReboHrome Balance Top-Up",
          product_id: input.merchantOrderId,
          description: "Archive balance top-up",
          price: total,
          quantity: 1,
          image: CLEFFO_PRODUCT_IMAGE_URL,
        },
      ],
      price: {
        sub_total: total,
        tax: 0,
        total,
        currency: input.currency,
      },
    },
    metadata: {
      source: "api",
      cleffo_client_key: CLEFFO_CLIENT_KEY,
      redirect_url: input.redirectUrl,
      cleffo_env: CLEFFO_ENV,
      ...input.metadata,
    },
  };
  const rawBody = JSON.stringify(body);
  const response = await fetch(cleffoUrl("/api/payment-link"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLEFFO_API_KEY,
      "x-signature": signPayload(rawBody),
    },
    body: rawBody,
    cache: "no-store",
  });
  const raw = await parseCleffoResponse(response);
  const paymentUrl = extractPaymentUrl(raw);

  if (!paymentUrl) {
    console.warn("Cleffo payment-link response did not include a detectable payment URL.", {
      shape: summarizeCleffoShape(raw),
    });
    throw new Error("Cleffo did not return payment URL.");
  }

  const transactionReferenceNumber =
    extractReference(raw) ?? input.merchantOrderId;
  const status = normalizeCleffoStatus(extractStatus(raw));

  return {
    transactionId: transactionReferenceNumber,
    referenceId: input.merchantOrderId,
    paymentUrl,
    status,
    raw,
  };
}

export async function getCleffoPaymentLinkStatus(
  transactionReferenceNumber: string,
): Promise<CleffoStatus> {
  assertCleffoConfigured();

  const response = await fetch(
    cleffoUrl(
      `/api/payment-link/status/${encodeURIComponent(transactionReferenceNumber)}`,
    ),
    {
      method: "GET",
      headers: {
        "x-api-key": CLEFFO_API_KEY,
        "x-signature": signPayload(""),
      },
      cache: "no-store",
    },
  );
  const raw = await parseCleffoResponse(response);
  const status = normalizeCleffoStatus(extractStatus(raw));

  return {
    transactionReferenceNumber:
      extractReference(raw) ?? transactionReferenceNumber,
    referenceId:
      pickString(raw, ["merchant_order_id", "merchantOrderId"]) ??
      pickString(raw.data, ["merchant_order_id", "merchantOrderId"]),
    status,
    paymentUrl: extractPaymentUrl(raw),
    paidAt:
      pickString(raw, ["paid_at", "paidAt", "completed_at", "completedAt"]) ??
      pickString(raw.data, ["paid_at", "paidAt", "completed_at", "completedAt"]),
    raw,
  };
}
