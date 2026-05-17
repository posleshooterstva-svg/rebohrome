import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import { CartSync } from "@/components/cart/cart-sync";
import { CookieConsent } from "@/components/rebohrome/cookie-consent";
import { ThemeProvider } from "@/components/theme-provider";
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning lang="en">
      <body className={`${manrope.variable} ${sora.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <CartSync />
          {children}
          <CookieConsent />
        </ThemeProvider>
      </body>
    </html>
  );
}
