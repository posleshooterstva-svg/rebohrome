import test from 'node:test';
import {merchantMethodCode,MERCHANTPAYD_METHODS,type MerchantMethodCode} from '../lib/payments/merchantpayd-methods.ts';
import assert from 'node:assert/strict';
import {createClient,type Client} from '@libsql/client';
import {createHmac,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PAYMENT_SCHEMA} from '../lib/payments/schema.ts';
import {paymentEngine,PaymentConflict,type PaymentGateway,type PaymentAdapters} from '../lib/payments/merchantpayd-engine.ts';
import {merchantClient,verifyMerchantSignature,verifyPaymentAmount,MerchantApiError,type MerchantPayment,type MerchantConfig} from '../lib/payments/merchantpayd-client.ts';
const link=randomUUID(),providerTx=randomUUID();
function payment(overrides:Partial<MerchantPayment>={}):MerchantPayment{return {payment_link_id:link,transaction_id:providerTx,status:'completed',fiat_base_amount:'100.000000',fiat_total_amount:'105.000000',fiat_currency:'USD',settled_amount:'98.700000',payment_url:`https://checkout.example/${link}`,payment_method:{type:'cash-app-v4'},...overrides};}
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'rebohrome-payments-'));const db=createClient({url:`file:${join(dir,'test.db').replaceAll('\\','/')}`});
 await db.batch([...PAYMENT_SCHEMA,
 `create table balances(user_id text primary key,available real,total_deposited real,total_spent real,updated_at text)`,
 `create table deposits(id text primary key,status text,balance_after real,completed_at text,paid_at text,updated_at text,provider_payment_link_id text,provider_transaction_id text)`,
 ...['payment_sessions','deposit_payment_sessions'].map(t=>`create table ${t}(id text primary key,status text,payment_url text,provider_status text,provider_payment_link_id text,provider_transaction_id text,updated_at text,balance_credited_at text)`),
 `create table transactions(id text primary key,status text,provider_status text,provider_payment_link_id text,provider_transaction_id text,paid_at text,processed_at text,credited_at text,summary text,updated_at text)`,
 `create table orders(id text primary key,user_id text,payment_state text,paid_at text,updated_at text)`,
 `create table test_inventory(order_id text primary key,quantity integer)`,
 `insert into balances values('user',50,0,0,null)`], 'write');
 let current=payment(),creates=0,failCreate=false,failFulfill=false;
 const gateway:PaymentGateway={async create(input){creates++;if(failCreate)throw new MerchantApiError('timeout',502,true);return payment({status:'pending',transaction_id:null,payment_method:{type:input.paymentMethod||'cash-app-v4'}});},async status(){return current;}};
 const adapters:PaymentAdapters={async initialize(tx,i){
  await tx.execute({sql:'insert into transactions(id,status) values(?,?)',args:[i.transaction_id,'pending']});
  await tx.execute({sql:`insert into ${i.kind==='deposit'?'deposit_payment_sessions':'payment_sessions'}(id,status) values(?,'pending')`,args:[i.id]});
  await tx.execute({sql:i.kind==='deposit'?'insert into deposits(id,status) values(?,?)':'insert into orders(id,payment_state) values(?,?)',args:[i.reference_id,'pending']});
 },async fulfill(tx,i){await tx.execute({sql:'insert into test_inventory values(?,1)',args:[i.reference_id]});if(failFulfill)throw new Error('Out of stock');await tx.execute({sql:"update orders set payment_state='completed' where id=?",args:[i.reference_id]});}};
 const engine=paymentEngine(db,gateway,adapters);
 async function create(kind:'purchase'|'deposit'='deposit',key=randomUUID(),fingerprint='same',paymentMethod:MerchantMethodCode='cash-app-v4') {return engine.create({userId:'user',kind,key,fingerprint,amountMinor:10000,snapshot:{},paymentMethod},{email:'buyer@example.test',title:'Test',description:'Test payment'});}
 return {db,engine,create,get creates(){return creates;},setPayment(p:MerchantPayment){current=p;},failCreate(){failCreate=true;},failFulfill(){failFulfill=true;},recover(){failFulfill=false;},async close(){db.close();await rm(dir,{recursive:true,force:true,maxRetries:0}).catch(error=>{if(error.code!=='EBUSY')throw error;});}};
}
async function scalar(db:Client,sql:string){return Object.values((await db.execute(sql)).rows[0])[0];}
test('webhook HMAC uses exact raw bytes and requires configured secret',()=>{
 const raw=Buffer.from('{"event":"payment.settled"}');const signature='sha256='+createHmac('sha256','test').update(raw).digest('hex');
 assert(verifyMerchantSignature(raw,signature,'test'));assert(!verifyMerchantSignature(Buffer.concat([raw,Buffer.from(' ')]),signature,'test'));assert(!verifyMerchantSignature(raw,signature,''));assert(!verifyMerchantSignature(raw,'sha256=00','test'));
});
test('public method names map to exact provider codes; retired methods reject',()=>{
 assert.equal(merchantMethodCode('Cash App'),'cash-app-v4');
 assert.equal(merchantMethodCode('Bank Transfer'),'banking');
 assert.equal(MERCHANTPAYD_METHODS['cash-app-v4'],'Cash App');
 for(const method of ['Credit Card','Apple Pay','Google Pay','unknown'])assert.throws(()=>merchantMethodCode(method));
});
test('Bank Transfer sends banking and accepts nullable classic-payment fields',async()=>{
 let sent:Record<string,unknown>={};
 const client=merchantClient({baseUrl:'https://api.example',apiKey:'test',apiSecret:'test',webhookSecret:'test',method:'cash-app-v4',enabled:true},async(_url,init)=>{
  sent=JSON.parse(String(init?.body));
  return Response.json({success:true,data:payment({status:'pending',transaction_id:null,payment_method:{type:'banking',brand:null,card_last_four:null},blockchain_tx_hash:null,commodity:null,network:null})});
 });
 await client.create({amountMinor:10000,email:'buyer@example.test',title:'Test',description:'Test',intentId:'local',paymentMethod:'banking'});
 assert.equal(sent.payment_method,'banking');assert.equal(sent.currency,'USD');
});
test('saved Bank Transfer method controls reconciliation and idempotency',async()=>{const f=await fixture();try{
 const key=randomUUID();const {intent}=await f.create('deposit',key,'same','banking');
 assert.equal(JSON.parse(String(intent.snapshot_json)).paymentMethod,'banking');
 await assert.rejects(f.create('deposit',key,'same','cash-app-v4'),PaymentConflict);
 await f.engine.apply(String(intent.id),payment());
 assert.equal(await scalar(f.db,'select available from balances'),50);
 const banking=payment({payment_method:{type:'banking',brand:null,card_last_four:null},blockchain_tx_hash:null});
 await f.engine.apply(String(intent.id),banking);await f.engine.apply(String(intent.id),banking);
 assert.equal(await scalar(f.db,'select available from balances'),150);
 assert.equal(await scalar(f.db,'select count(*) from financial_entries'),1);
}finally{await f.close();}});
test('client sends both headers, USD fixed price and retains converted fields',async()=>{
 const config:MerchantConfig={baseUrl:'https://api.example',apiKey:'key-test',apiSecret:'secret-test',webhookSecret:'sign',method:'cash-app-v4',enabled:true};
 const calls:Array<{url:string;init:RequestInit}>=[];
 const transport:typeof fetch=async(url,init)=>{calls.push({url:String(url),init:init!});return Response.json({success:true,data:payment({status:'pending',transaction_id:null})});};
 const client=merchantClient(config,transport);await client.create({amountMinor:10000,email:'buyer@example.test',title:'Order',description:'Description',intentId:'local'});await client.status(link);
 for(const call of calls){assert.equal(new Headers(call.init.headers).get('X-API-Key'),'key-test');assert.equal(new Headers(call.init.headers).get('X-API-Secret'),'secret-test');}
 const body=JSON.parse(String(calls[0].init.body));assert.equal(body.amount,100);assert.equal(body.currency,'USD');assert.equal(body.is_price_dynamic,false);assert.equal(body.payment_method,'cash-app-v4');
 assert.doesNotThrow(()=>verifyPaymentAmount(payment({fiat_currency:'EUR',fiat_base_amount:90,fiat_total_amount:95,original_currency:'USD',original_amount:100,exchange_rate:0.9}),10000));
 assert.throws(()=>verifyPaymentAmount(payment({fiat_base_amount:99}),10000));
});
test('parallel duplicate settlement and later failed events credit exactly once',async()=>{const f=await fixture();try{
 const {intent}=await f.create();await Promise.all([f.engine.apply(String(intent.id),payment()),f.engine.apply(String(intent.id),payment())]);
 await f.engine.apply(String(intent.id),payment({status:'failed'}));await f.engine.apply(String(intent.id),payment());
 assert.equal(await scalar(f.db,"select available from balances where user_id='user'"),150);assert.equal(await scalar(f.db,'select count(*) from financial_entries'),1);
 assert.equal((await f.engine.get(String(intent.id)))?.status,'completed');
}finally{await f.close();}});
test('different keys cannot create parallel active payments; same key with changed request conflicts',async()=>{const f=await fixture();try{
 const key=randomUUID();await f.create('deposit',key);await f.create('deposit',key);assert.equal(f.creates,1);
 await assert.rejects(f.create('deposit',key,'different'),PaymentConflict);await assert.rejects(f.create(),PaymentConflict);
}finally{await f.close();}});
test('ambiguous creation is persisted and never automatically repeated',async()=>{const f=await fixture();try{
 f.failCreate();const key=randomUUID();const first=await f.create('deposit',key);assert.equal(first.intent.status,'creation_unknown');await f.create('deposit',key);assert.equal(f.creates,1);await assert.rejects(f.create(),PaymentConflict);
}finally{await f.close();}});
test('amount, currency and missing transaction mismatches never credit',async()=>{for(const p of [payment({fiat_base_amount:1}),payment({fiat_currency:'EUR'}),payment({transaction_id:null})]){const f=await fixture();try{
 const {intent}=await f.create();await f.engine.apply(String(intent.id),p);assert.equal(await scalar(f.db,'select available from balances'),50);assert.equal((await f.engine.get(String(intent.id)))?.review_required,1);
}finally{await f.close();}}});
test('paid fulfillment failure rolls back inventory and retries without a second charge',async()=>{const f=await fixture();try{
 const {intent}=await f.create('purchase');f.failFulfill();await f.engine.apply(String(intent.id),payment());assert.equal(await scalar(f.db,'select count(*) from test_inventory'),0);assert.equal(await scalar(f.db,'select count(*) from financial_entries'),0);assert.equal((await f.engine.get(String(intent.id)))?.status,'paid_unfulfilled');
 f.recover();await f.engine.apply(String(intent.id),payment());await f.engine.apply(String(intent.id),payment());assert.equal(await scalar(f.db,'select count(*) from test_inventory'),1);assert.equal(await scalar(f.db,'select count(*) from financial_entries'),1);
}finally{await f.close();}});
test('lost webhook is recovered by status polling; closed session can settle',async()=>{const f=await fixture();try{
 const {intent}=await f.create();await f.db.execute({sql:"update payment_intents set closed_at=?,created_at=? where id=?",args:[new Date().toISOString(),'2020-01-01T00:00:00.000Z',intent.id]});
 await f.engine.sweep();assert.equal(await scalar(f.db,'select available from balances'),150);
}finally{await f.close();}});
test('inbox retains early unmatched events and detects a second successful transaction',async()=>{const f=await fixture();try{
 const raw=Buffer.from(JSON.stringify({event:'payment.settled',data:{payment_link_id:link,transaction:{id:providerTx}}}));const eventId=await f.engine.receive(raw);await f.engine.receive(raw);await f.engine.drain();assert.equal(await scalar(f.db,'select count(*) from payment_inbox'),1);
 const {intent}=await f.create();await f.db.execute({sql:'update payment_inbox set next_attempt_at=null where id=?',args:[eventId]});await f.engine.drain();assert.equal(await scalar(f.db,'select available from balances'),150);
 await f.engine.apply(String(intent.id),payment({transaction_id:randomUUID()}));assert.equal(await scalar(f.db,'select available from balances'),150);assert.equal((await f.engine.get(String(intent.id)))?.review_required,1);
}finally{await f.close();}});
