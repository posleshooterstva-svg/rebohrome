import { NextResponse } from "next/server";
import { createTelegramVerificationChallenge } from "@/lib/db/repository";
import { getRequestMeta } from "@/lib/session";

type RegisterSendCodePayload = {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  telegramUsername?: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RegisterSendCodePayload;
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

    const meta = await getRequestMeta("/register");
    const challenge = await createTelegramVerificationChallenge({
      username,
      email,
      telegramUsername,
      password,
      ipAddress: meta.ipAddress,
      country: meta.country,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({
      ok: true,
      verificationId: challenge.verificationId,
      expiresAt: challenge.expiresAt,
      resendCooldownSeconds: challenge.resendCooldownSeconds,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to send a verification code.",
      },
      { status: 400 },
    );
  }
}
