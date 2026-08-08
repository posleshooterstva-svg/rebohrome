import { redirect } from "next/navigation";

export default function DashboardOrdersRedirectPage() {
  redirect("/dashboard/transactions");
}
