import { LegalDocumentPage } from "@/components/rebohrome/legal-document";
import { complianceDocument } from "@/lib/legal-content";

export default function CompliancePage() {
  return <LegalDocumentPage document={complianceDocument} eyebrow="Compliance" />;
}
