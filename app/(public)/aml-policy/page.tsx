import type { Metadata } from "next";
import { LegalMarkdownDocumentPage } from "@/components/rebohrome/legal-markdown-document";
import { getLegalMarkdownDocument } from "@/lib/legal-markdown";

export const metadata: Metadata = {
  title: "AML Policy | ReboHrome",
  description:
    "Anti-Money Laundering and Counter-Terrorist Financing Policy of ReboHrome.",
  alternates: {
    canonical: "https://www.rebohrome.com/aml-policy",
  },
};

export default async function AmlPolicyPage() {
  const markdown = await getLegalMarkdownDocument("aml");

  return <LegalMarkdownDocumentPage eyebrow="AML Policy" markdown={markdown} />;
}
