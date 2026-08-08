import { NextResponse } from "next/server";
import { buildSessionCookieDescriptor } from "@/lib/auth/session-cookie";
import {
  authenticateUser,
  createSessionForUser,
  trackUserLogin,
} from "@/lib/db/repository";
import { getRequestMeta } from "@/lib/session";

export const runtime = "nodejs";

function getRedirectPath(value: unknown, fallback: string) {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return fallback;
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid login request." },
      { status: 400 },
    );
  }

  const username = String(payload.username ?? "").trim();
  const password = String(payload.password ?? "");

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required." },
      { status: 400 },
    );
  }

  const user = await authenticateUser({ username, password });

  if (!user) {
    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 401 },
    );
  }

  const meta = await getRequestMeta("/login");
  const token = await createSessionForUser({
    userId: user.id,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });
  const redirectTo =
    user.role === "admin" ? "/admin" : getRedirectPath(payload.redirectTo, "/dashboard");
  const response = NextResponse.json({ ok: true, redirectTo });
  const descriptor = buildSessionCookieDescriptor(token, request.headers);
  response.cookies.set(descriptor.name, descriptor.value, descriptor.options);

  void trackUserLogin({
    eventType: "user_login",
    userId: user.id,
    username: user.username,
    telegramUsername: user.telegramUsername,
    role: user.role,
    ipAddress: meta.ipAddress,
    country: meta.country,
    userAgent: meta.userAgent,
    language: meta.language,
    route: meta.route,
    timestamp: meta.timestamp,
  }).catch((error) => {
    console.warn("Login audit tracking failed", error);
  });

  return response;
}
