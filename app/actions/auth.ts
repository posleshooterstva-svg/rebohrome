"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  authenticateUser,
  createSessionForUser,
  deleteSessionByToken,
  trackUserLogin,
} from "@/lib/db/repository";
import { buildSessionCookieDescriptor } from "@/lib/auth/session-cookie";
import { SESSION_COOKIE_NAME } from "@/lib/rebohrome-data";
import { getRequestMeta } from "@/lib/session";

function getRedirectPath(formData: FormData, fallback: string) {
  const redirectTo = formData.get("redirectTo");

  if (typeof redirectTo === "string" && redirectTo.startsWith("/")) {
    return redirectTo;
  }

  return fallback;
}

async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const descriptor = buildSessionCookieDescriptor(token, headerStore);
  cookieStore.set(descriptor.name, descriptor.value, descriptor.options);
}

export async function registerAction(formData: FormData) {
  void formData;
  redirect(
    `/register?error=${encodeURIComponent(
      "Telegram verification is required before creating an account.",
    )}`,
  );
}

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const user = await authenticateUser({ username, password });

  if (!user) {
    redirect(`/login?error=${encodeURIComponent("Invalid username or password.")}`);
  }

  const meta = await getRequestMeta("/login");
  const token = await createSessionForUser({
    userId: user.id,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  await trackUserLogin({
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
  });

  await setSessionCookie(token);
  redirect(user.role === "admin" ? "/admin" : getRedirectPath(formData, "/dashboard"));
}

export async function logoutAction(formData?: FormData) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await deleteSessionByToken(token);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  const redirectTo = formData ? getRedirectPath(formData, "/") : "/";
  redirect(redirectTo);
}

export async function signOutUser(formData: FormData) {
  return logoutAction(formData);
}

export async function signOutAdmin(formData: FormData) {
  return logoutAction(formData);
}
