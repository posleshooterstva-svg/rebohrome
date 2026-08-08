import { NextResponse } from "next/server";
import { buildSessionCookieDescriptor } from "@/lib/auth/session-cookie";
import {
  createSessionForUser,
  registerUser,
  trackUserRegistered,
} from "@/lib/db/repository";
import { getRequestMeta } from "@/lib/session";

type RegisterPayload = {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  telegramUsername?: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RegisterPayload;
    const username = String(payload.username ?? "");
    const email = String(payload.email ?? "");
    const password = String(payload.password ?? "");
    const confirmPassword = String(payload.confirmPassword ?? "");
    const telegramUsername = String(payload.telegramUsername ?? "");

    if (password !== confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "Passwords do not match." },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { ok: false, error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    const meta = await getRequestMeta("/register");
    const userId = await registerUser({
      username,
      email,
      password,
      telegramUsername: telegramUsername || null,
    });
    const token = await createSessionForUser({
      userId,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    await trackUserRegistered({
      eventType: "user_registered",
      userId,
      username,
      telegramUsername: telegramUsername || null,
      role: "user",
      ipAddress: meta.ipAddress,
      country: meta.country,
      userAgent: meta.userAgent,
      language: meta.language,
      route: meta.route,
      timestamp: meta.timestamp,
    });

    const response = NextResponse.json({
      ok: true,
      redirectPath: "/dashboard?verification=required",
    });
    const descriptor = buildSessionCookieDescriptor(token, request.headers);
    response.cookies.set(descriptor.name, descriptor.value, descriptor.options);
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Unable to create account.",
      },
      { status: 400 },
    );
  }
}
