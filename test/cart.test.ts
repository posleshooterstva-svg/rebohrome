import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readCart,writeCart,CartConflict } from '../lib/payments/cart.ts';
test('cart saves atomically, rejects stale versions and isolates accounts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rebohrome-cart-'));
 const db=createClient({url:`file:${join(dir,'test.db').replaceAll('\\','/')}`});
 try{
  await db.batch(['create table cart_versions(user_id text primary key,version integer not null)','create table cart_items(id text primary key,user_id text,product_id text,quantity integer,delivery_type text,updated_at text)'],'write');
  const items=[{productId:'one',quantity:1,deliveryType:'digital' as const}];
  assert.equal(await writeCart(db,'alice',items,0),1);
  await assert.rejects(writeCart(db,'alice',[],0),CartConflict);
  assert.deepEqual(await readCart(db,'alice'),{version:1,items});
  assert.deepEqual(await readCart(db,'bob'),{version:0,items:[]});
  await assert.rejects(writeCart(db,'alice',[...items,...items],1));
  assert.deepEqual(await readCart(db,'alice'),{version:1,items});
 }finally{db.close();await rm(dir,{recursive:true,force:true}).catch(error=>{if(error.code!=='EBUSY')throw error;});}
});
