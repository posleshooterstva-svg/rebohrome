import "server-only";
import { createHash } from "node:crypto";
import { getDbClient } from "@/lib/db/client";
import { getUserById, getUserPaymentGateAccess, requireDocumentAcceptanceForUser, userHasKycAccess,
  getMaintenanceModeConfig, prepareMerchantOrder, initializeMerchantRecords, fulfillMerchantOrder } from "@/lib/db/repository";
import { merchantClient, merchantConfig } from "@/lib/payments/merchantpayd-client";
import { paymentEngine } from "@/lib/payments/merchantpayd-engine";
import { minorUnits } from "@/lib/payments/money";
import type { DeliveryType } from "@/lib/rebohrome-data";
import { MERCHANTPAYD_METHODS, savedMerchantMethod, type MerchantMethodCode } from '@/lib/payments/merchantpayd-methods';

export function getMerchantEngine() {
  return paymentEngine(getDbClient(),merchantClient(merchantConfig()),{
    initialize:initializeMerchantRecords,fulfill:fulfillMerchantOrder,
  });
}
export async function createMerchantPayment(input:{userId:string;kind:"purchase"|"deposit";key:string;amount?:number;paymentMethod?:MerchantMethodCode;items?:Array<{productId:string;quantity:number;deliveryType:DeliveryType}>}) {
  if (!merchantConfig().enabled) throw new Error("Payments are temporarily unavailable.");
  if ((await getMaintenanceModeConfig()).enabled) throw new Error("Payments are unavailable during maintenance.");
  const user=await getUserById(input.userId);
  if (!user || user.status!=="active" || user.isDeleted || user.requirePasswordReset) throw new Error("Active account required.");
  await requireDocumentAcceptanceForUser(input.userId);
  if (!userHasKycAccess(user)) throw new Error("Please complete identity verification before paying.");
  const gate=(await getUserPaymentGateAccess(input.userId)).find(g=>g.providerKey==='merchantpayd');
  if (!gate?.enabled || !gate.accessEnabled) throw new Error("This payment method is not available for your account.");
  const order=input.kind==='purchase'?await prepareMerchantOrder(input.items || []):null;
  const amountMinor=order?.amountMinor ?? minorUnits(input.amount);
  if (amountMinor<=0) throw new Error("Payment amount must be positive.");
  if (input.kind==='deposit' && (amountMinor<minorUnits(gate.minAmount) || (gate.maxAmount!==null&&amountMinor>minorUnits(gate.maxAmount)))) throw new Error("Deposit amount is outside your account limits.");
  const snapshot={user:{name:user.name||user.username,email:user.email},order};
  const paymentMethod=input.paymentMethod ?? 'cash-app-v4';
  const fingerprint=createHash('sha256').update(JSON.stringify({kind:input.kind,amountMinor,items:input.items||null,paymentMethod})).digest('hex');
  const result=await getMerchantEngine().create({userId:input.userId,kind:input.kind,key:input.key,fingerprint,amountMinor,snapshot,paymentMethod},{
    email:user.email,title:input.kind==='deposit'?'ReboHrome account deposit':'ReboHrome order',
    description:input.kind==='deposit'?'Deposit to your ReboHrome account balance.':'Purchase of the collectibles listed in your ReboHrome order.',
  });
  return {sessionId:result.intent.id,paymentUrl:result.intent.payment_url,status:result.intent.status,
    redirectPath:`/payment/merchantpayd?session=${encodeURIComponent(String(result.intent.id))}`,reusedExistingSession:result.reused};
}

export async function merchantStatus(id:string,userId:string,refresh=true) {
  const engine=getMerchantEngine(); let intent=await engine.get(id,userId);
  if (!intent) return null;
  if (refresh && intent.status!=='completed' && (!intent.checked_at||Date.now()-Date.parse(String(intent.checked_at))>=5000)) {
    await engine.reconcile(id);intent=(await engine.get(id,userId))!;
  }
  const method=savedMerchantMethod(JSON.parse(String(intent.snapshot_json)));
  return {id:String(intent.id),requestKey:String(intent.idempotency_key),paymentMethod:MERCHANTPAYD_METHODS[method],kind:String(intent.kind),status:String(intent.status),amount:Number(intent.amount_minor)/100,currency:"USD",
    paymentUrl:intent.payment_url?String(intent.payment_url):null,reviewRequired:Boolean(intent.review_required),
    message:intent.last_error?String(intent.last_error):null,
    resultUrl:intent.status==='completed'?(intent.kind==='deposit'?`/dashboard/deposit?receipt=${encodeURIComponent(String(intent.reference_id))}`:`/success?order=${encodeURIComponent(String(intent.reference_id))}`):null};
}
