import { NextResponse } from "next/server";
import { buildSessionCookieDescriptor } from "@/lib/auth/session-cookie";
import {
  completeTelegramRegistrationVerification,
  createSessionForUser,
  trackUserRegistered,
} from "@/lib/db/repository";
import { getRequestMeta } from "@/lib/session";

type RegisterVerifyCodePayload = {
  verificationId?: string;
  code?: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RegisterVerifyCodePayload;
    const verificationId = String(payload.verificationId ?? "").trim();
    const code = String(payload.code ?? "").trim();

    if (!verificationId) {
      return NextResponse.json(
        { ok: false, error: "Missing verification request." },
        { status: 400 },
      );
    }

    const meta = await getRequestMeta("/register");
    const verification = await completeTelegramRegistrationVerification({
      verificationId,
      code,
    });

    const token = await createSessionForUser({
      userId: verification.userId,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    await trackUserRegistered({
      eventType: "user_registered",
      userId: verification.userId,
      username: verification.username,
      telegramUsername: verification.telegramUsername,
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
      redirectPath: "/dashboard",
    });
    const descriptor = buildSessionCookieDescriptor(token, request.headers);
    response.cookies.set(descriptor.name, descriptor.value, descriptor.options);
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to verify the registration code.",
      },
      { status: 400 },
    );
  }
}
