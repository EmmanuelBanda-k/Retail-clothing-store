do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pos_app') then
    create role pos_app nologin;
  end if;
end;
$$;

grant pos_app to current_user;
grant usage on schema public to pos_app;
grant usage on type public.user_role, public.sale_status, public.payment_method, public.stock_movement_reason to pos_app;

grant select on public.stores to pos_app;
grant select (id, store_id, username, full_name, role, active, created_at, updated_at) on public.profiles to pos_app;
grant select on public.products, public.product_variants, public.inventory, public.sales, public.sale_items to pos_app;
grant select on public.refunds, public.stock_movements to pos_app;

create function public.session_user_id()
returns uuid language sql stable security invoker set search_path = ''
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create function public.session_store_id()
returns uuid language sql stable security invoker set search_path = ''
as $$ select nullif(current_setting('app.store_id', true), '')::uuid $$;

create function public.session_user_role()
returns public.user_role language sql stable security invoker set search_path = ''
as $$ select nullif(current_setting('app.user_role', true), '')::public.user_role $$;

create policy stores_read_current on public.stores for select to pos_app
using (id = public.session_store_id());

create policy profiles_read_store on public.profiles for select to pos_app
using (store_id = public.session_store_id() and active);

create policy products_read_store on public.products for select to pos_app
using (store_id = public.session_store_id() and active);

create policy variants_read_store on public.product_variants for select to pos_app
using (active and exists (
  select 1 from public.products p
  where p.id = product_id and p.store_id = public.session_store_id()
));

create policy inventory_read_store on public.inventory for select to pos_app
using (store_id = public.session_store_id());

create policy sales_read_store on public.sales for select to pos_app
using (store_id = public.session_store_id());

create policy sale_items_read_store on public.sale_items for select to pos_app
using (exists (
  select 1 from public.sales s
  where s.id = sale_id and s.store_id = public.session_store_id()
));

create policy refunds_read_owner on public.refunds for select to pos_app
using (public.session_user_role() = 'owner' and exists (
  select 1 from public.sales s
  where s.id = sale_id and s.store_id = public.session_store_id()
));

create policy stock_movements_read_management on public.stock_movements for select to pos_app
using (
  store_id = public.session_store_id()
  and public.session_user_role() in ('owner', 'inventory')
);

alter function public.complete_sale(uuid, uuid, public.payment_method, jsonb, timestamptz)
rename to complete_sale_internal;
alter function public.refund_sale(bigint, uuid, text, timestamptz)
rename to refund_sale_internal;

revoke execute on function public.complete_sale_internal(uuid, uuid, public.payment_method, jsonb, timestamptz) from public, pos_app;
revoke execute on function public.refund_sale_internal(bigint, uuid, text, timestamptz) from public, pos_app;

create function public.complete_sale(
  p_store_id uuid,
  p_cashier_id uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_completed_at timestamptz default now()
)
returns public.sales
language plpgsql security definer set search_path = ''
as $$
begin
  if public.session_user_id() <> p_cashier_id
     or public.session_store_id() <> p_store_id
     or public.session_user_role() not in ('owner', 'cashier') then
    raise exception 'Session is not authorised to complete this sale' using errcode = '42501';
  end if;
  return public.complete_sale_internal(p_store_id, p_cashier_id, p_payment_method, p_items, p_completed_at);
end;
$$;

create function public.refund_sale(
  p_sale_id bigint,
  p_authorised_by uuid,
  p_reason text,
  p_refunded_at timestamptz default now()
)
returns public.sales
language plpgsql security definer set search_path = ''
as $$
begin
  if public.session_user_id() <> p_authorised_by or public.session_user_role() <> 'owner' then
    raise exception 'Only the signed-in owner may refund a sale' using errcode = '42501';
  end if;
  return public.refund_sale_internal(p_sale_id, p_authorised_by, p_reason, p_refunded_at);
end;
$$;

create function public.receive_stock(
  p_store_id uuid,
  p_user_id uuid,
  p_variant_id uuid,
  p_quantity integer
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if public.session_user_id() <> p_user_id
     or public.session_store_id() <> p_store_id
     or public.session_user_role() not in ('owner', 'inventory') then
    raise exception 'Session is not authorised to receive stock' using errcode = '42501';
  end if;
  if p_quantity < 1 then raise exception 'Quantity must be positive'; end if;

  update public.inventory set quantity = quantity + p_quantity
  where store_id = p_store_id and variant_id = p_variant_id;
  if not found then raise exception 'Inventory variant was not found'; end if;

  insert into public.stock_movements
    (store_id, variant_id, changed_by, quantity_change, reason, note)
  values (p_store_id, p_variant_id, p_user_id, p_quantity, 'delivery', 'Received through POS inventory screen');
end;
$$;

create function public.add_product(
  p_store_id uuid,
  p_user_id uuid,
  p_name text,
  p_category text,
  p_brand text,
  p_cost numeric,
  p_price numeric,
  p_quantity integer
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_product_id uuid;
  v_variant_id uuid;
  v_base_sku text;
  v_size text;
begin
  if public.session_user_id() <> p_user_id
     or public.session_store_id() <> p_store_id
     or public.session_user_role() not in ('owner', 'inventory') then
    raise exception 'Session is not authorised to add products' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 or p_cost < 0 or p_price <= 0 or p_price < p_cost or p_quantity < 0 then
    raise exception 'Invalid product details';
  end if;

  insert into public.products (store_id, name, category, brand, cost, price)
  values (p_store_id, trim(p_name), trim(p_category), trim(p_brand), p_cost, p_price)
  returning id into v_product_id;
  v_base_sku := 'URB-' || upper(substr(replace(v_product_id::text, '-', ''), 1, 8));

  foreach v_size in array array['S','M','L','XL'] loop
    insert into public.product_variants (product_id, sku, size, colour)
    values (v_product_id, v_base_sku || '-' || v_size, v_size, 'Default')
    returning id into v_variant_id;
    insert into public.inventory (store_id, variant_id, quantity)
    values (p_store_id, v_variant_id, p_quantity);
    if p_quantity > 0 then
      insert into public.stock_movements
        (store_id, variant_id, changed_by, quantity_change, reason, note)
      values (p_store_id, v_variant_id, p_user_id, p_quantity, 'opening_stock', 'Product created through inventory screen');
    end if;
  end loop;
  return v_product_id;
end;
$$;

revoke execute on function public.session_user_id(), public.session_store_id(), public.session_user_role() from public;
revoke execute on function public.complete_sale(uuid, uuid, public.payment_method, jsonb, timestamptz) from public;
revoke execute on function public.refund_sale(bigint, uuid, text, timestamptz) from public;
revoke execute on function public.receive_stock(uuid, uuid, uuid, integer) from public;
revoke execute on function public.add_product(uuid, uuid, text, text, text, numeric, numeric, integer) from public;

grant execute on function public.session_user_id(), public.session_store_id(), public.session_user_role() to pos_app;
grant execute on function public.complete_sale(uuid, uuid, public.payment_method, jsonb, timestamptz) to pos_app;
grant execute on function public.refund_sale(bigint, uuid, text, timestamptz) to pos_app;
grant execute on function public.receive_stock(uuid, uuid, uuid, integer) to pos_app;
grant execute on function public.add_product(uuid, uuid, text, text, text, numeric, numeric, integer) to pos_app;
