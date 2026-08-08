import "server-only";

export type CoinflowNormalizedStatus =
  | "settled"
  | "authorized"
  | "declined"
  | "suspected_fraud"
  | "pending_review"
  | "expired"
  | "refunded"
  | "chargeback_opened"
  | "chargeback_won"
  | "chargeback_lost"
  | "pending"
  | "failed";

export function normalizeCoinflowStatus(rawStatus: string): CoinflowNormalizedStatus {
  const normalized = rawStatus.trim().toLowerCase().replace(/[_-]+/g, " ");

  if (normalized.includes("settled") || normalized === "settle") {
    return "settled";
  }
  if (normalized.includes("authorized") || normalized.includes("authorised")) {
    return "authorized";
  }
  if (normalized.includes("declined")) {
    return "declined";
  }
  if (normalized.includes("suspected fraud") || normalized.includes("fraud")) {
    return "suspected_fraud";
  }
  if (normalized.includes("pending review") || normalized.includes("review")) {
    return "pending_review";
  }
  if (normalized.includes("expired") || normalized.includes("expiration")) {
    return "expired";
  }
  if (normalized.includes("refund")) {
    return "refunded";
  }
  if (normalized.includes("chargeback opened")) {
    return "chargeback_opened";
  }
  if (normalized.includes("chargeback won")) {
    return "chargeback_won";
  }
  if (normalized.includes("chargeback lost")) {
    return "chargeback_lost";
  }
  if (normalized.includes("failed") || normalized.includes("error") || normalized.includes("canceled")) {
    return "failed";
  }
  if (normalized.includes("pending") || normalized.includes("created") || normalized.includes("processing")) {
    return "pending";
  }
  return "pending";
}

export function coinflowStatusMessage(status: CoinflowNormalizedStatus) {
  switch (status) {
    case "settled":
      return "Payment confirmed. Balance updated.";
    case "authorized":
    case "pending":
      return "Card payment submitted. Waiting for secure confirmation...";
    case "pending_review":
      return "Payment is under review.";
    case "declined":
      return "Payment was declined by the card issuer.";
    case "expired":
      return "Card payment expired. Please create a new deposit.";
    case "suspected_fraud":
      return "Payment requires additional review.";
    case "refunded":
      return "Payment was refunded.";
    case "chargeback_opened":
    case "chargeback_lost":
    case "chargeback_won":
      return "Payment dispute status was updated.";
    case "failed":
    default:
      return "Card payment could not be completed.";
  }
}

export function mapCoinflowToProviderStatus(status: CoinflowNormalizedStatus) {
  if (status === "settled") {
    return "completed";
  }
  if (
    [
      "declined",
      "expired",
      "failed",
      "suspected_fraud",
      "refunded",
      "chargeback_lost",
    ].includes(status)
  ) {
    return "failed";
  }
  return "pending";
}
