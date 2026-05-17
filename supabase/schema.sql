create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text not null unique,
  name text not null,
  password_hash text not null,
  status text not null check (status in ('active', 'suspended')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  role text not null check (role in ('user', 'admin')) default 'user',
  telegram_username text not null unique,
  telegram_id text,
  withdrawal_wallet text,
  verified boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.balances (
  user_id uuid primary key references public.users(id) on delete cascade,
  available integer not null default 0,
  pending_withdrawal integer not null default 0,
  total_deposited integer not null default 0,
  total_spent integer not null default 0,
  total_withdrawn integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.products (
  id text primary key,
  title text not null,
  rarity text not null check (rarity in ('Legendary', 'Epic', 'Rare')),
  price integer not null,
  stock integer not null,
  collection text not null,
  category text not null,
  description text not null,
  tagline text not null,
  delivery_digital text not null,
  delivery_physical text not null,
  edition text not null,
  shape text not null check (shape in ('spire', 'void', 'halo', 'crescent', 'shard')),
  image_url text,
  archived boolean not null default false,
  palette_glow text not null,
  palette_glow_soft text not null,
  palette_core text not null,
  palette_ring text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null check (status in ('Completed', 'Processing', 'Pending', 'Declined')),
  payment_state text not null check (payment_state in ('completed', 'pending', 'failed')),
  subtotal integer not null,
  shipping integer not null,
  total integer not null,
  shipping_name text not null,
  shipping_email text not null,
  shipping_address text not null,
  shipping_city text not null,
  shipping_postal_code text not null,
  payment_method text not null,
  failure_reason text,
  remaining_balance integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id) on delete restrict,
  quantity integer not null,
  unit_price integer not null,
  delivery_type text not null check (delivery_type in ('digital', 'physical'))
);

create table if not exists public.owned_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product_id text not null references public.products(id) on delete restrict,
  order_id text not null references public.orders(id) on delete cascade,
  quantity integer not null,
  acquired_at timestamptz not null default now()
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  quantity integer not null,
  delivery_type text not null check (delivery_type in ('digital', 'physical')),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('deposit', 'purchase', 'withdrawal')),
  amount integer not null,
  status text not null check (status in ('completed', 'pending', 'failed')),
  reference_id text not null,
  summary text not null,
  meta_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deposits (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  amount integer not null,
  payment_method text not null,
  cardholder_name text not null,
  card_masked text not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  balance_before integer not null,
  balance_after integer not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.withdrawal_requests (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  amount integer not null,
  wallet_address text not null,
  telegram_id text not null,
  status text not null check (status in ('pending', 'approved', 'rejected', 'paid')),
  source_deposit_id text references public.deposits(id) on delete set null,
  source_card_masked text,
  source_cardholder_name text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.users(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_user_id on public.orders(user_id);
create index if not exists idx_owned_cards_user_id on public.owned_cards(user_id);
create index if not exists idx_transactions_user_id on public.transactions(user_id);
create index if not exists idx_deposits_user_id on public.deposits(user_id);
create index if not exists idx_withdrawals_user_id on public.withdrawal_requests(user_id);
create index if not exists idx_cart_items_user_id on public.cart_items(user_id);
