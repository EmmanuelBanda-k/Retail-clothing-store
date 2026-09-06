create function public.complete_sale(
  p_store_id uuid,
  p_cashier_id uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_completed_at timestamptz default now()
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_sale public.sales;
  v_total numeric(12,2) := 0;
  v_subtotal numeric(12,2);
  v_product_name text;
  v_sku text;
  v_size text;
  v_colour text;
  v_price numeric(12,2);
  v_available integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale must contain at least one item';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_cashier_id and store_id = p_store_id and active
  ) then
    raise exception 'Cashier is not active at this store';
  end if;

  for v_item in
    select item.variant_id, sum(item.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as item(variant_id uuid, quantity integer)
    group by item.variant_id
    order by item.variant_id
  loop
    if v_item.variant_id is null or v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Every sale item requires a variant and positive quantity';
    end if;

    select p.name, pv.sku, pv.size, pv.colour, p.price, i.quantity
      into v_product_name, v_sku, v_size, v_colour, v_price, v_available
    from public.inventory i
    join public.product_variants pv on pv.id = i.variant_id and pv.active
    join public.products p on p.id = pv.product_id and p.active and p.store_id = p_store_id
    where i.store_id = p_store_id and i.variant_id = v_item.variant_id
    for update of i;

    if not found then
      raise exception 'Variant % is not available at this store', v_item.variant_id;
    end if;
    if v_available < v_item.quantity then
      raise exception 'Insufficient stock for %: requested %, available %', v_sku, v_item.quantity, v_available;
    end if;

    v_total := v_total + (v_price * v_item.quantity);
  end loop;

  v_subtotal := round(v_total / 1.16, 2);

  insert into public.sales (
    store_id, cashier_id, payment_method, subtotal, vat, total, completed_at
  ) values (
    p_store_id, p_cashier_id, p_payment_method,
    v_subtotal, v_total - v_subtotal, v_total, p_completed_at
  ) returning * into v_sale;

  for v_item in
    select item.variant_id, sum(item.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as item(variant_id uuid, quantity integer)
    group by item.variant_id
    order by item.variant_id
  loop
    select p.name, pv.sku, pv.size, pv.colour, p.price
      into v_product_name, v_sku, v_size, v_colour, v_price
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = v_item.variant_id;

    insert into public.sale_items (
      sale_id, variant_id, product_name, sku, size, colour, quantity, unit_price
    ) values (
      v_sale.id, v_item.variant_id, v_product_name, v_sku, v_size,
      v_colour, v_item.quantity, v_price
    );

    update public.inventory
    set quantity = quantity - v_item.quantity
    where store_id = p_store_id and variant_id = v_item.variant_id;

    insert into public.stock_movements (
      store_id, variant_id, sale_id, changed_by, quantity_change, reason
    ) values (
      p_store_id, v_item.variant_id, v_sale.id, p_cashier_id,
      -v_item.quantity, 'sale'
    );
  end loop;

  return v_sale;
end;
$$;

create function public.refund_sale(
  p_sale_id bigint,
  p_authorised_by uuid,
  p_reason text,
  p_refunded_at timestamptz default now()
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_item record;
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A refund reason is required';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then raise exception 'Sale % was not found', p_sale_id; end if;
  if v_sale.status = 'refunded' then raise exception 'Sale % is already refunded', p_sale_id; end if;

  if not exists (
    select 1 from public.profiles
    where id = p_authorised_by and store_id = v_sale.store_id and role = 'owner' and active
  ) then
    raise exception 'Only an active store owner may authorise this refund';
  end if;

  for v_item in
    select variant_id, quantity from public.sale_items where sale_id = p_sale_id order by variant_id
  loop
    update public.inventory
    set quantity = quantity + v_item.quantity
    where store_id = v_sale.store_id and variant_id = v_item.variant_id;

    insert into public.stock_movements (
      store_id, variant_id, sale_id, changed_by, quantity_change, reason
    ) values (
      v_sale.store_id, v_item.variant_id, p_sale_id, p_authorised_by,
      v_item.quantity, 'refund'
    );
  end loop;

  insert into public.refunds (sale_id, authorised_by, reason, amount, created_at)
  values (p_sale_id, p_authorised_by, trim(p_reason), v_sale.total, p_refunded_at);

  update public.sales
  set status = 'refunded', refunded_at = p_refunded_at
  where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;

comment on function public.complete_sale is 'Atomically validates stock, records a sale, deducts inventory, and writes the audit trail.';
comment on function public.refund_sale is 'Atomically records a full refund and restores the sold inventory.';
