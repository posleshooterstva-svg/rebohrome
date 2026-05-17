import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, type UserRecord } from "@/lib/rebohrome-data";
import { getUserBySessionToken } from "@/lib/db/repository";

type AnonymousSession = {
  user: null;
  userId: null;
  isUserAuthenticated: false;
  isAdminAuthenticated: false;
};

type AuthenticatedSession = {
  user: UserRecord;
  userId: string;
  isUserAuthenticated: true;
  isAdminAuthenticated: boolean;
};

export async function getSessionState(): Promise<
  AnonymousSession | AuthenticatedSession
> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;

  if (!token) {
    return {
      user: null,
      userId: null,
      isUserAuthenticated: false,
      isAdminAuthenticated: false,
    };
  }

  const user = await getUserBySessionToken(token);

  if (!user) {
    return {
      user: null,
      userId: null,
      isUserAuthenticated: false,
      isAdminAuthenticated: false,
    };
  }

  return {
    user,
    userId: user.id,
    isUserAuthenticated: true,
    isAdminAuthenticated: user.role === "admin",
  };
}

export async function requireUserSession(
  redirectTo = "/login",
): Promise<AuthenticatedSession> {
  const session = await getSessionState();

  if (!session.isUserAuthenticated || !session.userId) {
    redirect(redirectTo);
  }

  return session;
}

export async function requireAdminSession(
  redirectTo = "/",
): Promise<AuthenticatedSession> {
  const session = await getSessionState();

  if (!session.isAdminAuthenticated || !session.userId) {
    redirect(redirectTo);
  }

  return session;
}

export async function getRequestMeta() {
  const headerStore = await headers();

  return {
    userAgent: headerStore.get("user-agent"),
    ipAddress:
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip"),
  };
}
