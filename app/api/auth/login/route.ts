import { limitAuthAttempt } from "@/lib/auth/rate-limit";
import { safeRedirect } from "@/lib/security";
import { NextResponse } from "next/server";
import { buildSessionCookieDescriptor } from "@/lib/auth/session-cookie";
import {
  authenticateUser,
  createSessionForUser,
  trackUserLogin,
} from "@/lib/db/repository";
import { getRequestMeta } from "@/lib/session";

export const runtime = "nodejs";


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

  if (username.length>100 || password.length>128) return NextResponse.json({error:"Invalid credentials."},{status:400});
  try { await limitAuthAttempt(username,(await getRequestMeta()).ipAddress); }
  catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Login unavailable."},{status:429}); }
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
    user.requirePasswordReset ? "/change-password" : user.role === "admin" ? "/admin" : safeRedirect(payload.redirectTo);
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
