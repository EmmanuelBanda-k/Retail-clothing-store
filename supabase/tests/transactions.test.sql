begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local', ''),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cashier@test.local', '');

insert into public.profiles (id, store_id, full_name, role)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Test Owner', 'owner'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Test Cashier', 'cashier');

create temporary table test_context as
select variant_id, quantity as opening_quantity
from public.inventory
where quantity >= 2
order by variant_id
limit 1;

select lives_ok(
  format(
    $$select public.complete_sale(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002',
      'cash',
      '[{"variant_id":"%s","quantity":2}]'::jsonb,
      '2026-09-06T10:00:00Z'
    )$$,
    (select variant_id from test_context)
  ),
  'a valid sale completes'
);

select is((select count(*) from public.sales), 1::bigint, 'sale is recorded');
select is((select count(*) from public.sale_items), 1::bigint, 'sale item is recorded');
select is((select total from public.sales limit 1), (select line_total from public.sale_items limit 1), 'sale total matches its line');
select is(
  (select i.quantity from public.inventory i join test_context t on t.variant_id = i.variant_id),
  (select opening_quantity - 2 from test_context),
  'sale deducts inventory'
);
select is((select count(*) from public.stock_movements where reason = 'sale'), 1::bigint, 'sale movement is recorded');

select throws_ok(
  format(
    $$select public.complete_sale(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002',
      'cash',
      '[{"variant_id":"%s","quantity":999999}]'::jsonb
    )$$,
    (select variant_id from test_context)
  ),
  'P0001', null,
  'insufficient stock rejects the sale'
);

select lives_ok(
  $$select public.refund_sale(
    (select id from public.sales limit 1),
    '20000000-0000-0000-0000-000000000001',
    'Test return',
    '2026-09-06T11:00:00Z'
  )$$,
  'an owner can refund the sale'
);

select is((select status::text from public.sales limit 1), 'refunded', 'sale is marked refunded');
select is((select count(*) from public.refunds), 1::bigint, 'refund record is created');
select is(
  (select i.quantity from public.inventory i join test_context t on t.variant_id = i.variant_id),
  (select opening_quantity from test_context),
  'refund restores inventory'
);
select is((select count(*) from public.stock_movements where reason = 'refund'), 1::bigint, 'refund movement is recorded');

select * from finish();
rollback;
