import "server-only";

import {
  XROCKET_API_BASE_URL,
  XROCKET_API_KEY,
  XROCKET_DEFAULT_CURRENCY,
  XROCKET_DEFAULT_NETWORK,
} from "@/lib/server-config";

type XRocketJson = Record<string, unknown>;
type XRocketErrorPayload = {
  message?: unknown;
  detail?: unknown;
  title?: unknown;
  errors?: unknown;
};

function getBaseUrl() {
  return XROCKET_API_BASE_URL.replace(/\/+$/, "");
}

function getAuthHeaders() {
  if (!XROCKET_API_KEY) {
    throw new Error("xRocket Rocket-Pay-Key is not configured.");
  }

  return {
    "Rocket-Pay-Key": XROCKET_API_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function requestXRocket<T>(path: string, init?: RequestInit) {
  const url = `${getBaseUrl()}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const looksJson =
    contentType.includes("application/json") ||
    text.trim().startsWith("{") ||
    text.trim().startsWith("[");
  const payload = text && looksJson ? (JSON.parse(text) as T) : ({} as T);

  if (!response.ok) {
    const formattedErrors = formatXRocketErrors(payload as XRocketErrorPayload);
    const payloadMessage =
      typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message?: unknown }).message)
        : typeof payload === "object" && payload && "detail" in payload
          ? String((payload as { detail?: unknown }).detail)
          : typeof payload === "object" && payload && "title" in payload
            ? String((payload as { title?: unknown }).title)
            : "";
    const safeMessage =
      formattedErrors ||
      payloadMessage ||
      `xRocket request failed with HTTP ${response.status} at ${url}.`;
    throw new Error(safeMessage);
  }

  if (text && !looksJson) {
    throw new Error(
      `xRocket returned a non-JSON response at ${url}. Check XROCKET_API_BASE_URL.`,
    );
  }

  return payload;
}

function formatXRocketErrors(payload: XRocketErrorPayload) {
  if (!Array.isArray(payload.errors) || payload.errors.length === 0) {
    return "";
  }

  return payload.errors
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return "";
      }

      const property =
        "property" in entry ? String((entry as { property?: unknown }).property) : "";
      const error = "error" in entry ? String((entry as { error?: unknown }).error) : "";

      return [property, error].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .slice(0, 4)
    .join("; ");
}

export async function createXRocketWithdrawal(input: {
  clientWithdrawalId: string;
  amount: number;
  address: string;
  network?: string;
  currency?: string;
}) {
  const network = input.network ?? XROCKET_DEFAULT_NETWORK;
  const currency = input.currency ?? XROCKET_DEFAULT_CURRENCY;

  return requestXRocket<XRocketJson>("/app/withdrawal", {
    method: "POST",
    body: JSON.stringify({
      network,
      currency,
      amount: input.amount,
      address: input.address,
      withdrawalId: input.clientWithdrawalId,
    }),
  });
}

export async function createXRocketAppDeposit(input: {
  depositId: string;
  amount: number;
  currency?: string;
}) {
  const currency = input.currency ?? XROCKET_DEFAULT_CURRENCY;

  return requestXRocket<XRocketJson>("/app/deposit", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amount,
      coinCode: currency,
      depositId: input.depositId,
    }),
  });
}

export async function getXRocketWithdrawalInfo(withdrawalId: string) {
  return requestXRocket<XRocketJson>(
    `/app/withdrawal/status/${encodeURIComponent(withdrawalId)}`,
  );
}

export async function getXRocketWithdrawalQuotas() {
  return requestXRocket<XRocketJson>("/app/withdrawal/fees");
}

export function extractXRocketWithdrawalFee(
  payload: XRocketJson,
  currency: string,
  network: string,
) {
  const data = Array.isArray(payload.data)
    ? payload.data
    : typeof payload.data === "object" && payload.data && "results" in payload.data
      ? (payload.data as { results?: unknown }).results
      : null;
  const entries = Array.isArray(data) ? data : [];
  const currencyEntry = entries.find((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    const code =
      "code" in entry
        ? String((entry as { code?: unknown }).code)
        : "currency" in entry
          ? String((entry as { currency?: unknown }).currency)
          : "";
    return code.toUpperCase() === currency.toUpperCase();
  }) as { fees?: unknown; networks?: unknown } | undefined;

  const networks = Array.isArray(currencyEntry?.fees)
    ? currencyEntry.fees
    : Array.isArray(currencyEntry?.networks)
      ? currencyEntry.networks
      : [];
  const networkEntry = networks.find((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    const code =
      "networkCode" in entry
        ? String((entry as { networkCode?: unknown }).networkCode)
        : "";
    return code.toUpperCase() === network.toUpperCase();
  }) as { feeWithdraw?: unknown } | undefined;

  const feeWithdraw =
    networkEntry?.feeWithdraw && typeof networkEntry.feeWithdraw === "object"
      ? (networkEntry.feeWithdraw as { fee?: unknown })
      : null;
  const fee = Number(feeWithdraw?.fee ?? 0);

  return Number.isFinite(fee) ? fee : 0;
}

export function extractXRocketWithdrawalId(payload: XRocketJson) {
  const data = typeof payload.data === "object" && payload.data ? payload.data as XRocketJson : null;
  const withdrawal =
    typeof payload.withdrawal === "object" && payload.withdrawal
      ? payload.withdrawal as XRocketJson
      : null;

  return String(
      payload.id ??
      payload.withdrawalId ??
      payload.uuid ??
      data?.withdrawalId ??
      data?.id ??
      withdrawal?.id ??
      withdrawal?.withdrawalId ??
      "",
  );
}

export function extractXRocketStatus(payload: XRocketJson) {
  const data = typeof payload.data === "object" && payload.data ? payload.data as XRocketJson : null;
  const withdrawal =
    typeof payload.withdrawal === "object" && payload.withdrawal
      ? payload.withdrawal as XRocketJson
      : null;
  return String(
    payload.status ??
      payload.state ??
      data?.status ??
      data?.state ??
      withdrawal?.status ??
      withdrawal?.state ??
      "processing",
  ).toLowerCase();
}

export function extractXRocketTxHash(payload: XRocketJson) {
  const data = typeof payload.data === "object" && payload.data ? payload.data as XRocketJson : null;
  return String(
    payload.txHash ??
      payload.transactionHash ??
      payload.hash ??
      data?.txHash ??
      data?.transactionHash ??
      data?.hash ??
      "",
  );
}

export function isXRocketPaidStatus(status: string) {
  return ["paid", "success", "succeeded", "completed", "confirmed", "done"].includes(
    status.toLowerCase(),
  );
}

export function isXRocketFailedStatus(status: string) {
  return ["failed", "fail", "error", "declined", "rejected", "canceled", "cancelled"].includes(
    status.toLowerCase(),
  );
}
