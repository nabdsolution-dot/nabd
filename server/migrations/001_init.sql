
create table stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table tills (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  name text not null,
  app_version text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  unique (store_id, name)
);

create table roles (
  id text primary key,
  name text not null
);

create table role_permissions (
  role_id text not null references roles(id),
  permission text not null,
  requires_pin boolean not null default false,
  primary key (role_id, permission)
);

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  role_id text not null references roles(id),
  store_id uuid references stores(id),
  password_hash text,
  pin_hash text,
  active boolean not null default true,
  last_active_at timestamptz,
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  barcode text unique,
  category_id uuid references categories(id),
  price_cents integer not null check (price_cents >= 0),
  vat_bp integer not null default 1100 check (vat_bp between 0 and 10000),
  reorder_level integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table stock (
  product_id uuid not null references products(id),
  store_id uuid not null references stores(id),
  qty integer not null default 0,
  primary key (product_id, store_id)
);

create table settings (
  key text primary key,
  value text not null
);

create table sales (
  id uuid primary key,
  store_id uuid not null references stores(id),
  till_id uuid references tills(id),
  cashier_id uuid references users(id),
  receipt_no text not null,
  subtotal_cents integer not null,
  discount_cents integer not null default 0,
  vat_cents integer not null,
  total_cents integer not null,
  tender text not null check (tender in ('usd','lbp','card')),
  lbp_rate integer not null,
  sold_at timestamptz not null,
  uploaded_at timestamptz not null default now(),
  unique (store_id, receipt_no)
);

create table sale_lines (
  id bigserial primary key,
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid references products(id),
  name text not null,
  qty integer not null check (qty > 0),
  unit_cents integer not null
);

create index sales_sold_at_idx on sales (sold_at);
create index sale_lines_sale_idx on sale_lines (sale_id);

create table audit_log (
  id bigserial primary key,
  user_id uuid references users(id),
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb,
  at timestamptz not null default now()
);
