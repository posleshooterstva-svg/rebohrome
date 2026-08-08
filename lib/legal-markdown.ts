import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

const legalDocumentPaths = {
  aml: "updated-aml-policy.md",
  compliance: "updated-compliance-notice.md",
  privacy: "updated-privacy-policy.md",
  refund: "updated-refund-shipping-policy.md",
  terms: "updated-terms-of-service.md",
} as const;

export type LegalMarkdownDocumentKey = keyof typeof legalDocumentPaths;

export async function getLegalMarkdownDocument(
  key: LegalMarkdownDocumentKey,
) {
  const filePath = path.join(
    process.cwd(),
    "content",
    "legal",
    legalDocumentPaths[key],
  );
  return fs.readFile(filePath, "utf8");
}
