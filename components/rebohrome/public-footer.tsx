import Link from "next/link";
import { RebohromeLogo } from "@/components/rebohrome/logo";
import { GLOBAL_COLLECTIBLE_DISCLAIMER } from "@/lib/legal-content";

const legalLinks = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refund Policy" },
  { href: "/aml-policy", label: "AML Policy" },
  { href: "/compliance", label: "Compliance" },
];

const companyLinks = [
  { href: "/about", label: "About" },
  { href: "/dashboard/marketplace", label: "Marketplace" },
  { href: "/dashboard/collection", label: "Collection" },
];

const supportLinks = [
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact Support" },
  { href: "/faq#payments-deposits", label: "Payment Help" },
  { href: "/faq#account-verification", label: "Verification Help" },
];

export function PublicFooter() {
  return (
    <footer
      className="w-full border-t border-line px-4 pb-8 sm:px-6 lg:px-8"
      id="about"
    >
      <div className="px-1 py-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]">
          <div className="max-w-2xl">
            <RebohromeLogo />
            <p className="mt-3 text-sm leading-7 text-muted">
              {GLOBAL_COLLECTIBLE_DISCLAIMER}
            </p>
          </div>
          <div className="grid gap-6 text-sm sm:grid-cols-3">
            <FooterColumn label="Company" links={companyLinks} />
            <FooterColumn label="Support" links={supportLinks} />
            <FooterColumn label="Legal" links={legalLinks} />
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  label,
  links,
}: {
  label: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.24em] text-muted">
        {label}
      </div>
      <div className="mt-3 grid gap-2">
        {links.map((item) => (
          <Link
            className="text-muted transition hover:text-foreground"
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
