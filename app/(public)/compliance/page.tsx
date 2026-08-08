import { LegalMarkdownDocumentPage } from "@/components/rebohrome/legal-markdown-document";
import { getLegalMarkdownDocument } from "@/lib/legal-markdown";

export default async function CompliancePage() {
  const markdown = await getLegalMarkdownDocument("compliance");

  return (
    <LegalMarkdownDocumentPage eyebrow="Compliance" markdown={markdown} />
  );
}
