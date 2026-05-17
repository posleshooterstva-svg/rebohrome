import { requireUserSession } from "@/lib/session";

export default async function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireUserSession("/login");

  return children;
}
