import { notFound } from "next/navigation";
import { requireUserSession } from "@/lib/session";
import { merchantStatus } from "@/lib/server/payments/merchantpayd-service";
import { MerchantPaydWait } from "@/components/payment/merchantpayd-wait";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams;const id=typeof params.session==='string'?params.session:'';
  const session=await requireUserSession(`/login?next=${encodeURIComponent('/payment/merchantpayd?session='+encodeURIComponent(id))}`);
  const payment=await merchantStatus(id,session.userId,false);if (!payment) notFound();
  return <MerchantPaydWait initial={payment}/>;
}
