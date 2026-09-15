import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionState } from "@/lib/session";
import { createMerchantPayment } from "./merchantpayd-service";
import { MerchantApiError } from '@/lib/payments/merchantpayd-client';
import { merchantMethodCode } from '@/lib/payments/merchantpayd-methods';
const schema=z.object({currency:z.enum(["USD","EUR"]).default("USD"),eurUsdRate:z.number().finite().positive().optional(),provider:z.enum(["RebohromePayment","MerchantPayd"]).optional(),paymentMethod:z.enum(['Cash App','Cash App 4','Bank Transfer','cash-app-v4','banking']).default('Cash App').transform(merchantMethodCode),amount:z.number().positive().optional(),items:z.array(z.object({productId:z.string().min(1).max(150),quantity:z.number().int().min(1).max(100),deliveryType:z.enum(["digital","physical"])})).min(1).max(100).optional()});
export async function merchantCreateRoute(request:Request,kind:"deposit"|"purchase") {
  const session=await getSessionState();
  if (!session.userId) return NextResponse.json({error:"Authentication required."},{status:401});
  try {
    const payload=schema.parse(await request.json());
    if (kind==='deposit' && payload.amount===undefined) throw new Error("Deposit amount required.");
    if (kind==='purchase' && !payload.items) throw new Error("Cart items required.");
    const result=await createMerchantPayment({userId:session.userId,kind,key:request.headers.get('idempotency-key')||'',amount:payload.amount,items:payload.items,paymentMethod:payload.paymentMethod,currency:payload.currency,eurUsdRate:payload.eurUsdRate});
    return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    const status=error && typeof error==='object' && 'httpStatus' in error?Number(error.httpStatus):400;
    return NextResponse.json({error:error instanceof z.ZodError?'Invalid payment request.':error instanceof Error?error.message:'Unable to create payment.',creationRejected:error instanceof MerchantApiError && !error.ambiguous && error.httpStatus===422},{status});
  }
}
