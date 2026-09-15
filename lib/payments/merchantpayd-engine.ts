import { createHash, randomUUID } from "node:crypto";
import type { Client, Transaction, Row } from "@libsql/client";
import { MerchantApiError, verifyPaymentAmount, type MerchantPayment } from "./merchantpayd-client.ts";
import { merchantMethodCode, savedMerchantMethod, type MerchantMethodCode } from './merchantpayd-methods.ts';

export class PaymentConflict extends Error { httpStatus=409; }
export type IntentInput = {userId:string;kind:"deposit"|"purchase";key:string;fingerprint:string;amountMinor:number;snapshot:unknown;paymentMethod?:MerchantMethodCode};
export type PaymentGateway = {create(input:{amountMinor:number;email:string;title:string;description:string;intentId:string;paymentMethod?:MerchantMethodCode}):Promise<MerchantPayment>;status(id:string):Promise<MerchantPayment>};
export type PaymentAdapters = {
  initialize:(tx:Transaction,intent:Row)=>Promise<void>;
  fulfill:(tx:Transaction,intent:Row)=>Promise<void>;
};
const now=()=>new Date().toISOString();
const later=(ms:number)=>new Date(Date.now()+ms).toISOString();
// The native SQLite driver blocks the event loop while waiting for a write lock.
// Queue local operations so a competing operation cannot prevent commit. Remote
// libSQL requests still run concurrently and rely on database transactions.
const localQueues = new WeakMap<Client, Promise<unknown>>();
function localOperation<A extends unknown[], R>(db: Client, task: (...args: A) => Promise<R>) {
  return (...args: A): Promise<R> => {
    if (db.protocol !== 'file') return task(...args);
    const previous = localQueues.get(db) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(() => task(...args));
    localQueues.set(db, current.catch(() => {}));
    return current;
  };
}

