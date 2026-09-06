insert into public.stores (id, code, name, currency_code)
values ('10000000-0000-0000-0000-000000000001', 'LUSAKA', 'Urban Clothing Lusaka', 'ZMW')
on conflict (id) do nothing;

with catalogue(name, category, brand, cost, price, sku_prefix, stocks) as (
  values
    ('Oxford shirt, long sleeve', 'Men', 'Kaunda Tailors', 300.00, 480.00, 'URB-1001', array[6,9,4,2]),
    ('Straight leg denim jeans', 'Men', 'Blue Ridge', 470.00, 750.00, 'URB-1002', array[3,7,6,5]),
    ('Cotton crew neck tee', 'Men', 'Urban Basics', 130.00, 250.00, 'URB-1003', array[14,18,11,7]),
    ('Chitenge wrap skirt', 'Women', 'Kabwata Prints', 240.00, 420.00, 'URB-2001', array[5,8,6,3]),
    ('Fitted blouse, short sleeve', 'Women', 'Zani Couture', 220.00, 390.00, 'URB-2002', array[2,4,2,1]),
    ('A line midi dress', 'Women', 'Zani Couture', 550.00, 890.00, 'URB-2003', array[3,5,4,2]),
    ('School polo shirt', 'Kids', 'Urban Basics', 95.00, 190.00, 'URB-3001', array[22,19,12,0]),
    ('Kids denim shorts', 'Kids', 'Blue Ridge', 160.00, 280.00, 'URB-3002', array[9,6,1,0]),
    ('Quilted winter jacket', 'Outerwear', 'Blue Ridge', 820.00, 1250.00, 'URB-4001', array[2,3,2,1]),
    ('Knitted pullover', 'Outerwear', 'Kaunda Tailors', 400.00, 660.00, 'URB-4002', array[4,6,5,3])
), inserted_products as (
  insert into public.products (id, store_id, name, category, brand, cost, price)
  select extensions.gen_random_uuid(), '10000000-0000-0000-0000-000000000001', name, category, brand, cost, price
  from catalogue
  returning id, name
), variants as (
  insert into public.product_variants (id, product_id, sku, size, colour)
  select extensions.gen_random_uuid(), p.id, c.sku_prefix || '-' || sizes.size, sizes.size, 'Default'
  from catalogue c
  join inserted_products p using (name)
  cross join (values ('S',1),('M',2),('L',3),('XL',4)) as sizes(size, position)
  returning id, product_id, size
)
insert into public.inventory (store_id, variant_id, quantity, reorder_level)
select
  '10000000-0000-0000-0000-000000000001',
  v.id,
  c.stocks[array_position(array['S','M','L','XL'], v.size)],
  2
from variants v
join inserted_products p on p.id = v.product_id
join catalogue c using (name);

insert into public.stock_movements (store_id, variant_id, quantity_change, reason, note)
select store_id, variant_id, quantity, 'opening_stock', 'Sprint 2 demonstration seed'
from public.inventory
where quantity > 0;
