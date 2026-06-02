import Link from "next/link";
import { BookOpen, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const sections = [
  {
    id: "what-rebohrome-is",
    title: "What ReboHrome Is",
    body: "ReboHrome is a digital collectible trading card marketplace. Users can purchase digital collectible cards, store them in their private archive vault, and manage their collection through their account.",
  },
  {
    id: "digital-collectibles",
    title: "Digital Collectibles",
    body: "Cards are digital entertainment collectibles. They are not securities, investment products, financial instruments, gambling products, or financial advice.",
  },
  {
    id: "archive-balance",
    title: "Archive Balance",
    body: "Users may top up their archive balance to purchase digital collectibles on the platform. Archive balance is a platform balance used for marketplace activity.",
  },
  {
    id: "payment-verification",
    title: "Payment Verification",
    body: "Deposits are confirmed through the payment provider and server-side reconciliation before balance is credited. Frontend redirects are informational and are not the source of truth.",
  },
  {
    id: "digital-delivery",
    title: "Digital Delivery",
    body: "After a successful purchase, the collectible is assigned to the user’s vault and recorded in the internal Archive Ledger as a delivery proof record.",
  },
  {
    id: "withdrawals",
    title: "Withdrawals",
    body: "Withdrawals are manually reviewed and paid in USDT BEP20 when approved. Users must provide a Telegram account and a valid USDT BEP20 wallet before withdrawal.",
  },
  {
    id: "verification",
    title: "Verification",
    body: "Telegram verification is required for account creation and platform safety. Verification keeps archive notices, withdrawal updates, and support communication aligned.",
  },
  {
    id: "refunds",
    title: "Refunds",
    body: "Digital collectibles are non-refundable after successful delivery unless required by law or reviewed manually by ReboHrome support.",
  },
  {
    id: "support",
    title: "Support",
    body: "Users can contact support@rebohrome.com or @rebohrome for platform support, payment questions, and archive account help.",
  },
];

export default function ArchiveRulesPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-[28px] border border-line bg-panel p-6 shadow-panel sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-8 lg:h-fit">
            <div className="rounded-[22px] border border-line bg-panel-strong p-5">
              <div className="flex items-center gap-3 text-foreground">
                <BookOpen className="size-5 text-[var(--accent)]" />
                <div className="font-semibold">Archive Economy Rules</div>
              </div>
              <nav className="mt-5 space-y-2">
                {sections.map((section) => (
                  <a
                    className="block rounded-[12px] px-3 py-2 text-sm text-muted transition hover:bg-[var(--foreground-soft)] hover:text-foreground"
                    href={`#${section.id}`}
                    key={section.id}
                  >
                    {section.title}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          <div>
            <div className="rounded-[24px] border border-line bg-[linear-gradient(135deg,rgba(139,92,246,0.16),rgba(255,255,255,0.04))] p-6">
              <div className="text-[11px] uppercase tracking-[0.3em] text-[var(--accent)]">
                Trust Document
              </div>
              <h1 className="mt-4 display-font text-5xl font-semibold tracking-[-0.06em] text-foreground">
                Archive Economy Rules
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted">
                A clear guide to ReboHrome balance, digital collectibles, delivery,
                withdrawals, verification, and support standards.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/dashboard/settings">Accept in Settings</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/marketplace">Explore marketplace</Link>
                </Button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {sections.map((section) => (
                <section
                  className="rounded-[22px] border border-line bg-panel-strong p-5"
                  id={section.id}
                  key={section.id}
                >
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-1 size-5 shrink-0 text-[var(--accent)]" />
                    <div>
                      <h2 className="text-xl font-semibold text-foreground">
                        {section.title}
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-muted">
                        {section.body}
                      </p>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
