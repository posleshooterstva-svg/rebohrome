import { redirect } from "next/navigation";

export default function DashboardDropsRedirectPage() {
  redirect("/dashboard/marketplace");
}
