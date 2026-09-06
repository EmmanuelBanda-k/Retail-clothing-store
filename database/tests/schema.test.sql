do $$
declare
  missing_tables text[];
begin
  select array_agg(expected.name order by expected.name)
  into missing_tables
  from (values
    ('inventory'), ('product_variants'), ('products'), ('profiles'), ('refunds'),
    ('sale_items'), ('sales'), ('stock_movements'), ('stores')
  ) as expected(name)
  where to_regclass('public.' || expected.name) is null;

  if missing_tables is not null then
    raise exception 'Missing tables: %', missing_tables;
  end if;

  if to_regprocedure('public.complete_sale(uuid,uuid,public.payment_method,jsonb,timestamp with time zone)') is null then
    raise exception 'complete_sale function is missing';
  end if;

  if to_regprocedure('public.refund_sale(bigint,uuid,text,timestamp with time zone)') is null then
    raise exception 'refund_sale function is missing';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('stores','profiles','products','product_variants','inventory','sales','sale_items','refunds','stock_movements')
      and not c.relrowsecurity
  ) then
    raise exception 'Row Level Security is not enabled on every application table';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'product_variants' and column_name = 'colour'
  ) then
    raise exception 'Product variants must record colour';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory' and column_name = 'reorder_level'
  ) then
    raise exception 'Inventory must record reorder levels';
  end if;

  raise notice 'Schema tests passed';
end;
$$;
