import { LegalDocumentPage } from "@/components/rebohrome/legal-document";
import {
  GLOBAL_COLLECTIBLE_DISCLAIMER,
  termsDocument,
} from "@/lib/legal-content";

export default function TermsPage() {
  return (
    <LegalDocumentPage
      document={termsDocument}
      eyebrow="Terms"
      footerNote={GLOBAL_COLLECTIBLE_DISCLAIMER}
    />
  );
}
