import { LegalDocumentPage } from "@/components/rebohrome/legal-document";
import {
  GLOBAL_COLLECTIBLE_DISCLAIMER,
  privacyPolicyDocument,
} from "@/lib/legal-content";

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentPage
      document={privacyPolicyDocument}
      eyebrow="Privacy"
      footerNote={GLOBAL_COLLECTIBLE_DISCLAIMER}
    />
  );
}
