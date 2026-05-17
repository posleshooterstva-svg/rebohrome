import { PublicFooter } from "@/components/rebohrome/public-footer";
import { SiteHeader } from "@/components/rebohrome/site-header";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      {children}
      <PublicFooter />
    </div>
  );
}
