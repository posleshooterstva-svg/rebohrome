import Link from "next/link";
import { RebohromeLogo } from "@/components/rebohrome/logo";
import { GLOBAL_COLLECTIBLE_DISCLAIMER } from "@/lib/legal-content";

const legalLinks = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund-policy", label: "Refund Policy" },
  { href: "/compliance", label: "Compliance" },
  { href: "/contact", label: "Contact" },
];

export function PublicFooter() {
  return (
    <footer
      className="mx-auto mt-5 w-full max-w-[1540px] px-4 pb-8 sm:px-6 lg:px-8"
      id="about"
    >
      <div className="border-t border-line px-1 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <RebohromeLogo />
            <p className="mt-3 text-sm leading-7 text-muted">
              {GLOBAL_COLLECTIBLE_DISCLAIMER}
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted lg:justify-end">
            <Link href="/marketplace">Marketplace</Link>
            <Link href="/cart">Cart</Link>
            <Link href="/dashboard">Dashboard</Link>
            {legalLinks.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
