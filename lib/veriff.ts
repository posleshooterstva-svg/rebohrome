import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import {
  SITE_BASE_URL,
  VERIFF_API_KEY,
  VERIFF_BASE_URL,
  VERIFF_SHARED_SECRET,
  VERIFF_VENDOR_DATA_PREFIX,
  VERIFF_WEBHOOK_SECRET,
} from "@/lib/server-config";

type VeriffSessionInput = {
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  documentCountry: string;
  email?: string | null;
  phone?: string | null;
  address?: {
    fullAddress?: string | null;
    city?: string | null;
    postcode?: string | null;
    state?: string | null;
  };
};

type VeriffSessionResult = {
  sessionId: string | null;
  verificationId: string | null;
  verificationUrl: string;
  status: string | null;
  raw: unknown;
};

export type NormalizedVeriffStatus = {
  status: string;
  verified: boolean;
  internalStatus:
    | "submitted"
    | "review"
    | "approved"
    | "declined"
    | "expired"
    | "abandoned";
  decision: string | null;
  reason: string | null;
};

export type VeriffWebhookFields = {
  vendorData: string | null;
  sessionId: string | null;
  verificationId: string | null;
  eventType: string | null;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function extractString(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() ? value.trim() : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getNestedString(source: unknown, path: string[]) {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return extractString(current);
}

function normalizeBaseUrl() {
  return trimTrailingSlash(VERIFF_BASE_URL || "https://stationapi.veriff.com");
}

export function buildVeriffVendorData(userId: string) {
  return `${VERIFF_VENDOR_DATA_PREFIX}:${userId}`;
}

export function extractVeriffUserId(vendorData: string | null | undefined) {
  const value = vendorData?.trim();
  if (!value) {
    return null;
  }

  const prefixes = [
    `${VERIFF_VENDOR_DATA_PREFIX}:`,
    `${VERIFF_VENDOR_DATA_PREFIX}_`,
    "rebohrome_user:",
    "rebohrome_user_",
  ];

  for (const prefix of prefixes) {
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length).trim() || null;
    }
  }

  return value;
}

function collectNestedStrings(payload: unknown, paths: string[][]) {
  return paths
    .map((path) => getNestedString(payload, path))
    .filter(Boolean)
    .map((value) => String(value));
}

export function extractVeriffWebhookFields(payload: unknown): VeriffWebhookFields {
  const vendorData =
    collectNestedStrings(payload, [
      ["verification", "vendorData"],
      ["data", "verification", "vendorData"],
      ["data", "vendorData"],
      ["vendorData"],
    ])[0] ?? null;
  const sessionId =
    collectNestedStrings(payload, [
      ["verification", "id"],
      ["verification", "sessionId"],
      ["data", "verification", "id"],
      ["data", "verification", "sessionId"],
      ["data", "id"],
      ["data", "sessionId"],
      ["id"],
      ["sessionId"],
    ])[0] ?? null;
  const verificationId =
    collectNestedStrings(payload, [
      ["verification", "verificationId"],
      ["data", "verification", "verificationId"],
      ["verificationId"],
    ])[0] ?? sessionId;
  const eventType =
    collectNestedStrings(payload, [
      ["event"],
      ["type"],
      ["action"],
      ["data", "event"],
      ["data", "type"],
      ["data", "action"],
    ])[0] ?? null;

  return {
    vendorData,
    sessionId,
    verificationId,
    eventType,
  };
}

export function normalizeVeriffStatus(payload: unknown): NormalizedVeriffStatus {
  const values = [
    ...collectNestedStrings(payload, [
      ["verification", "decision", "status"],
      ["verification", "decision", "code"],
      ["verification", "decision", "verificationDecision"],
      ["verification", "decision"],
      ["verification", "status"],
      ["verification", "code"],
      ["data", "verification", "decision", "status"],
      ["data", "verification", "decision", "code"],
      ["data", "verification", "decision", "verificationDecision"],
      ["data", "verification", "decision"],
      ["data", "verification", "status"],
      ["data", "verification", "code"],
      ["data", "decision", "status"],
      ["data", "decision", "code"],
      ["data", "decision", "verificationDecision"],
      ["data", "decision"],
      ["data", "status"],
      ["data", "action"],
      ["data", "code"],
      ["decision", "status"],
      ["decision", "code"],
      ["decision", "verificationDecision"],
      ["decision"],
      ["status"],
      ["action"],
      ["code"],
    ]),
  ]
    .map((value) => String(value).toLowerCase());
  const status = values[0] ?? "unknown";
  const reason =
    getNestedString(payload, ["verification", "reason"]) ??
    getNestedString(payload, ["verification", "comment"]) ??
    getNestedString(payload, ["data", "verification", "reason"]) ??
    getNestedString(payload, ["data", "verification", "comment"]) ??
    getNestedString(payload, ["data", "reason"]) ??
    getNestedString(payload, ["data", "comment"]) ??
    getNestedString(payload, ["reason"]) ??
    getNestedString(payload, ["comment"]) ??
    null;

  if (values.some((value) => ["approved", "positive", "verified", "9001"].includes(value))) {
    return { status, verified: true, internalStatus: "approved", decision: "approved", reason };
  }

  if (values.some((value) => ["declined", "negative", "rejected", "9102"].includes(value))) {
    return { status, verified: false, internalStatus: "declined", decision: "declined", reason };
  }

  if (values.some((value) => ["expired", "9104"].includes(value))) {
    return { status, verified: false, internalStatus: "expired", decision: "expired", reason };
  }

  if (values.some((value) => ["abandoned"].includes(value))) {
    return { status, verified: false, internalStatus: "abandoned", decision: "abandoned", reason };
  }

  if (
    values.some((value) =>
      ["review", "resubmission_requested", "pending", "submitted", "started", "7001", "7002", "9103", "9121"].includes(value),
    )
  ) {
    return { status, verified: false, internalStatus: "review", decision: null, reason };
  }

  return { status, verified: false, internalStatus: "review", decision: null, reason };
}

