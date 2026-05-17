import { type LegalDocument } from "@/lib/legal-content";

type LegalDocumentProps = {
  document: LegalDocument;
  eyebrow?: string;
  footerNote?: string;
};

export function LegalDocumentPage({
  document,
  eyebrow = "Legal",
  footerNote,
}: LegalDocumentProps) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[34px] border border-line bg-panel px-6 py-8 shadow-panel sm:px-8 sm:py-10">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
            {eyebrow}
          </p>
          <h1 className="mt-4 display-font text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
            {document.title}
          </h1>
          <p className="mt-4 text-sm font-medium text-muted">
            Last Updated: {document.lastUpdated}
          </p>
          {document.intro?.map((paragraph) => (
            <p key={paragraph} className="mt-4 text-sm leading-7 text-muted">
              {paragraph}
            </p>
          ))}
        </div>

        <div className="mt-10 space-y-6">
          {document.sections.map((section) => (
            <article
              key={section.title}
              className="rounded-[28px] border border-line bg-panel-strong px-5 py-5"
            >
              <h2 className="text-xl font-semibold text-foreground">
                {section.title}
              </h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-sm leading-7 text-muted">
                  {paragraph}
                </p>
              ))}
              {section.bullets?.length ? (
                <ul className="mt-4 space-y-2 text-sm leading-7 text-muted">
                  {section.bullets.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>

        {footerNote ? (
          <div className="mt-10 rounded-[26px] border border-line bg-[radial-gradient(circle_at_top,rgba(143,176,255,0.16),rgba(173,145,255,0.12),transparent_74%)] px-5 py-5 text-sm leading-7 text-muted">
            {footerNote}
          </div>
        ) : null}
      </section>
    </main>
  );
}
