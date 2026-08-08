import { LegalMarkdownDocumentPage } from "@/components/rebohrome/legal-markdown-document";
import { getLegalMarkdownDocument } from "@/lib/legal-markdown";

export default async function TermsPage() {
  const markdown = await getLegalMarkdownDocument("terms");

  return <LegalMarkdownDocumentPage eyebrow="Terms" markdown={markdown} />;
}
