begin;
select plan(26);

select has_table('public', 'stores', 'stores table exists');
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'products', 'products table exists');
select has_table('public', 'product_variants', 'product variants table exists');
select has_table('public', 'inventory', 'inventory table exists');
select has_table('public', 'sales', 'sales table exists');
select has_table('public', 'sale_items', 'sale items table exists');
select has_table('public', 'refunds', 'refunds table exists');
select has_table('public', 'stock_movements', 'stock movements table exists');

select col_is_pk('public', 'stores', 'id', 'stores has a primary key');
select col_is_pk('public', 'profiles', 'id', 'profiles has a primary key');
select col_is_pk('public', 'products', 'id', 'products has a primary key');
select col_is_pk('public', 'product_variants', 'id', 'variants have a primary key');
select col_is_pk('public', 'sales', 'id', 'sales has a primary key');

select has_column('public', 'product_variants', 'size', 'variants record clothing size');
select has_column('public', 'product_variants', 'colour', 'variants record colour');
select has_column('public', 'inventory', 'reorder_level', 'inventory records reorder levels');
select has_column('public', 'sales', 'vat', 'sales record VAT');
select has_column('public', 'stock_movements', 'quantity_change', 'stock audit records quantity changes');

select has_function('public', 'complete_sale', array['uuid','uuid','public.payment_method','jsonb','timestamp with time zone'], 'complete sale function exists');
select has_function('public', 'refund_sale', array['bigint','uuid','text','timestamp with time zone'], 'refund sale function exists');

select row_security_active('public', 'stores', 'RLS is active on stores');
select row_security_active('public', 'products', 'RLS is active on products');
select row_security_active('public', 'sales', 'RLS is active on sales');
select row_security_active('public', 'refunds', 'RLS is active on refunds');
select row_security_active('public', 'stock_movements', 'RLS is active on stock movements');

select * from finish();
rollback;
