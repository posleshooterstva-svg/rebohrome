import Link from "next/link";
import { GLOBAL_COLLECTIBLE_DISCLAIMER } from "@/lib/legal-content";

type LegalMarkdownDocumentPageProps = {
  markdown: string;
  eyebrow: string;
  footerNote?: string;
};

type InlinePart =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "link"; label: string; href: string };

function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern = /(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      parts.push({ type: "link", label: match[2], href: match[3] });
    } else if (match[4]) {
      parts.push({ type: "bold", value: match[5] });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return parts;
}

function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, index) => {
        if (part.type === "bold") {
          return (
            <strong className="text-foreground" key={`${part.value}-${index}`}>
              {part.value}
            </strong>
          );
        }

        if (part.type === "link") {
          return (
            <Link
              className="font-medium text-[var(--accent)] underline-offset-4 hover:underline"
              href={part.href}
              key={`${part.href}-${index}`}
            >
              {part.label}
            </Link>
          );
        }

        return <span key={`${part.value}-${index}`}>{part.value}</span>;
      })}
    </>
  );
}

function renderMarkdown(markdown: string) {
  const elements: React.ReactNode[] = [];
  const lines = markdown.split(/\r?\n/);
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = () => {
    if (!listType || !listItems.length) {
      return;
    }

    const ListTag = listType;
    elements.push(
      <ListTag
        className={
          listType === "ol"
            ? "my-4 list-decimal space-y-2 pl-6 text-sm leading-7 text-muted"
            : "my-4 list-disc space-y-2 pl-6 text-sm leading-7 text-muted"
        }
        key={`list-${elements.length}`}
      >
        {listItems.map((item) => (
          <li key={item}>
            <InlineText text={item} />
          </li>
        ))}
      </ListTag>,
    );
    listItems = [];
    listType = null;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    if (trimmed === "---") {
      flushList();
      elements.push(<hr className="my-8 border-line" key={`hr-${index}`} />);
      return;
    }

    if (trimmed.startsWith("# ")) {
      flushList();
      elements.push(
        <h1
          className="display-font text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl"
          key={`h1-${index}`}
        >
          {trimmed.slice(2)}
        </h1>,
      );
      return;
    }

    if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(
        <h2
          className="mt-8 text-2xl font-semibold tracking-[-0.03em] text-foreground"
          key={`h2-${index}`}
        >
          {trimmed.slice(3)}
        </h2>,
      );
      return;
    }

    const bulletMatch = trimmed.match(/^\*\s+(.+)$/);
    if (bulletMatch) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(bulletMatch[1]);
      return;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(orderedMatch[1]);
      return;
    }

    flushList();
    elements.push(
      <p className="my-4 text-sm leading-7 text-muted" key={`p-${index}`}>
        <InlineText text={trimmed} />
      </p>,
    );
  });

  flushList();
  return elements;
}

export function LegalMarkdownDocumentPage({
  markdown,
  eyebrow,
  footerNote = GLOBAL_COLLECTIBLE_DISCLAIMER,
}: LegalMarkdownDocumentPageProps) {
  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <article className="mx-auto w-full max-w-5xl rounded-[34px] border border-line bg-panel px-6 py-8 shadow-panel sm:px-8 sm:py-10">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
          {eyebrow}
        </p>
        <div className="mt-4 max-w-4xl break-words">
          {renderMarkdown(markdown)}
        </div>
        {footerNote ? (
          <div className="mt-10 rounded-[26px] border border-line bg-[radial-gradient(circle_at_top,rgba(143,176,255,0.16),rgba(173,145,255,0.12),transparent_74%)] px-5 py-5 text-sm leading-7 text-muted">
            {footerNote}
          </div>
        ) : null}
      </article>
    </main>
  );
}