function buildSessionPayload(input: VeriffSessionInput) {
  const callback = `${trimTrailingSlash(SITE_BASE_URL)}/dashboard/verification/result`;
  const address =
    input.address?.fullAddress
    ? {
        fullAddress: input.address.fullAddress,
        city: input.address.city || undefined,
        postcode: input.address.postcode || undefined,
        state: input.address.state || undefined,
      }
    : undefined;

  return {
    verification: {
      callback,
      vendorData: buildVeriffVendorData(input.userId),
      endUserId: input.userId,
      person: {
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
        email: input.email || undefined,
        phoneNumber: input.phone || undefined,
      },
      address,
      document: {
        country: input.documentCountry,
      },
    },
  };
}

function extractSessionResult(raw: unknown): VeriffSessionResult {
  const verification = raw && typeof raw === "object"
    ? (raw as Record<string, unknown>).verification
    : null;
  const sessionId =
    getNestedString(raw, ["verification", "id"]) ??
    getNestedString(raw, ["verification", "sessionId"]) ??
    getNestedString(raw, ["sessionId"]) ??
    getNestedString(raw, ["id"]);
  const verificationId =
    getNestedString(raw, ["verification", "verificationId"]) ??
    getNestedString(raw, ["verification", "id"]) ??
    sessionId;
  const verificationUrl =
    getNestedString(raw, ["verification", "url"]) ??
    getNestedString(raw, ["verification", "sessionUrl"]) ??
    getNestedString(raw, ["url"]) ??
    getNestedString(raw, ["sessionUrl"]);
  const status =
    getNestedString(raw, ["verification", "status"]) ??
    getNestedString(raw, ["status"]);

  if (!verificationUrl) {
    throw new Error("Veriff session was created without a verification URL.");
  }

  return {
    sessionId,
    verificationId,
    verificationUrl,
    status,
    raw: verification ?? raw,
  };
}

export async function createVeriffSession(input: VeriffSessionInput) {
  if (!VERIFF_API_KEY) {
    throw new Error("Veriff API key is not configured.");
  }

  const body = JSON.stringify(buildSessionPayload(input));
  const response = await fetch(`${normalizeBaseUrl()}/v1/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-AUTH-CLIENT": VERIFF_API_KEY,
    },
    body,
  });

  const text = await response.text();
  const raw = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message =
      getNestedString(raw, ["message"]) ??
      getNestedString(raw, ["error"]) ??
      "Unable to create Veriff session.";
    const code = getNestedString(raw, ["code"]);
    throw new Error(code ? `Veriff session failed (${code}): ${message}` : message);
  }

  return extractSessionResult(raw);
}

export async function fetchVeriffSessionStatus(sessionId: string) {
  if (!VERIFF_API_KEY) {
    throw new Error("Veriff API key is not configured.");
  }
  if (!VERIFF_SHARED_SECRET) {
    throw new Error("Veriff shared secret is not configured.");
  }

  const response = await fetch(
    `${normalizeBaseUrl()}/v1/sessions/${encodeURIComponent(sessionId)}/decision`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-CLIENT": VERIFF_API_KEY,
        "X-HMAC-SIGNATURE": digest(VERIFF_SHARED_SECRET, sessionId),
      },
      cache: "no-store",
    },
  );
  const text = await response.text();
  let raw: unknown = {};

  if (text) {
    try {
      raw = JSON.parse(text);
    } catch {
      raw = { status: response.status, message: text.slice(0, 300) };
    }
  }

  if (!response.ok) {
    const message =
      getNestedString(raw, ["message"]) ??
      getNestedString(raw, ["error"]) ??
      `Veriff status request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return raw;
}

function digest(secret: string, rawBody: string) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyVeriffWebhookSignature(rawBody: string, signature: string | null) {
  const secret = VERIFF_WEBHOOK_SECRET || VERIFF_SHARED_SECRET;
  if (!secret || !signature) {
    return false;
  }

  const expected = digest(secret, rawBody);
  const normalized = signature.replace(/^sha256=/i, "").trim();
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(normalized, "hex");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function getVeriffWebhookAuthClientIsValid(value: string | null) {
  return !value || !VERIFF_API_KEY || value === VERIFF_API_KEY;
}
