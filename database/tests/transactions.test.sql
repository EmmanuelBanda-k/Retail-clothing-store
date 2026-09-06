begin;

select set_config('app.user_id', '20000000-0000-0000-0000-000000000002', true);
select set_config('app.store_id', '10000000-0000-0000-0000-000000000001', true);
select set_config('app.user_role', 'cashier', true);

do $$
declare
  v_variant_id uuid;
  v_opening_quantity integer;
  v_sale public.sales;
  v_failed boolean := false;
begin
  select variant_id, quantity
  into v_variant_id, v_opening_quantity
  from public.inventory
  where quantity >= 2
  order by variant_id
  limit 1;

  if v_variant_id is null then
    raise exception 'Seed data has no variant with enough stock for testing';
  end if;

  select * into v_sale
  from public.complete_sale(
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    'cash',
    jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 2)),
    '2026-09-06T10:00:00Z'
  );

  if v_sale.status <> 'completed' then raise exception 'Sale status was not completed'; end if;
  if (select count(*) from public.sale_items where sale_id = v_sale.id) <> 1 then raise exception 'Sale item was not recorded'; end if;
  if (select quantity from public.inventory where store_id = v_sale.store_id and variant_id = v_variant_id) <> v_opening_quantity - 2 then
    raise exception 'Sale did not deduct inventory';
  end if;
  if (select count(*) from public.stock_movements where sale_id = v_sale.id and reason = 'sale') <> 1 then
    raise exception 'Sale stock movement was not recorded';
  end if;

  begin
    perform public.complete_sale(
      v_sale.store_id,
      '20000000-0000-0000-0000-000000000002',
      'cash',
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 999999))
    );
  exception when others then
    v_failed := true;
  end;
  if not v_failed then raise exception 'Insufficient stock was accepted'; end if;

  v_failed := false;
  begin
    perform public.refund_sale(v_sale.id, '20000000-0000-0000-0000-000000000002', 'Forbidden cashier refund');
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then raise exception 'Cashier was allowed to refund a sale'; end if;

  perform set_config('app.user_id', '20000000-0000-0000-0000-000000000001', true);
  perform set_config('app.user_role', 'owner', true);

  select * into v_sale
  from public.refund_sale(
    v_sale.id,
    '20000000-0000-0000-0000-000000000001',
    'Automated transaction test',
    '2026-09-06T11:00:00Z'
  );

  if v_sale.status <> 'refunded' then raise exception 'Sale was not marked refunded'; end if;
  if (select quantity from public.inventory where store_id = v_sale.store_id and variant_id = v_variant_id) <> v_opening_quantity then
    raise exception 'Refund did not restore inventory';
  end if;
  if (select count(*) from public.refunds where sale_id = v_sale.id) <> 1 then raise exception 'Refund record was not created'; end if;
  if (select count(*) from public.stock_movements where sale_id = v_sale.id and reason = 'refund') <> 1 then
    raise exception 'Refund stock movement was not recorded';
  end if;

  raise notice 'Transaction tests passed';
end;
$$;

rollback;
