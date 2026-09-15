/** Parse exact decimal values. Provider amounts may have trailing fractional zeroes. */
export function minorUnits(value: unknown): number {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== "string" || !/^\d+(?:\.\d+)?$/.test(text)) throw new Error("Invalid amount.");
  const [whole, fraction = ""] = text.split(".");
  if (/[1-9]/.test(fraction.slice(2))) throw new Error("Amount must have at most two decimal places.");
  const result = BigInt(whole) * BigInt(100) + BigInt((fraction + "00").slice(0, 2));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount is too large.");
  return Number(result);
}

export function decimalAmount(minor: number) {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error("Invalid minor amount.");
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}
