import { LegalMarkdownDocumentPage } from "@/components/rebohrome/legal-markdown-document";
import { getLegalMarkdownDocument } from "@/lib/legal-markdown";

export default async function RefundPolicyPage() {
  const markdown = await getLegalMarkdownDocument("refund");

  return (
    <LegalMarkdownDocumentPage
      eyebrow="Refund Policy"
      markdown={markdown}
    />
  );
}
