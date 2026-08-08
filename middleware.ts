import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const routeRedirects: Record<string, string> = {
  "/marketplace": "/dashboard/marketplace",
  "/collections": "/dashboard/collection",
  "/drops": "/dashboard/marketplace",
  "/vault": "/dashboard/collection",
  "/collection": "/dashboard/collection",
  "/transactions": "/dashboard/transactions",
  "/orders": "/dashboard/transactions",
  "/deposit": "/dashboard/deposit",
  "/withdraw": "/dashboard",
  "/withdrawal": "/dashboard",
  "/withdrawals": "/dashboard",
  "/settings": "/dashboard/settings",
  "/verification": "/dashboard/verification",
  "/watchlist": "/dashboard/collection",
  "/dashboard/collections": "/dashboard/collection",
  "/dashboard/drops": "/dashboard/marketplace",
  "/dashboard/vault": "/dashboard/collection",
  "/dashboard/orders": "/dashboard/transactions",
  "/dashboard/watchlist": "/dashboard/collection",
  "/dashboard/withdraw": "/dashboard",
  "/profile/withdraw": "/dashboard",
  "/account/withdraw": "/dashboard",
  "/balance/withdraw": "/dashboard",
};

export function middleware(request: NextRequest) {
  const redirectTarget = routeRedirects[request.nextUrl.pathname];

  if (redirectTarget) {
    return NextResponse.redirect(new URL(redirectTarget, request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("x-request-url", request.nextUrl.toString());

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt)$).*)",
  ],
};
