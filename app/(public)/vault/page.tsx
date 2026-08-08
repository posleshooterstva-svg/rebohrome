import { redirect } from "next/navigation";

export default function VaultRedirectPage() {
  redirect("/dashboard/collection");
}
