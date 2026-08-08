import { redirect } from "next/navigation";

export default function WatchlistRedirectPage() {
  redirect("/dashboard/collection");
}
