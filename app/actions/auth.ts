"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  authenticateUser,
  createSessionForUser,
  deleteSessionByToken,
  registerUser,
} from "@/lib/db/repository";
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

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function registerAction(formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const telegramUsername = String(formData.get("telegram_username") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (password.length < 8) {
    redirect(`/register?error=${encodeURIComponent("Password must be at least 8 characters.")}`);
  }

  if (password !== confirmPassword) {
    redirect(`/register?error=${encodeURIComponent("Passwords do not match.")}`);
  }

  try {
    const userId = await registerUser({
      username,
      telegramUsername,
      password,
    });
    const meta = await getRequestMeta();
    const token = await createSessionForUser({
      userId,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    await setSessionCookie(token);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create account.";
    redirect(`/register?error=${encodeURIComponent(message)}`);
  }

  redirect("/dashboard");
}

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const user = await authenticateUser({ username, password });

  if (!user) {
    redirect(`/login?error=${encodeURIComponent("Invalid username or password.")}`);
  }

  const meta = await getRequestMeta();
  const token = await createSessionForUser({
    userId: user.id,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
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
