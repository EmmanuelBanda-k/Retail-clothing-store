create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.user_role as enum ('owner', 'cashier', 'inventory');
create type public.sale_status as enum ('completed', 'refunded');
create type public.payment_method as enum ('cash', 'mobile_money', 'card');
create type public.stock_movement_reason as enum ('opening_stock', 'sale', 'refund', 'delivery', 'adjustment');

create table public.stores (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]+$'),
  name text not null check (length(trim(name)) > 0),
  currency_code char(3) not null default 'ZMW',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  username text not null unique check (username ~ '^[a-z0-9._-]+$'),
  password_hash text not null,
  full_name text not null check (length(trim(full_name)) > 0),
  role public.user_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  name text not null check (length(trim(name)) > 0),
  category text not null check (length(trim(category)) > 0),
  brand text not null check (length(trim(brand)) > 0),
  cost numeric(12,2) not null check (cost >= 0),
  price numeric(12,2) not null check (price >= 0 and price >= cost),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default extensions.gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique check (length(trim(sku)) > 0),
  size text not null check (size in ('S', 'M', 'L', 'XL')),
  colour text not null default 'Default' check (length(trim(colour)) > 0),
  barcode text unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, size, colour)
);

create table public.inventory (
  store_id uuid not null references public.stores(id),
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  reorder_level integer not null default 2 check (reorder_level >= 0),
  updated_at timestamptz not null default now(),
  primary key (store_id, variant_id)
);

create table public.sales (
  id bigint generated always as identity primary key,
  receipt_number text generated always as ('S' || lpad(id::text, 6, '0')) stored unique,
  store_id uuid not null references public.stores(id),
  cashier_id uuid references public.profiles(id),
  payment_method public.payment_method not null,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  vat numeric(12,2) not null check (vat >= 0),
  total numeric(12,2) not null check (total >= 0 and total = subtotal + vat),
  status public.sale_status not null default 'completed',
  completed_at timestamptz not null default now(),
  refunded_at timestamptz,
  check ((status = 'completed' and refunded_at is null) or (status = 'refunded' and refunded_at is not null))
);

create table public.sale_items (
  id bigint generated always as identity primary key,
  sale_id bigint not null references public.sales(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id),
  product_name text not null,
  sku text not null,
  size text not null,
  colour text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) generated always as (quantity * unit_price) stored,
  unique (sale_id, variant_id)
);

create table public.refunds (
  id bigint generated always as identity primary key,
  sale_id bigint not null unique references public.sales(id) on delete restrict,
  authorised_by uuid references public.profiles(id),
  reason text not null check (length(trim(reason)) > 0),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id),
  variant_id uuid not null references public.product_variants(id),
  sale_id bigint references public.sales(id),
  changed_by uuid references public.profiles(id),
  quantity_change integer not null check (quantity_change <> 0),
  reason public.stock_movement_reason not null,
  note text,
  created_at timestamptz not null default now()
);

create index products_store_category_idx on public.products(store_id, category) where active;
create index product_variants_product_idx on public.product_variants(product_id) where active;
create index inventory_low_stock_idx on public.inventory(store_id, quantity, reorder_level);
create index sales_store_completed_idx on public.sales(store_id, completed_at desc);
create index sale_items_sale_idx on public.sale_items(sale_id);
create index stock_movements_variant_created_idx on public.stock_movements(variant_id, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger stores_set_updated_at before update on public.stores
for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants
for each row execute function public.set_updated_at();
create trigger inventory_set_updated_at before update on public.inventory
for each row execute function public.set_updated_at();

alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.refunds enable row level security;
alter table public.stock_movements enable row level security;

revoke execute on all functions in schema public from public;
alter default privileges in schema public revoke execute on functions from public;

comment on table public.stock_movements is 'Immutable audit trail for every inventory change.';
comment on column public.sales.total is 'VAT-inclusive transaction total in the store currency.';
