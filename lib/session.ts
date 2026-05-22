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

export type RequestMeta = {
  ipAddress: string;
  country: string;
  userAgent: string;
  language: string;
  route: string;
  timestamp: string;
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

function getHeaderValue(
  headerStore: Awaited<ReturnType<typeof headers>>,
  keys: string[],
) {
  for (const key of keys) {
    const value = headerStore.get(key);
    if (value) {
      return value;
    }
  }

  return null;
}

function normalizeHeaderRouteValue(value: string | null) {
  if (!value) {
    return null;
  }

  if (value.startsWith("/")) {
    return value.split("?")[0] || value;
  }

  try {
    const url = new URL(value, "http://localhost");
    return url.pathname || null;
  } catch {
    return null;
  }
}

function getHeaderRoute(headerStore: Awaited<ReturnType<typeof headers>>) {
  const directRoute = getHeaderValue(headerStore, [
    "x-pathname",
    "x-invoke-path",
    "next-url",
    "x-matched-path",
  ]);

  const normalizedDirectRoute = normalizeHeaderRouteValue(directRoute);

  if (normalizedDirectRoute) {
    return normalizedDirectRoute;
  }

  const referer = headerStore.get("referer");

  if (!referer) {
    return "unknown";
  }

  try {
    const refererUrl = new URL(referer);
    return refererUrl.pathname || "unknown";
  } catch {
    return "unknown";
  }
}

export async function getCurrentRequestPath() {
  const headerStore = await headers();
  const route = getHeaderRoute(headerStore);
  return route === "unknown" ? null : route;
}

export async function getRequestMeta(routeOverride?: string): Promise<RequestMeta> {
  const headerStore = await headers();
  const forwardedFor = getHeaderValue(headerStore, ["cf-connecting-ip", "x-forwarded-for"]);
  const ipAddress =
    forwardedFor?.split(",")[0]?.trim() ??
    getHeaderValue(headerStore, ["x-real-ip"]) ??
    "unknown";
  const country =
    getHeaderValue(headerStore, [
      "cf-ipcountry",
      "x-vercel-ip-country",
      "x-country-code",
    ]) ?? "Unknown";
  const userAgent = headerStore.get("user-agent") ?? "Unknown";
  const language = headerStore.get("accept-language") ?? "Unknown";

  return {
    ipAddress,
    country,
    userAgent,
    language,
    route: routeOverride ?? getHeaderRoute(headerStore),
    timestamp: new Date().toISOString(),
  };
}
