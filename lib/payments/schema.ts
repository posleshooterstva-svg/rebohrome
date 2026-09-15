import type { Client } from "@libsql/client";
import { RANDOMIZED_PACK_CREATE_STATEMENTS, RANDOMIZED_PACK_ORDER_ITEM_COLUMNS } from "../randomized-pack-schema.ts";
import { LEGACY_COLUMNS } from './legacy-columns.ts';

export const PAYMENT_SCHEMA = [
  `create table if not exists app_migrations (id text primary key, applied_at text not null)`,
  `create table if not exists payment_intents (
    id text primary key, user_id text not null, kind text not null check(kind in ('deposit','purchase')),
    idempotency_key text not null, request_hash text not null, amount_minor integer not null check(amount_minor > 0),
    reference_id text not null, session_id text not null unique, transaction_id text not null unique,
    provider_key text not null default 'merchantpayd', payment_link_id text unique, payment_url text,
    provider_transaction_id text, status text not null default 'initializing', snapshot_json text not null,
    provider_json text, last_error text, review_required integer not null default 0,
    closed_at text, next_check_at text, checked_at text, lease_until text, lease_owner text,
    created_at text not null, updated_at text not null, unique(user_id,idempotency_key))`,
  `create unique index if not exists payment_intents_active on payment_intents(user_id,kind)
    where closed_at is null and status in ('initializing','creation_unknown','pending','attempting','processing','paid_unfulfilled','manual_review')`,
  `create index if not exists payment_intents_due on payment_intents(next_check_at, lease_until)`,
  `create table if not exists payment_attempts (
    provider_key text not null, provider_transaction_id text not null, intent_id text not null,
    status text not null, provider_json text, created_at text not null, updated_at text not null,
    primary key(provider_key,provider_transaction_id))`,
  `create table if not exists payment_inbox (
    id text primary key, provider_key text not null, payment_link_id text, provider_transaction_id text,
    event_type text not null, body text not null, status text not null default 'pending',
    attempts integer not null default 0, last_error text, next_attempt_at text,
    created_at text not null, processed_at text)`,
  `create table if not exists financial_entries (
    effect_key text primary key, user_id text not null, reference_id text not null,
    amount_minor integer not null, currency text not null check(currency='USD'),
    provider_key text not null, provider_transaction_id text, created_at text not null)`,
  `create unique index if not exists financial_entries_provider_tx on financial_entries(provider_key,provider_transaction_id)
    where provider_transaction_id is not null`,
  `create table if not exists app_jobs (id text primary key, kind text not null, payload text not null,
    status text not null default 'pending', attempts integer not null default 0, last_error text,
    lease_until text, created_at text not null, updated_at text not null)`,
  `create table if not exists auth_rate_limits (key text primary key, attempts integer not null, reset_at integer not null)`,
  `create table if not exists cart_versions (user_id text primary key, version integer not null default 0)`,
];

