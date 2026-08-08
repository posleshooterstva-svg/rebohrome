import { DocumentAcceptanceGate } from "@/components/account/document-acceptance-gate";
import { getUserDocumentAcceptanceStatus } from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";
import { headers } from "next/headers";

export default async function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") || "/dashboard";
  const session = await requireUserSession(
    `/login?next=${encodeURIComponent(pathname)}`,
  );
  const documentAcceptance = await getUserDocumentAcceptanceStatus(session.userId);

  return (
    <>
      {children}
      <DocumentAcceptanceGate status={documentAcceptance} />
    </>
  );
}
