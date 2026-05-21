import { redirect } from "next/navigation";
import { getTransVoucherRedirectTarget } from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";

type PaymentReturnPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getQueryValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({
  searchParams,
}: PaymentReturnPageProps) {
  const params = await searchParams;
  const tx = getQueryValue(params.tx);

  if (!tx) {
    redirect("/checkout");
  }

  const session = await requireUserSession(
    `/login?redirectTo=/payment/return?tx=${encodeURIComponent(tx)}`,
  );
  const target = await getTransVoucherRedirectTarget(tx, session.userId);

  redirect(target ?? "/dashboard");
}
