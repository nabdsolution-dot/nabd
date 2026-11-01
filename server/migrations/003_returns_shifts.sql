create table returns (
  id uuid primary key,
  sale_id uuid not null references sales(id),
  store_id uuid not null references stores(id),
  till_id uuid references tills(id),
  cashier_id uuid references users(id),
  approved_by uuid references users(id),
  receipt_no text not null,
  refund_cents integer not null,
  tender text not null check (tender in ('usd','lbp','card')),
  lbp_rate integer not null,
  reason text,
  returned_at timestamptz not null default now(),
  unique (store_id, receipt_no)
);

create table return_lines (
  id bigserial primary key,
  return_id uuid not null references returns(id) on delete cascade,
  product_id uuid references products(id),
  name text not null,
  qty integer not null check (qty > 0),
  unit_cents integer not null
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  till_id uuid not null references tills(id),
  cashier_id uuid not null references users(id),
  opened_at timestamptz not null default now(),
  float_usd_cents integer not null default 0,
  closed_at timestamptz,
  closed_by uuid references users(id),
  expected_usd_cents integer,
  expected_lbp bigint,
  expected_card_cents integer,
  counted_usd_cents integer,
  counted_lbp bigint,
  counted_card_cents integer,
  note text
);
create unique index one_open_shift_per_till on shifts (till_id) where closed_at is null;
