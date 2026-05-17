import Link from "next/link";

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[34px] border border-line bg-panel px-6 py-8 shadow-panel sm:px-8 sm:py-10">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
            Contact
          </p>
          <h1 className="mt-4 display-font text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
            Support & collector assistance
          </h1>
          <p className="mt-4 text-sm leading-7 text-muted">
            Reach the ReboHrome team for transaction support, account updates,
            withdrawal reviews, compliance questions, and purchase assistance.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <article className="rounded-[28px] border border-line bg-panel-strong px-5 py-5">
            <div className="text-sm font-semibold text-foreground">Support Email</div>
            <p className="mt-3 text-sm leading-7 text-muted">
              <Link
                className="font-medium text-[var(--accent)]"
                href="mailto:support@rebohrome.com"
              >
                support@rebohrome.com
              </Link>
            </p>
            <p className="mt-3 text-sm leading-7 text-muted">
              Best for account access, payment issues, order questions, and
              marketplace support.
            </p>
          </article>

          <article className="rounded-[28px] border border-line bg-panel-strong px-5 py-5">
            <div className="text-sm font-semibold text-foreground">Telegram</div>
            <p className="mt-3 text-sm leading-7 text-muted">
              <Link
                className="font-medium text-[var(--accent)]"
                href="https://t.me/rebohrome"
              >
                @rebohrome
              </Link>
            </p>
            <p className="mt-3 text-sm leading-7 text-muted">
              Best for collector communication, withdrawal coordination, and
              quick support follow-up.
            </p>
          </article>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <article className="rounded-[26px] border border-line bg-[radial-gradient(circle_at_top,rgba(141,176,255,0.16),rgba(180,151,255,0.12),transparent_74%)] px-5 py-5">
            <div className="text-sm font-semibold text-foreground">Availability</div>
            <p className="mt-3 text-sm leading-7 text-muted">
              Support requests are monitored daily for platform, payment, and vault
              issues.
            </p>
          </article>
          <article className="rounded-[26px] border border-line bg-panel-strong px-5 py-5">
            <div className="text-sm font-semibold text-foreground">Response time</div>
            <p className="mt-3 text-sm leading-7 text-muted">
              Typical response window is within 24 hours. Withdrawal and compliance
              cases may require additional review time.
            </p>
          </article>
          <article className="rounded-[26px] border border-line bg-panel-strong px-5 py-5">
            <div className="text-sm font-semibold text-foreground">Premium handling</div>
            <p className="mt-3 text-sm leading-7 text-muted">
              Order history, Telegram identity, and payment references are reviewed
              together to keep support precise and secure.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
