import "server-only";

import { SESSION_COOKIE_NAME } from "@/lib/rebohrome-data";

export function shouldUseSecureCookies(headerStore: Headers) {
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const origin = headerStore.get("origin");
  const referer = headerStore.get("referer");

  return (
    forwardedProto === "https" ||
    origin?.startsWith("https://") ||
    referer?.startsWith("https://") ||
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV)
  );
}

export function buildSessionCookieDescriptor(token: string, headerStore: Headers) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    options: {
      path: "/",
      sameSite: "lax" as const,
      httpOnly: true,
      secure: shouldUseSecureCookies(headerStore),
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}
