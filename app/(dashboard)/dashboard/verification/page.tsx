import { redirect } from "next/navigation";

export default function DashboardVerificationPage() {
  redirect("/dashboard/settings?section=verification");
}
