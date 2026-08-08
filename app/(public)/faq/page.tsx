import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, Search, Send } from "lucide-react";

export const metadata: Metadata = {
  title: "FAQ | ReboHrome",
  description:
    "Find answers about ReboHrome accounts, payments, verification, digital collectibles, refunds, AML, and policies.",
};

const faqCategories = [
  {
    title: "General",
    items: [
      {
        question: "What is ReboHrome?",
        answer:
          "ReboHrome is a digital collectibles marketplace where users can create an account, complete verification, top up their balance, purchase collectible assets, and store them in a private account archive.",
      },
      {
        question: "What can I buy on ReboHrome?",
        answer:
          "Users can purchase digital collectible cards and archive-based collectible items. Some items may also support wallet delivery or physical delivery where available.",
      },
      {
        question: "Are ReboHrome products financial products?",
        answer:
          "No. ReboHrome products are digital collectibles and entertainment collectibles. They are not investment products, securities, gambling products, betting services, or guaranteed-profit products.",
      },
    ],
  },
  {
    title: "Account & Verification",
    items: [
      {
        question: "Do I need verification?",
        answer:
          "Yes, verification may be required before using supported deposits, card payments, or selected payment gates.",
      },
      {
        question: "Why do I need KYC?",
        answer:
          "KYC helps protect users, prevent fraud, reduce chargebacks, and comply with payment provider and AML requirements.",
      },
      {
        question: "What happens if my verification fails?",
        answer:
          "You may be asked to try again or provide additional information. Some features may remain restricted until verification is approved.",
      },
    ],
  },
  {
    title: "Payments & Deposits",
    items: [
      {
        question: "How do deposits work?",
        answer:
          "Users choose an available payment gate, enter an amount, complete secure checkout, and ReboHrome updates the balance after server-side payment confirmation.",
      },
      {
        question: "When will my balance update?",
        answer:
          "Balance is updated only after the payment provider confirms the transaction. Some payments may require additional review.",
      },
      {
        question: "Why is my payment pending?",
        answer:
          "A payment may be pending while the provider confirms it, runs security checks, or waits for final settlement.",
      },
      {
        question: "Can I use someone else's card?",
        answer:
          "No. Users must only use payment methods that legally belong to them.",
      },
    ],
  },
  {
    title: "Collectibles & Archive",
    items: [
      {
        question: "Where are my purchased collectibles stored?",
        answer:
          "Purchased collectibles are stored in your private ReboHrome account archive.",
      },
      {
        question: "Can collectibles be delivered to a wallet?",
        answer:
          "Some supported items or integrations may allow wallet delivery where available.",
      },
      {
        question: "Can I request physical delivery?",
        answer:
          "If an item supports physical delivery, delivery details will be shown or handled through support.",
      },
    ],
  },
  {
    title: "Security",
    items: [
      {
        question: "Is payment secure?",
        answer:
          "Payments are processed through third-party secure payment providers. ReboHrome does not store raw card data.",
      },
      {
        question: "Does ReboHrome monitor suspicious activity?",
        answer:
          "Yes. ReboHrome may monitor transactions, account behavior, and payment activity to prevent fraud and abuse.",
      },
      {
        question: "Can ReboHrome restrict my account?",
        answer:
          "Yes. Accounts may be restricted if suspicious activity, failed verification, chargebacks, fraud risk, or policy violations are detected.",
      },
    ],
  },
  {
    title: "Refunds & Disputes",
    items: [
      {
        question: "Can I get a refund?",
        answer:
          "Refund eligibility depends on the product, payment status, provider rules, and ReboHrome Refund Policy.",
      },
      {
        question: "What happens if I open a chargeback?",
        answer:
          "Your account may be reviewed, restricted, or suspended while the dispute is investigated.",
      },
      {
        question: "What if my payment failed but I was charged?",
        answer:
          "Contact support with your payment details. ReboHrome will review the transaction status with the payment provider.",
      },
    ],
  },
  {
    title: "Policies & Legal",
    items: [
      {
        question: "Where can I read ReboHrome policies?",
        answer:
          "The main policy pages are linked below: Terms of Service, Privacy Policy, Refund Policy, AML Policy, Compliance / KYC information, and Contact Support.",
      },
    ],
  },
  {
    title: "Support",
    items: [
      {
        question: "How do I contact support?",
        answer:
          "Contact support by email or Telegram. For payment issues, include your username, payment amount, payment provider, date, and transaction reference if available.",
      },
    ],
  },
];

const policyLinks = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refund Policy" },
  { href: "/aml-policy", label: "AML Policy" },
  { href: "/compliance", label: "Compliance / KYC Policy" },
  { href: "/contact", label: "Contact Support" },
];

export default function FaqPage() {
  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <section className="mx-auto grid w-full max-w-[1440px] gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[28px] border border-line bg-panel-strong p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--accent)]">
              Help Center
            </p>
            <h1 className="mt-3 display-font text-4xl font-semibold tracking-[-0.05em] text-foreground">
              FAQ
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted">
              Find answers about ReboHrome, payments, verification,
              collectibles, and policies.
            </p>
            <div className="mt-5 hidden items-center gap-2 rounded-2xl border border-line bg-panel px-3 py-3 text-sm text-muted lg:flex">
              <Search className="size-4" />
              <span>Use browser search for keywords</span>
            </div>
            <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {faqCategories.map((category) => (
                <a
                  className="whitespace-nowrap rounded-full border border-line bg-panel px-3 py-2 text-sm text-muted transition hover:border-violet-300/30 hover:text-foreground lg:rounded-xl"
                  href={`#${category.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  key={category.title}
                >
                  {category.title}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <div className="space-y-6">
          <section className="rounded-[30px] border border-line bg-panel px-5 py-6 sm:px-7">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--accent)]">
                  Policies
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                  Legal and support access
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  All important ReboHrome policies are available here for
                  users and payment provider review.
                </p>
              </div>
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                href="/contact"
              >
                Contact Support
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {policyLinks.map((item) => (
                <Link
                  className="rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-semibold text-foreground transition hover:border-violet-300/30 hover:bg-white/[0.04]"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </section>

          {faqCategories.map((category) => (
            <section
              className="rounded-[30px] border border-line bg-panel px-5 py-6 sm:px-7"
              id={category.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
              key={category.title}
            >
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">
                {category.title}
              </h2>
              <div className="mt-5 divide-y divide-white/10">
                {category.items.map((item) => (
                  <details className="group py-4" key={item.question}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-foreground">
                      {item.question}
                      <span className="text-[var(--accent)] transition group-open:rotate-90">
                        <ArrowRight className="size-4" />
                      </span>
                    </summary>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
                      {item.answer}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ))}

          <section className="grid gap-4 rounded-[30px] border border-violet-300/20 bg-[linear-gradient(135deg,rgba(139,92,246,0.14),rgba(12,13,28,0.94))] p-5 sm:grid-cols-2 sm:p-7">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">
                Need more help?
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Include your username, issue type, payment provider, amount,
                and transaction reference when asking about payments.
              </p>
            </div>
            <div className="grid gap-3">
              <Link
                className="inline-flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-white/[0.08]"
                href="mailto:support@rebohrome.com"
              >
                support@rebohrome.com
                <Mail className="size-4" />
              </Link>
              <Link
                className="inline-flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-white/[0.08]"
                href="https://t.me/rebohrome"
              >
                @rebohrome
                <Send className="size-4" />
              </Link>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