export function paymentEngine(db:Client,gateway:PaymentGateway,adapters:PaymentAdapters) {
  async function get(id:string,userId?:string) {
    return (await db.execute({sql:`select * from payment_intents where id=?${userId ? " and user_id=?" : ""}`,args:userId?[id,userId]:[id]})).rows[0] || null;
  }
  async function review(id:string,message:string) {
    await db.execute({sql:`update payment_intents set review_required=1,last_error=?,
      status=case when status in ('completed','paid_unfulfilled') then status else 'manual_review' end,
      next_check_at=?,updated_at=? where id=?`,args:[message,later(86400_000),now(),id]});
  }
  async function create(input:IntentInput,customer:{email:string;title:string;description:string}) {
    const method=merchantMethodCode(input.paymentMethod ?? 'cash-app-v4');
    if (!input.snapshot || typeof input.snapshot !== 'object' || Array.isArray(input.snapshot)) throw new Error('Payment snapshot required.');
    const snapshot={...input.snapshot,paymentMethod:method};
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.key)) throw new Error("A valid Idempotency-Key is required.");
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor<=0) throw new Error("Invalid payment amount.");
    const tx=await db.transaction("write");
    let intent:Row;
    try {
      const old=(await tx.execute({sql:"select * from payment_intents where user_id=? and idempotency_key=?",args:[input.userId,input.key]})).rows[0];
      if (old) {
        if (old.request_hash!==input.fingerprint || old.kind!==input.kind || savedMerchantMethod(JSON.parse(String(old.snapshot_json)))!==method) throw new PaymentConflict("This request key belongs to a different payment.");
        if (old.status==='failed' && !old.payment_link_id) throw new MerchantApiError(String(old.last_error || 'RebohromePayment rejected payment creation.'),422);
        await tx.commit(); return {intent:old,reused:true};
      }
      const active=(await tx.execute({sql:`select id from payment_intents where user_id=? and kind=? and closed_at is null
        and status in ('initializing','creation_unknown','pending','attempting','processing','paid_unfulfilled','manual_review')`,args:[input.userId,input.kind]})).rows[0];
      if (active) throw new PaymentConflict("Another payment is still open. Open your existing payment before creating another.");
      const id=randomUUID(),referenceId=`${input.kind==='deposit'?'DEP':'ORD'}-${randomUUID()}`,transactionId=`TXN-${randomUUID()}`,timestamp=now();
      await tx.execute({sql:`insert into payment_intents(id,user_id,kind,idempotency_key,request_hash,amount_minor,
        reference_id,session_id,transaction_id,snapshot_json,created_at,updated_at,next_check_at)
        values(?,?,?,?,?,?,?,?,?,?,?,?,?)`,args:[id,input.userId,input.kind,input.key,input.fingerprint,input.amountMinor,referenceId,id,transactionId,JSON.stringify(snapshot),timestamp,timestamp,timestamp]});
      intent=(await tx.execute({sql:"select * from payment_intents where id=?",args:[id]})).rows[0];
      await adapters.initialize(tx,intent);
      await tx.commit();
    } catch(e) {await tx.rollback();throw e;} finally {tx.close();}
    try {
      const result=await gateway.create({...customer,amountMinor:input.amountMinor,intentId:String(intent.id),paymentMethod:method});
      // A returned completed status still goes through independent status reconciliation.
      await db.execute({sql:`update payment_intents set payment_link_id=?,payment_url=?,provider_json=?,status='pending',updated_at=? where id=?`,args:[result.payment_link_id,result.payment_url!,JSON.stringify(result),now(),intent.id]});
      const table=input.kind==='deposit'?'deposit_payment_sessions':'payment_sessions';
      await db.execute({sql:`update ${table} set payment_url=?,provider_payment_link_id=?,status='pending',updated_at=? where id=?`,args:[result.payment_url!,result.payment_link_id,now(),intent.id]});
    } catch(e) {
      const definitive=e instanceof MerchantApiError && !e.ambiguous;
      await db.execute({sql:`update payment_intents set status=?,last_error=?,review_required=?,updated_at=? where id=?`,args:[definitive?'failed':'creation_unknown',definitive?e.message:'Payment creation result is unknown. Do not pay again; support must reconcile this payment.',definitive?0:1,now(),intent.id]});
      if (definitive) throw e;
    }
    return {intent:(await get(String(intent.id)))!,reused:false};
  }

  async function complete(id:string) {
    const tx=await db.transaction("write");
    try {
      const intent=(await tx.execute({sql:"select * from payment_intents where id=?",args:[id]})).rows[0];
      if (!intent || intent.status==='completed') {await tx.commit();return;}
      if (!intent.provider_transaction_id || !['paid_unfulfilled','processing'].includes(String(intent.status))) throw new Error("Payment is not confirmed.");
      const timestamp=now();
      const entry=await tx.execute({sql:`insert into financial_entries(effect_key,user_id,reference_id,amount_minor,currency,provider_key,provider_transaction_id,created_at)
        values(?,?,?,?,'USD','merchantpayd',?,?) on conflict(effect_key) do nothing`,args:[`merchantpayd:${id}`,intent.user_id,intent.reference_id,intent.kind==='deposit'?intent.amount_minor:-Number(intent.amount_minor),intent.provider_transaction_id,timestamp]});
      if (entry.rowsAffected===1) {
        if (intent.kind==='deposit') {
          const amount=Number(intent.amount_minor)/100;
          const result=await tx.execute({sql:`update balances set available=round(available+?,2),total_deposited=round(total_deposited+?,2),updated_at=? where user_id=?`,args:[amount,amount,timestamp,intent.user_id]});
          if (result.rowsAffected!==1) throw new Error("Balance account missing.");
          const balance=(await tx.execute({sql:"select available from balances where user_id=?",args:[intent.user_id]})).rows[0];
          await tx.execute({sql:`update deposits set status='completed',balance_after=?,completed_at=?,paid_at=?,updated_at=?,provider_payment_link_id=?,provider_transaction_id=? where id=?`,args:[balance.available,timestamp,timestamp,timestamp,intent.payment_link_id,intent.provider_transaction_id,intent.reference_id]});
        } else {
          await adapters.fulfill(tx,intent);
        }
      }
      const table=intent.kind==='deposit'?'deposit_payment_sessions':'payment_sessions';
      await tx.execute({sql:`update ${table} set status='completed',provider_status='completed',provider_payment_link_id=?,provider_transaction_id=?,updated_at=?${intent.kind==='deposit'?',balance_credited_at=?':''} where id=?`,args:[intent.payment_link_id,intent.provider_transaction_id,timestamp,...(intent.kind==='deposit'?[timestamp]:[]),intent.session_id]});
      await tx.execute({sql:`update transactions set status='completed',provider_status='completed',provider_payment_link_id=?,provider_transaction_id=?,paid_at=?,processed_at=?,credited_at=?,summary=?,updated_at=? where id=?`,args:[intent.payment_link_id,intent.provider_transaction_id,timestamp,timestamp,intent.kind==='deposit'?timestamp:null,intent.kind==='deposit'?'Deposit completed':'Purchase completed',timestamp,intent.transaction_id]});
      await tx.execute({sql:"update payment_intents set status='completed',last_error=case when review_required=1 then last_error else null end,next_check_at=null,updated_at=? where id=?",args:[timestamp,id]});
      await tx.execute({sql:`insert into app_jobs(id,kind,payload,created_at,updated_at) values(?,'payment_completed',?,?,?) on conflict(id) do nothing`,args:[`payment:${id}`,JSON.stringify({intentId:id}),timestamp,timestamp]});
      await tx.commit();
    } catch(e) {await tx.rollback();throw e;} finally {tx.close();}
  }

  async function apply(id:string,payment:MerchantPayment,eventTransactionId?:string|null) {
    let intent=await get(id); if (!intent) return;
    if (intent.payment_link_id!==payment.payment_link_id) {await review(id,"Provider payment link mismatch.");return;}
    try {verifyPaymentAmount(payment,Number(intent.amount_minor),savedMerchantMethod(JSON.parse(String(intent.snapshot_json))));} catch(e) {await review(id,e instanceof Error?e.message:'Amount mismatch.');return;}
    const providerId=payment.transaction_id;
    if (payment.transaction_id && eventTransactionId && payment.transaction_id!==eventTransactionId) {await review(id,"Webhook and provider transaction disagree.");return;}
    if (payment.status==='completed' && !providerId) {await review(id,"Completed payment has no verified transaction id.");return;}
    const tx=await db.transaction("write");
    try {
      intent=(await tx.execute({sql:"select * from payment_intents where id=?",args:[id]})).rows[0];
      if (providerId) {
        const other=(await tx.execute({sql:"select intent_id from payment_attempts where provider_key='merchantpayd' and provider_transaction_id=?",args:[providerId]})).rows[0];
        if (other && other.intent_id!==id) throw new Error("Provider transaction is already assigned to another payment.");
        await tx.execute({sql:`insert into payment_attempts(provider_key,provider_transaction_id,intent_id,status,provider_json,created_at,updated_at)
          values('merchantpayd',?,?,?,?,?,?) on conflict(provider_key,provider_transaction_id) do update set
          status=case when payment_attempts.status='completed' then 'completed' else excluded.status end,provider_json=excluded.provider_json,updated_at=excluded.updated_at`,args:[providerId,id,payment.status,JSON.stringify(payment),now(),now()]});
      }
      if (intent.provider_transaction_id && payment.status==='completed' && intent.provider_transaction_id!==providerId) throw new Error("Multiple successful payments for one order. Manual review required.");
      if (intent.status==='completed' || (intent.provider_transaction_id && payment.status!=='completed')) {await tx.commit();return;}
      const paid=payment.status==='completed';
      const status=paid?(intent.kind==='purchase'?'paid_unfulfilled':'processing'):payment.status;
      const age=Date.now()-Date.parse(String(intent.created_at));
      await tx.execute({sql:`update payment_intents set status=?,provider_transaction_id=case when ?=1 then ? else provider_transaction_id end,
        provider_json=?,checked_at=?,next_check_at=?,review_required=case when ?=1 then 1 else review_required end,updated_at=? where id=?`,args:[status,paid?1:0,providerId??null,JSON.stringify(payment),now(),later(age>86400_000?86400_000:300_000),!paid&&age>86400_000?1:0,now(),id]});
      const table=intent.kind==='deposit'?'deposit_payment_sessions':'payment_sessions';
      await tx.execute({sql:`update ${table} set status=?,provider_status=?,updated_at=? where id=? and status<>'completed'`,args:[status,payment.status,now(),intent.session_id]});
      if (paid && intent.kind==='purchase') await tx.execute({sql:"update orders set payment_state='paid_unfulfilled',paid_at=coalesce(paid_at,?),updated_at=? where id=? and payment_state<>'completed'",args:[payment.paid_at||now(),now(),intent.reference_id]});
      await tx.commit();
    } catch(e) {await tx.rollback();await review(id,e instanceof Error?e.message:'Payment conflict.');return;} finally {tx.close();}
    if (payment.status==='completed') {
      try {await complete(id);} catch(e) {
        await review(id,e instanceof Error?e.message:'Fulfillment failed.');
        await db.execute({sql:"update payment_intents set next_check_at=? where id=?",args:[later(300_000),id]});
      }
    }
  }
  async function reconcile(id:string,eventTransactionId?:string|null) {
    const token=randomUUID();
    const lease=await db.execute({sql:`update payment_intents set lease_owner=?,lease_until=? where id=? and (lease_until is null or lease_until<?)`,args:[token,later(60_000),id,now()]});
    if (!lease.rowsAffected) return false;
    try {
      const intent=await get(id); if (!intent?.payment_link_id) return false;
      const result=await gateway.status(String(intent.payment_link_id));
      await apply(id,result,eventTransactionId);
      return true;
    } catch {await db.execute({sql:"update payment_intents set last_error='Provider status check failed; will retry.',next_check_at=?,updated_at=? where id=?",args:[later(300_000),now(),id]});return false;}
    finally {await db.execute({sql:"update payment_intents set lease_owner=null,lease_until=null where id=? and lease_owner=?",args:[id,token]});}
  }
  async function receive(raw:Uint8Array) {
    const body=Buffer.from(raw).toString('utf8');
    const payload=JSON.parse(body);
    if (!payload || typeof payload!=='object' || typeof payload.event!=='string' || !payload.data || typeof payload.data!=='object') throw new Error("Invalid webhook envelope.");
    const link=payload.data.payment_link_id;
    if (typeof link!=='string' || !/^[a-f0-9-]{36}$/i.test(link)) throw new Error("Missing payment link id.");
    const providerId=payload.event==='payment.settled'?payload.data.transaction?.id:payload.data.transaction_id;
    const id=createHash('sha256').update(raw).digest('hex');
    await db.execute({sql:`insert into payment_inbox(id,provider_key,payment_link_id,provider_transaction_id,event_type,body,created_at)
      values(?,'merchantpayd',?,?,?,?,?) on conflict(id) do nothing`,args:[id,link,typeof providerId==='string'?providerId:null,payload.event,body,now()]});
    return id;
  }
  async function drain() {
    const rows=(await db.execute({sql:`select * from payment_inbox where status in ('pending','unmatched') and (next_attempt_at is null or next_attempt_at<=?) order by created_at limit 100`,args:[now()]})).rows;
    for (const event of rows) {
      const intent=(await db.execute({sql:"select id from payment_intents where payment_link_id=?",args:[event.payment_link_id]})).rows[0];
      if (!intent) {await db.execute({sql:"update payment_inbox set status='unmatched',attempts=attempts+1,last_error='Unknown payment link; manual matching required.',next_attempt_at=? where id=?",args:[later(300_000),event.id]});continue;}
      if (event.event_type==='payment.settled' || event.event_type==='payment.failed') {
        const checked = await reconcile(String(intent.id),event.event_type==='payment.settled'?String(event.provider_transaction_id||'')||null:null);
        if (!checked) {
          await db.execute({sql:"update payment_inbox set attempts=attempts+1,next_attempt_at=? where id=?",args:[later(300_000),event.id]});
          continue;
        }
      }
      // Independently persisted intents remain due even if a provider lookup fails.
      await db.execute({sql:"update payment_inbox set status='processed',processed_at=?,attempts=attempts+1 where id=?",args:[now(),event.id]});
    }
  }
  async function sweep() {
    await drain();
    const rows=(await db.execute({sql:`select id from payment_intents where payment_link_id is not null and status<>'completed'
      and (next_check_at is null or next_check_at<=?) order by next_check_at limit 25`,args:[now()]})).rows;
    for (const row of rows) await reconcile(String(row.id));
    return {checked:rows.length};
  }
  return {create:localOperation(db,create),get,apply:localOperation(db,apply),reconcile:localOperation(db,reconcile),receive:localOperation(db,receive),drain:localOperation(db,drain),sweep:localOperation(db,sweep)};
}
