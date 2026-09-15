import { timingSafeEqual } from "node:crypto";

export function safeRedirect(value: unknown, fallback = "/dashboard") {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\u0000-\u0020]/.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u001f]/.test(decoded)) return fallback;
    const url = new URL(value, "https://local.invalid");
    return url.origin === "https://local.invalid" ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch { return fallback; }
}

export function equalSecret(actual: string | null, expected: string) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authorizeCron(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  return Boolean(secret) && equalSecret(request.headers.get("authorization"), `Bearer ${secret}`);
}
