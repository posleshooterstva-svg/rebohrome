import { LegalDocumentPage } from "@/components/rebohrome/legal-document";
import {
  GLOBAL_COLLECTIBLE_DISCLAIMER,
  refundPolicyDocument,
} from "@/lib/legal-content";

export default function RefundPolicyPage() {
  return (
    <LegalDocumentPage
      document={refundPolicyDocument}
      eyebrow="Refund Policy"
      footerNote={GLOBAL_COLLECTIBLE_DISCLAIMER}
    />
  );
}