/** Explicit migration entrypoint. Never called from a route or ordinary repository read. */
export async function migratePayments(db: Client) {
  await db.batch([...RANDOMIZED_PACK_CREATE_STATEMENTS, ...PAYMENT_SCHEMA], "write");
  const tx=await db.transaction("write");
  try {
    const columns = async (table:string) => (await tx.execute(`pragma table_info(${table})`)).rows.map(r=>String(r.name));
    const legacyDone=await tx.execute("select id from app_migrations where id='legacy-columns-v1'");
    if (!legacyDone.rows.length) {
      const tables=[...new Set(LEGACY_COLUMNS.map(([table])=>table))];
      for (const table of tables) {
        const present=await columns(table);
        if (!present.length) throw new Error(`Missing baseline table: ${table}. Run db:setup first.`);
        for (const [,definition] of LEGACY_COLUMNS.filter(([name])=>name===table)) {
          const column=definition.split(' ')[0];
          if (!present.includes(column)) {await tx.execute(`alter table ${table} add column ${definition}`);present.push(column);}
        }
      }
      await tx.execute({sql:"insert into app_migrations(id,applied_at) values('legacy-columns-v1',?)",args:[new Date().toISOString()]});
    }
    const orderColumns=await columns('order_items');
    for (const definition of RANDOMIZED_PACK_ORDER_ITEM_COLUMNS) {
      if (!orderColumns.includes(definition.split(' ')[0])) await tx.execute(`alter table order_items add column ${definition}`);
    }
    const already=await tx.execute("select id from app_migrations where id='merchantpayd-v1'");
    const brand=await tx.execute("select id from app_migrations where id='payment-brand-v1'");
    if (!brand.rows.length) {
      await tx.execute("update payment_providers set provider_name='RebohromePayment',public_name='RebohromePayment',admin_name='RebohromePayment' where provider_key='merchantpayd'");
      await tx.execute({sql:"insert into app_migrations(id,applied_at) values('payment-brand-v1',?)",args:[new Date().toISOString()]});
    }
    if (already.rows.length) { await tx.commit(); return; }
    for (const table of ["payment_sessions","deposit_payment_sessions","transactions","deposits","orders"]) {
      const present=await columns(table);
      for (const col of ["provider_payment_link_id text","provider_transaction_id text"]) {
        if (!present.includes(col.split(" ")[0])) await tx.execute(`alter table ${table} add column ${col}`);
      }
    }
    if (!(await columns("order_items")).includes("product_snapshot_json")) await tx.execute("alter table order_items add column product_snapshot_json text");
    if (!(await columns("broadcasts")).includes("sending_started_at")) await tx.execute("alter table broadcasts add column sending_started_at text");
    // Nullable optional Telegram handle: retain all other profile columns and indexes.
    const tableSql=String((await tx.execute("select sql from sqlite_master where type='table' and name='profiles'")).rows[0]?.sql || "");
    if (/telegram_username\s+text\s+not\s+null/i.test(tableSql)) {
      const indexes=(await tx.execute("select sql from sqlite_master where tbl_name='profiles' and type in ('index','trigger') and sql is not null")).rows;
      await tx.execute(tableSql.replace(/create table\s+(?:if not exists\s+)?["`]?profiles["`]?/i,'create table profiles_nullable').replace(/(telegram_username\s+text)\s+not\s+null/i,'$1'));
      await tx.execute("insert into profiles_nullable select * from profiles");
      await tx.execute("drop table profiles");
      await tx.execute("alter table profiles_nullable rename to profiles");
      for (const row of indexes) await tx.execute(String(row.sql));
    }
    const timestamp=new Date().toISOString();
    await tx.execute({sql:`insert into payment_providers (
      provider_key,gate_number,provider_name,public_name,admin_name,enabled,default_user_visible,
      supports_usd,supports_eur,min_amount,max_amount,min_deposit_amount,max_deposit_amount,
      default_deposit_amount,currency,priority,created_at,updated_at)
      select 'merchantpayd',5,'RebohromePayment','RebohromePayment','RebohromePayment',1,default_user_visible,
        1,0,min_amount,max_amount,min_deposit_amount,max_deposit_amount,default_deposit_amount,'USD',1,?,?
      from payment_providers where provider_key='transvoucher' on conflict(provider_key) do nothing`,args:[timestamp,timestamp]});
    await tx.execute(`insert into user_payment_gate_access (id,user_id,provider_key,enabled,reason,created_at,updated_at)
      select id || '-merchantpayd',user_id,'merchantpayd',enabled,reason,created_at,updated_at from user_payment_gate_access where provider_key='transvoucher'
      on conflict(user_id,provider_key) do nothing`);
    await tx.execute({sql:"insert into app_migrations(id,applied_at) values ('merchantpayd-v1',?)",args:[timestamp]});
    await tx.commit();
  } catch(error) { await tx.rollback(); throw error; } finally { tx.close(); }
}
