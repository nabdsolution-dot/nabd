-- Customers, on-account sales, loyalty points, and promotions.

create table customers (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  birthday date,
  credit_limit_cents integer not null default 0 check (credit_limit_cents >= 0),
  points integer not null default 0 check (points >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customers_phone_idx on customers (phone) where phone is not null;

-- Every change to what a customer owes (amount_cents, positive = owes more) or to their points.
create table customer_ledger (
  id bigserial primary key,
  customer_id uuid not null references customers(id),
  kind text not null check (kind in ('sale', 'payment', 'refund', 'adjustment')),
  amount_cents integer not null default 0,
  points integer not null default 0,
  ref text,
  sale_id uuid references sales(id),
  store_id uuid references stores(id),
  user_id uuid references users(id),
  method text,
  note text,
  created_at timestamptz not null default now()
);
create index customer_ledger_customer_idx on customer_ledger (customer_id, created_at);

alter table sales add column customer_id uuid references customers(id);
alter table sales add column points_earned integer not null default 0;
alter table sales add column points_redeemed integer not null default 0;
alter table sales add column points_discount_cents integer not null default 0;
alter table sales add column order_discount_cents integer;
update sales set order_discount_cents = discount_cents;
alter table sales alter column order_discount_cents set not null;
alter table sales alter column order_discount_cents set default 0;
alter table sales drop constraint if exists sales_tender_check;
alter table sales add constraint sales_tender_check check (tender in ('usd', 'lbp', 'card', 'account'));
alter table returns drop constraint if exists returns_tender_check;
alter table returns add constraint returns_tender_check check (tender in ('usd', 'lbp', 'card', 'account'));

alter table sale_lines add column discount_cents integer not null default 0;
alter table sale_lines add column promo_cents integer not null default 0;
alter table sale_lines add column promo_id uuid;

-- kind 'bundle': any `qty` items from the list cost `price_cents` together (mix and match).
-- kind 'percent': buy `qty` or more from the list and get `percent` off those items.
-- kind 'buy_get': in every group of `qty` items from the list, the cheapest is `percent` off (100 = free).
create table promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('bundle', 'percent', 'buy_get')),
  product_ids uuid[] not null default '{}',
  qty integer not null default 2 check (qty >= 1),
  price_cents integer check (price_cents >= 0),
  percent integer check (percent between 1 and 100),
  active boolean not null default true,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

insert into settings (key, value) values
  ('loyalty_enabled', '1'),
  ('loyalty_earn_per_usd', '1'),
  ('loyalty_point_value_cents', '1')
on conflict (key) do nothing;
