import { NextResponse, after } from "next/server";
import { merchantConfig, verifyMerchantSignature } from "@/lib/payments/merchantpayd-client";
import { getMerchantEngine } from "@/lib/server/payments/merchantpayd-service";
export const runtime="nodejs";
export async function POST(request:Request) {
  const config=merchantConfig();
  const secrets=[config.webhookSecret,config.bankingWebhookSecret].filter((value):value is string=>Boolean(value));
  if (!secrets.length) return NextResponse.json({error:"Webhook not configured."},{status:503});
  const raw=new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength>262144) return NextResponse.json({error:"Payload too large."},{status:413});
  if (!secrets.some(secret=>verifyMerchantSignature(raw,request.headers.get('x-webhook-signature'),secret))) return NextResponse.json({error:"Invalid signature."},{status:401});
  try {
    const engine=getMerchantEngine(); const id=await engine.receive(raw);
    after(async()=>{try {await engine.drain();} catch {console.warn("MerchantPayd inbox will be retried by reconciliation.");}});
    return NextResponse.json({ok:true,id});
  } catch(error) {return NextResponse.json({error:"Unable to accept payment event."},{status:error instanceof SyntaxError?400:503});}
}
