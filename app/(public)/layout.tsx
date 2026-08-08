import { PublicFooter } from "@/components/rebohrome/public-footer";
import { MobileBottomNav } from "@/components/rebohrome/mobile-bottom-nav";
import { SiteHeader } from "@/components/rebohrome/site-header";
import { getSessionState } from "@/lib/session";
import { cn } from "@/lib/utils";
import { headers } from "next/headers";

const mobileNavHiddenPrefixes = [
  "/login",
  "/register",
  "/cart",
  "/checkout",
  "/payment",
  "/success",
];

export default async function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSessionState();
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") || "/";
  const isAuthenticated = Boolean(session.userId && session.isUserAuthenticated);
  const hidesMobileNav = mobileNavHiddenPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );

  return (
    <div
      className={cn(
        "min-h-dvh w-full overflow-x-hidden",
        !hidesMobileNav && "mobile-safe-bottom md:pb-0",
      )}
    >
      <SiteHeader />
      {children}
      <PublicFooter />
      <MobileBottomNav isAuthenticated={isAuthenticated} />
    </div>
  );
}
