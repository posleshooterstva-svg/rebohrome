import { LegalMarkdownDocumentPage } from "@/components/rebohrome/legal-markdown-document";
import { getLegalMarkdownDocument } from "@/lib/legal-markdown";

export default async function PrivacyPolicyPage() {
  const markdown = await getLegalMarkdownDocument("privacy");

  return (
    <LegalMarkdownDocumentPage eyebrow="Privacy" markdown={markdown} />
  );
}
