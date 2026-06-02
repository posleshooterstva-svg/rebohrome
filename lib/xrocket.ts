import "server-only";

import {
  XROCKET_API_BASE_URL,
  XROCKET_API_KEY,
  XROCKET_DEFAULT_CURRENCY,
  XROCKET_DEFAULT_NETWORK,
} from "@/lib/server-config";

type XRocketJson = Record<string, unknown>;

function getBaseUrl() {
  return XROCKET_API_BASE_URL.replace(/\/+$/, "");
}

function getAuthHeaders() {
  if (!XROCKET_API_KEY) {
    throw new Error("xRocket API key is not configured.");
  }

  return {
    Authorization: `Bearer ${XROCKET_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function requestXRocket<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T) : ({} as T);

  if (!response.ok) {
    const safeMessage =
      typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message?: unknown }).message)
        : `xRocket request failed with HTTP ${response.status}.`;
    throw new Error(safeMessage);
  }

  return payload;
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

  return requestXRocket<XRocketJson>("/api/v1/withdrawals", {
    method: "POST",
    body: JSON.stringify({
      network,
      currency,
      amount: input.amount,
      address: input.address,
      clientWithdrawalId: input.clientWithdrawalId,
      externalId: input.clientWithdrawalId,
    }),
  });
}

export async function getXRocketWithdrawalInfo(withdrawalId: string) {
  return requestXRocket<XRocketJson>(
    `/api/v1/withdrawals/${encodeURIComponent(withdrawalId)}`,
  );
}

export async function getXRocketWithdrawalQuotas() {
  return requestXRocket<XRocketJson>("/api/v1/withdrawal-quotas");
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
      data?.id ??
      data?.withdrawalId ??
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
  return ["failed", "error", "declined", "rejected", "canceled", "cancelled"].includes(
    status.toLowerCase(),
  );
}
