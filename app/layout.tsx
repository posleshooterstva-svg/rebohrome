import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import { redirect } from "next/navigation";
import { CartSync } from "@/components/cart/cart-sync";
import { CookieConsent } from "@/components/rebohrome/cookie-consent";
import { MaintenanceAdminBanner } from "@/components/rebohrome/maintenance-admin-banner";
import { ThemeProvider } from "@/components/theme-provider";
import { getMaintenanceModeConfig } from "@/lib/db/repository";
import { formatDisplayDateTime } from "@/lib/rebohrome-data";
import { getCurrentRequestPath, getSessionState } from "@/lib/session";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ReboHrome",
  description: "Premium galactic collectible cards marketplace.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.png", type: "image/png" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
};

function canAccessDuringMaintenance(pathname: string) {
  return (
    pathname === "/maintenance" ||
    pathname === "/login" ||
    pathname === "/status" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/payment/webhook") ||
    pathname.startsWith("/api/telegram") ||
    pathname === "/api/telegram/webhook" ||
    pathname === "/api/health"
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [currentPath, session, maintenance] = await Promise.all([
    getCurrentRequestPath(),
    getSessionState(),
    getMaintenanceModeConfig(),
  ]);
  const pathname = currentPath ?? "/";
  const isAdmin = session.isAdminAuthenticated;

  if (
    maintenance.enabled &&
    currentPath &&
    !isAdmin &&
    !canAccessDuringMaintenance(pathname)
  ) {
    redirect("/maintenance");
  }

  return (
    <html suppressHydrationWarning lang="en">
      <body className={`${manrope.variable} ${sora.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <CartSync />
          {maintenance.enabled && isAdmin ? (
            <MaintenanceAdminBanner
              currentPath={pathname}
              maintenance={{
                estimatedReturnAt: maintenance.estimatedReturnAt
                  ? formatDisplayDateTime(maintenance.estimatedReturnAt)
                  : null,
              }}
            />
          ) : null}
          {children}
          <CookieConsent />
        </ThemeProvider>
      </body>
    </html>
  );
}
