import { promises as fs } from "node:fs";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { createClient } from "@libsql/client";

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, ".env.local");
const productsSeedPath = path.join(projectRoot, "data", "seeds", "products.json");
const useLocalDatabase = process.argv.includes("--local");
const shouldSeed = process.argv.includes("--seed");

function parseEnv(text) {
  const result = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    result[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  return result;
}

async function loadEnv() {
  const localEnv = await fs.readFile(envPath, "utf8").catch(() => "");
  return {
    ...parseEnv(localEnv),
    ...process.env,
  };
}

function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

function normalizeTelegramUsername(value) {
  const next = value.trim();
  return next.startsWith("@") ? next.toLowerCase() : `@${next.toLowerCase()}`;
}

function buildPlaceholderEmail(username) {
  return `${normalizeUsername(username)}@rebohrome.local`;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function normalizeDatabaseUrl(rawUrl) {
  const trimmed = rawUrl.trim();

  if (!trimmed.startsWith("file:")) {
    return trimmed;
  }

  const rawPath = trimmed.slice("file:".length).replace(/\\/g, "/");

  if (!rawPath) {
    throw new Error("Invalid file database URL: missing file path.");
  }

  if (rawPath.startsWith("/") || /^[a-zA-Z]:\//.test(rawPath)) {
    return `file:${rawPath}`;
  }

  const absolutePath = path.resolve(projectRoot, rawPath).replace(/\\/g, "/");
  return `file:${absolutePath}`;
}

function resolveDatabaseConfig(env) {
  const externalUrl = env.DATABASE_URL?.trim();
  const localUrl = env.LOCAL_DATABASE_URL?.trim();
  const selectedUrl = useLocalDatabase
    ? localUrl || externalUrl
    : externalUrl || localUrl;

  if (!selectedUrl) {
    throw new Error(
      "Missing database URL. Set DATABASE_URL for an external database or LOCAL_DATABASE_URL for local setup.",
    );
  }

  const normalizedUrl = normalizeDatabaseUrl(selectedUrl);

  if (normalizedUrl.startsWith("file:")) {
    mkdirSync(path.dirname(normalizedUrl.slice("file:".length)), {
      recursive: true,
    });
  }

  return {
    url: normalizedUrl,
    authToken: env.DATABASE_AUTH_TOKEN?.trim() || undefined,
  };
}

function nowIso() {
  return new Date().toISOString();
}

async function loadSeedProducts() {
  const file = await fs.readFile(productsSeedPath, "utf8");
  return JSON.parse(file);
}

const CREATE_STATEMENTS = [
  `create table if not exists users (
    id text primary key,
    username text not null unique,
    email text not null unique,
    name text not null,
    password_hash text not null,
    status text not null,
    require_password_reset integer not null default 0,
    is_deleted integer not null default 0,
    deleted_at text,
    deleted_by text,
    created_at text not null,
    updated_at text not null,
    last_login_at text
  )`,
  `create table if not exists profiles (
    user_id text primary key,
    role text not null,
    telegram_username text not null unique,
    telegram_id text,
    telegram_chat_id text,
    telegram_verified integer not null default 0,
    telegram_verified_at text,
    telegram_linked_at text,
    withdrawal_wallet text,
    verified integer not null default 1,
    created_at text not null,
    updated_at text not null
  )`,
  `create table if not exists telegram_identities (
    id text primary key,
    telegram_id text not null unique,
    telegram_username text,
    chat_id text not null,
    first_name text,
    last_name text,
    language_code text,
    linked_user_id text unique,
    is_linked integer not null default 0,
    first_seen_at text not null,
    last_seen_at text not null,
    created_at text not null,
    updated_at text not null
  )`,
  `create table if not exists telegram_verification_codes (
    id text primary key,
    telegram_id text not null,
    telegram_username text,
    telegram_chat_id text not null,
    purpose text not null,
    username text not null,
    email text not null,
    password_hash_temp text not null,
    code_hash text not null,
    expires_at text not null,
    attempts integer not null default 0,
    resend_count integer not null default 0,
    last_sent_at text not null,
    resend_window_started_at text not null,
    verified_at text,
    consumed_at text,
    ip text not null,
    country text,
    user_agent text,
    created_at text not null
  )`,
  `create table if not exists telegram_users (
    telegram_username text primary key,
    telegram_chat_id text not null,
    first_name text,
    last_name text,
    last_seen_at text not null,
    created_at text not null
  )`,
  `create table if not exists telegram_verifications (
    id text primary key,
    username text not null,
    email text not null,
    password_hash_temp text not null,
    telegram_username text not null,
    telegram_chat_id text not null,
    code_hash text not null,
    expires_at text not null,
    attempts integer not null default 0,
    resend_count integer not null default 0,
    last_sent_at text not null,
    resend_window_started_at text not null,
    verified_at text,
    consumed_at text,
    ip text not null,
    country text,
    user_agent text,
    created_at text not null
  )`,
  `create table if not exists balances (
    user_id text primary key,
    available integer not null default 0,
    pending_withdrawal integer not null default 0,
    total_deposited integer not null default 0,
    total_spent integer not null default 0,
    total_withdrawn integer not null default 0,
    updated_at text not null
  )`,
  `create table if not exists sessions (
    id text primary key,
    user_id text not null,
    token_hash text not null unique,
    user_agent text,
    ip_address text,
    created_at text not null,
    expires_at text not null
  )`,
  `create table if not exists products (
    id text primary key,
    title text not null,
    rarity text not null,
    price integer not null,
    currency text not null default 'USD',
    stock integer not null,
    collection text not null,
    category text not null,
    description text not null,
    tagline text not null,
    default_delivery_type text not null default 'digital',
    delivery_digital text not null,
    delivery_physical text not null,
    edition text not null,
    shape text not null,
    image_url text,
    image_path text,
    image_updated_at text,
    featured integer not null default 0,
    homepage_featured integer not null default 0,
    featured_started_at text,
    showcase_float real not null default 1,
    showcase_rotation_seconds integer not null default 12,
    status text not null default 'active',
    archived integer not null default 0,
    palette_glow text not null,
    palette_glow_soft text not null,
    palette_core text not null,
    palette_ring text not null,
    created_at text not null,
    updated_at text not null
  )`,
  `create table if not exists orders (
    id text primary key,
    user_id text not null,
    status text not null,
    payment_state text not null,
    subtotal integer not null,
    shipping integer not null,
    total integer not null,
    currency text not null default 'USD',
    shipping_name text not null,
    shipping_email text not null,
    shipping_address text not null,
    shipping_city text not null,
    shipping_postal_code text not null,
    payment_method text not null,
    payment_provider text,
    transvoucher_transaction_id text,
    transvoucher_reference_id text,
    provider_status text,
    failure_reason text,
    remaining_balance integer,
    created_at text not null,
    updated_at text not null,
    paid_at text
  )`,
  `create table if not exists payment_sessions (
    id text primary key,
    user_id text not null,
    payment_method text not null,
    payment_provider text not null,
    currency text not null,
    subtotal integer not null,
    shipping integer not null,
    total integer not null,
    status text not null,
    items_json text not null,
    meta_json text,
    order_id text,
    transaction_id text,
    transvoucher_transaction_id text,
    transvoucher_reference_id text,
    payment_url text,
    provider_status text,
    raw_provider_response text,
    created_at text not null,
    updated_at text not null,
    expires_at text not null
  )`,
  `create table if not exists deposit_payment_sessions (
    id text primary key,
    user_id text not null,
    payment_method text not null,
    payment_provider text not null,
    currency text not null,
    original_amount integer not null,
    credited_amount_usd integer not null,
    exchange_rate real not null,
    status text not null,
    meta_json text,
    deposit_id text,
    transaction_id text,
    transvoucher_transaction_id text,
    transvoucher_reference_id text,
    payment_url text,
    provider_status text,
    raw_provider_response text,
    created_at text not null,
    updated_at text not null,
    expires_at text not null
  )`,
  `create table if not exists order_items (
    id text primary key,
    order_id text not null,
    product_id text not null,
    quantity integer not null,
    unit_price integer not null,
    delivery_type text not null
  )`,
  `create table if not exists owned_cards (
    id text primary key,
    user_id text not null,
    product_id text not null,
    order_id text not null,
    quantity integer not null,
    acquired_at text not null
  )`,
  `create table if not exists cart_items (
    id text primary key,
    user_id text not null,
    product_id text not null,
    quantity integer not null,
    delivery_type text not null,
    updated_at text not null
  )`,
  `create table if not exists transactions (
    id text primary key,
    user_id text not null,
    kind text not null,
    amount integer not null,
    original_amount integer,
    original_currency text,
    display_currency text,
    credited_amount_usd integer,
    exchange_rate real,
    payment_method text,
    payment_provider text,
    transvoucher_transaction_id text,
    transvoucher_reference_id text,
    payment_url text,
    provider_status text,
    raw_provider_response text,
    status text not null,
    reference_id text not null,
    summary text not null,
    meta_json text,
    created_at text not null,
    updated_at text not null,
    paid_at text,
    provider_checked_at text,
    processed_at text,
    credited_at text,
    next_check_at text,
    last_error text,
    reconciliation_attempts integer not null default 0
  )`,
  `create table if not exists deposits (
    id text primary key,
    user_id text not null,
    amount integer not null,
    original_amount integer,
    original_currency text,
    credited_amount_usd integer,
    exchange_rate real,
    payment_method text not null,
    payment_provider text,
    transvoucher_transaction_id text,
    transvoucher_reference_id text,
    cardholder_name text not null,
    card_masked text not null,
    status text not null,
    balance_before integer not null,
    balance_after integer not null,
    created_at text not null,
    updated_at text not null,
    completed_at text,
    paid_at text
  )`,
  `create table if not exists withdrawal_requests (
    id text primary key,
    user_id text not null,
    amount integer not null,
    requested_amount integer,
    base_payout_percent integer not null default 60,
    bonus_payout_percent integer not null default 0,
    final_payout_percent integer not null default 60,
    payout_amount integer,
    wallet_address text not null,
    wallet_usdt_bep20 text,
    telegram_id text not null,
    status text not null,
    source_deposit_id text,
    source_card_masked text,
    source_cardholder_name text,
    admin_note text,
    telegram_chat_id text,
    telegram_message_id text,
    telegram_sync_status text not null default 'pending',
    telegram_synced_at text,
    telegram_last_error text,
    last_action_source text not null default 'system',
    last_updated_by_admin_id text,
    status_updated_by text,
    status_updated_at text,
    created_at text not null,
    updated_at text not null
  )`,
  `create table if not exists admin_logs (
    id text primary key,
    admin_user_id text not null,
    action text not null,
    entity_type text not null,
    entity_id text not null,
    message text not null,
    source text not null default 'dashboard',
    previous_status text,
    next_status text,
    metadata_json text,
    created_at text not null
  )`,
  `create table if not exists withdrawal_status_history (
    id text primary key,
    withdrawal_id text not null,
    action_type text not null,
    previous_status text,
    next_status text not null,
    source text not null,
    admin_user_id text,
    admin_username text,
    admin_telegram_username text,
    note text,
    created_at text not null
  )`,
  `create table if not exists telegram_action_tokens (
    id text primary key,
    withdrawal_id text not null,
    action_type text not null,
    callback_signature text not null,
    allowed_from_status text not null,
    expires_at text not null,
    consumed_at text,
    created_at text not null
  )`,
  `create table if not exists telegram_runtime_state (
    state_key text primary key,
    state_value text not null,
    updated_at text not null
  )`,
  `create table if not exists notifications (
    id text primary key,
    user_id text not null,
    kind text not null,
    title text not null,
    body text not null,
    status text not null default 'unread',
    meta_json text,
    created_at text not null,
    read_at text
  )`,
  `create table if not exists payment_reconciliation_runs (
    id text primary key,
    provider text not null,
    started_at text not null,
    finished_at text,
    checked_count integer not null default 0,
    succeeded_count integer not null default 0,
    failed_count integer not null default 0,
    expired_count integer not null default 0,
    pending_count integer not null default 0,
    skipped_count integer not null default 0,
    error_count integer not null default 0,
    last_error text,
    trigger_source text not null default 'cron'
  )`,
  `create table if not exists archive_ledger (
    id text primary key,
    ledger_id text not null unique,
    event_type text not null,
    user_id text,
    admin_id text,
    entity_type text not null,
    entity_id text not null,
    related_order_id text,
    related_transaction_id text,
    related_product_id text,
    title text not null,
    description text not null,
    metadata text,
    previous_hash text,
    event_hash text not null,
    created_at text not null
  )`,
  `create table if not exists vault_integrity_events (
    id text primary key,
    user_id text not null,
    event_type text not null,
    score_delta integer not null default 0,
    reason text not null,
    created_at text not null
  )`,
  `create table if not exists broadcasts (
    id text primary key,
    broadcast_id text not null unique,
    title text not null,
    body text not null,
    preview_text text,
    type text not null,
    priority text not null default 'normal',
    cta_label text,
    cta_url text,
    target_type text not null,
    target_filters text,
    channels text not null,
    status text not null,
    scheduled_at text,
    sent_at text,
    expires_at text,
    created_by text,
    updated_by text,
    internal_note text,
    show_as_popup integer not null default 0,
    popup_position text not null default 'bottom-left',
    allow_user_dismiss integer not null default 0,
    is_active integer not null default 1,
    deleted_at text,
    created_at text not null,
    updated_at text not null
  )`,
  `create table if not exists broadcast_deliveries (
    id text primary key,
    broadcast_id text not null,
    user_id text not null,
    channel text not null,
    status text not null,
    delivered_at text,
    read_at text,
    skipped_reason text,
    error_message text,
    telegram_message_id text,
    created_at text not null,
    updated_at text not null
  )`,
  `create table if not exists user_notifications (
    id text primary key,
    user_id text not null,
    broadcast_id text,
    type text not null,
    title text not null,
    body text not null,
    cta_label text,
    cta_url text,
    read_at text,
    expires_at text,
    show_as_popup integer not null default 0,
    dismissed_at text,
    created_at text not null
  )`,
  `create table if not exists provider_health_logs (
    id text primary key,
    provider text not null,
    status text not null,
    latency_ms integer,
    success integer not null default 0,
    error_message text,
    checked_at text not null
  )`,
  `create table if not exists webhook_events (
    id text primary key,
    provider text not null,
    event_type text not null,
    provider_transaction_id text,
    valid_signature integer not null default 0,
    duplicate integer not null default 0,
    processed integer not null default 0,
    error text,
    received_at text not null
  )`,
  `create table if not exists system_settings (
    key text primary key,
    value text not null,
    updated_by text,
    updated_at text not null
  )`,
  `create table if not exists security_audit_events (
    id text primary key,
    event_type text not null,
    user_id text,
    username text,
    telegram_username text,
    role text,
    ip_address text not null,
    country text not null,
    user_agent text not null,
    language text not null,
    route text not null,
    created_at text not null
  )`,
];

const COLUMN_PATCHES = [
  ["profiles", "telegram_chat_id text"],
  ["profiles", "telegram_verified integer not null default 0"],
  ["users", "require_password_reset integer not null default 0"],
  ["users", "is_deleted integer not null default 0"],
  ["users", "deleted_at text"],
  ["users", "deleted_by text"],
  ["users", "vault_integrity_score integer not null default 0"],
  ["users", "vault_integrity_status text not null default 'Unstable'"],
  ["users", "vault_integrity_updated_at text"],
  ["users", "archive_rules_accepted_at text"],
  ["users", "latest_terms_accepted_at text"],
  ["profiles", "telegram_verified_at text"],
  ["profiles", "telegram_linked_at text"],
  ["withdrawal_requests", "telegram_chat_id text"],
  ["withdrawal_requests", "telegram_message_id text"],
  ["withdrawal_requests", "telegram_sync_status text not null default 'pending'"],
  ["withdrawal_requests", "telegram_synced_at text"],
  ["withdrawal_requests", "telegram_last_error text"],
  ["withdrawal_requests", "last_action_source text not null default 'system'"],
  ["withdrawal_requests", "last_updated_by_admin_id text"],
  ["withdrawal_requests", "requested_amount integer"],
  ["withdrawal_requests", "base_payout_percent integer not null default 60"],
  ["withdrawal_requests", "bonus_payout_percent integer not null default 0"],
  ["withdrawal_requests", "final_payout_percent integer not null default 60"],
  ["withdrawal_requests", "payout_amount integer"],
  ["withdrawal_requests", "wallet_usdt_bep20 text"],
  ["withdrawal_requests", "status_updated_by text"],
  ["withdrawal_requests", "status_updated_at text"],
  ["admin_logs", "source text not null default 'dashboard'"],
  ["admin_logs", "previous_status text"],
  ["admin_logs", "next_status text"],
  ["admin_logs", "metadata_json text"],
  ["orders", "currency text not null default 'USD'"],
  ["orders", "payment_provider text"],
  ["orders", "transvoucher_transaction_id text"],
  ["orders", "transvoucher_reference_id text"],
  ["orders", "provider_status text"],
  ["orders", "paid_at text"],
  ["payment_sessions", "transvoucher_transaction_id text"],
  ["payment_sessions", "transvoucher_reference_id text"],
  ["payment_sessions", "payment_url text"],
  ["payment_sessions", "provider_status text"],
  ["payment_sessions", "raw_provider_response text"],
  ["deposit_payment_sessions", "transvoucher_transaction_id text"],
  ["deposit_payment_sessions", "transvoucher_reference_id text"],
  ["deposit_payment_sessions", "payment_url text"],
  ["deposit_payment_sessions", "provider_status text"],
  ["deposit_payment_sessions", "raw_provider_response text"],
  ["transactions", "original_amount integer"],
  ["transactions", "original_currency text"],
  ["transactions", "display_currency text"],
  ["transactions", "credited_amount_usd integer"],
  ["transactions", "exchange_rate real"],
  ["transactions", "payment_method text"],
  ["transactions", "payment_provider text"],
  ["transactions", "environment text not null default 'production'"],
  ["transactions", "transvoucher_transaction_id text"],
  ["transactions", "transvoucher_reference_id text"],
  ["transactions", "payment_url text"],
  ["transactions", "provider_status text"],
  ["transactions", "raw_provider_response text"],
  ["transactions", "paid_at text"],
  ["transactions", "provider_checked_at text"],
  ["transactions", "processed_at text"],
  ["transactions", "credited_at text"],
  ["transactions", "next_check_at text"],
  ["transactions", "last_error text"],
  ["transactions", "reconciliation_attempts integer not null default 0"],
  ["notifications", "broadcast_id text"],
  ["notifications", "cta_label text"],
  ["notifications", "cta_url text"],
  ["notifications", "expires_at text"],
  ["notifications", "show_as_popup integer not null default 0"],
  ["notifications", "dismissed_at text"],
  ["deposits", "original_amount integer"],
  ["deposits", "original_currency text"],
  ["deposits", "credited_amount_usd integer"],
  ["deposits", "exchange_rate real"],
  ["deposits", "payment_provider text"],
  ["deposits", "transvoucher_transaction_id text"],
  ["deposits", "transvoucher_reference_id text"],
  ["deposits", "updated_at text"],
  ["deposits", "paid_at text"],
  ["products", "currency text not null default 'USD'"],
  ["products", "default_delivery_type text not null default 'digital'"],
  ["products", "featured integer not null default 0"],
  ["products", "homepage_featured integer not null default 0"],
  ["products", "featured_started_at text"],
  ["products", "image_path text"],
  ["products", "image_updated_at text"],
  ["products", "showcase_float real not null default 1"],
  ["products", "showcase_rotation_seconds integer not null default 12"],
  ["products", "status text not null default 'active'"],
];

const DATA_PATCHES = [
  "update withdrawal_requests set status = 'declined' where status = 'rejected'",
  "update withdrawal_requests set status = 'completed' where status = 'paid'",
  "update withdrawal_requests set telegram_sync_status = 'pending' where telegram_sync_status is null or telegram_sync_status = ''",
  "update withdrawal_requests set last_action_source = 'system' where last_action_source is null or last_action_source = ''",
  `update withdrawal_requests set
    requested_amount = coalesce(requested_amount, amount),
    payout_amount = coalesce(payout_amount, amount),
    wallet_usdt_bep20 = coalesce(wallet_usdt_bep20, wallet_address),
    status_updated_at = coalesce(status_updated_at, updated_at)
   where requested_amount is null
      or payout_amount is null
      or wallet_usdt_bep20 is null
      or status_updated_at is null`,
  "update orders set currency = 'USD' where currency is null or currency = ''",
  "update orders set provider_status = payment_state where provider_status is null or provider_status = ''",
  "update products set currency = 'USD' where currency is null or currency = ''",
  "update deposits set updated_at = created_at where updated_at is null or updated_at = ''",
  "update products set default_delivery_type = 'digital' where default_delivery_type is null or default_delivery_type = ''",
  "update products set status = 'active' where status is null or status = ''",
  "update products set homepage_featured = 0 where homepage_featured is null",
  "update products set showcase_float = 1 where showcase_float is null or showcase_float <= 0",
  "update products set showcase_rotation_seconds = 12 where showcase_rotation_seconds is null or showcase_rotation_seconds <= 0",
];

async function main() {
  const env = await loadEnv();
  const dbConfig = resolveDatabaseConfig(env);
  const db = createClient({
    url: dbConfig.url,
    authToken: dbConfig.authToken,
  });

  const execute = (sql, args = []) => db.execute({ sql, args });
  const queryOne = async (sql, args = []) => {
    const result = await execute(sql, args);
    return result.rows[0] ?? null;
  };

  const ensureColumn = async (table, definition) => {
    try {
      await execute(`alter table ${table} add column ${definition}`);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (
        message.includes("duplicate column name") ||
        message.includes("already exists")
      ) {
        return;
      }

      throw error;
    }
  };

  for (const statement of CREATE_STATEMENTS) {
    await execute(statement);
  }

  for (const [table, definition] of COLUMN_PATCHES) {
    await ensureColumn(table, definition);
  }

  for (const statement of DATA_PATCHES) {
    await execute(statement);
  }

  await execute(
    "create unique index if not exists idx_profiles_telegram_id on profiles(telegram_id) where telegram_id is not null",
  );

  if (shouldSeed) {
    const productsRow = await queryOne("select count(*) as count from products");
    if (Number(productsRow?.count ?? 0) === 0) {
      const timestamp = nowIso();
      const products = await loadSeedProducts();

      for (const product of products) {
        await execute(
          `insert into products (
            id, title, rarity, price, currency, stock, collection, category, description, tagline,
            default_delivery_type, delivery_digital, delivery_physical, edition, shape,
            image_url, image_path, image_updated_at, featured, homepage_featured, featured_started_at, showcase_float,
            showcase_rotation_seconds, status, archived, palette_glow, palette_glow_soft,
            palette_core, palette_ring, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            product.id,
            product.title,
            product.rarity,
            product.price,
            product.currency,
            product.stock,
            product.collection,
            product.category,
            product.description,
            product.tagline,
            product.defaultDeliveryType,
            product.deliveryDigital,
            product.deliveryPhysical,
            product.edition,
            product.shape,
            product.imageUrl,
            product.imagePath ?? null,
            product.imageUpdatedAt ?? null,
            product.featured ? 1 : 0,
            0,
            null,
            1,
            12,
            product.status,
            0,
            product.palette.glow,
            product.palette.glowSoft,
            product.palette.core,
            product.palette.ring,
            timestamp,
            timestamp,
          ],
        );
      }
    }

    const adminUsername = normalizeUsername(env.ADMIN_SEED_USERNAME || "monohrome_admin");
    const adminRow = await queryOne(
      `select users.id
       from users
       inner join profiles on profiles.user_id = users.id
       where users.username = ?
       limit 1`,
      [adminUsername],
    );

    if (!adminRow) {
      const timestamp = nowIso();
      const userId = randomUUID();

      await execute(
        `insert into users (
          id, username, email, name, password_hash, status, created_at, updated_at, last_login_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          adminUsername,
          buildPlaceholderEmail(adminUsername),
          "Archive Admin",
          hashPassword(env.ADMIN_SEED_PASSWORD || "123123nrrN!!"),
          "active",
          timestamp,
          timestamp,
          null,
        ],
      );

      await execute(
    `insert into profiles (
      user_id, role, telegram_username, telegram_id, telegram_chat_id,
      telegram_verified, telegram_verified_at, telegram_linked_at, withdrawal_wallet,
      verified, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          "admin",
          normalizeTelegramUsername(
            env.ADMIN_SEED_TELEGRAM_USERNAME || "@monohrome_admin",
          ),
          null,
          null,
          1,
          timestamp,
          timestamp,
          null,
          1,
          timestamp,
          timestamp,
        ],
      );

      await execute(
        `insert into balances (
          user_id, available, pending_withdrawal, total_deposited, total_spent, total_withdrawn, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?)`,
        [userId, 0, 0, 0, 0, 0, timestamp],
      );
    }
  }

  console.log(
    `[db-setup] Database ready using ${dbConfig.url.startsWith("file:") ? "LOCAL_DATABASE_URL" : "DATABASE_URL"}${shouldSeed ? " with seed data" : ""}.`,
  );
}

main().catch((error) => {
  console.error("[db-setup] failed", error);
  process.exitCode = 1;
});
