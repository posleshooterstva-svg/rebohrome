import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/security";
import { getMerchantEngine } from "@/lib/server/payments/merchantpayd-service";
import { processPaymentJobs } from "@/lib/db/repository";
export const runtime="nodejs";
export const maxDuration=300;
export async function GET(request:Request) {
  if (!authorizeCron(request)) return NextResponse.json({error:"Unauthorized."},{status:401});
  try {const result=await getMerchantEngine().sweep();await processPaymentJobs();return NextResponse.json({ok:true,...result});}
  catch {return NextResponse.json({error:"Payment reconciliation failed."},{status:503});}
}
