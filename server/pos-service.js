const PAYMENT_METHODS = {
  Cash: 'cash',
  'Mobile money': 'mobile_money',
  Card: 'card'
};

const PAYMENT_LABELS = {
  cash: 'Cash',
  mobile_money: 'Mobile money',
  card: 'Card'
};

const numeric = value => Number(value);

export function createPosService(database) {
  async function loadProducts(storeId) {
    const { rows } = await database.query(`
      select p.id, p.name, p.category as cat, p.brand,
             p.cost::float8 as cost, p.price::float8 as price,
             regexp_replace(min(pv.sku), '-(S|M|L|XL)$', '') as sku,
             jsonb_object_agg(pv.size, i.quantity) as stock,
             jsonb_object_agg(pv.size, pv.id) as variant_ids
      from public.products p
      join public.product_variants pv on pv.product_id = p.id and pv.active
      join public.inventory i on i.variant_id = pv.id and i.store_id = p.store_id
      where p.store_id = $1 and p.active
      group by p.id
      order by p.name
    `, [storeId]);
    return rows;
  }

  async function loadSales(storeId) {
    const { rows: sales } = await database.query(`
      select s.id, s.receipt_number, s.completed_at as at, s.status,
             s.total::float8 as total, s.vat::float8 as vat,
             s.payment_method, coalesce(p.full_name, 'Former user') as cashier
      from public.sales s
      left join public.profiles p on p.id = s.cashier_id
      where s.store_id = $1
      order by s.completed_at
    `, [storeId]);

    if (!sales.length) return [];
    const { rows: items } = await database.query(`
      select si.sale_id, si.variant_id, si.product_name as name,
             regexp_replace(si.sku, '-(S|M|L|XL)$', '') as sku,
             si.size, si.quantity as qty, si.unit_price::float8 as price
      from public.sale_items si
      where si.sale_id = any($1::bigint[])
      order by si.id
    `, [sales.map(sale => sale.id)]);

    return sales.map(sale => ({
      id: sale.receipt_number,
      databaseId: sale.id,
      at: sale.at,
      status: sale.status,
      total: numeric(sale.total),
      vat: numeric(sale.vat),
      method: PAYMENT_LABELS[sale.payment_method],
      cashier: sale.cashier,
      items: items.filter(item => item.sale_id === sale.id)
    }));
  }

  async function snapshot(storeId) {
    const [products, sales] = await Promise.all([loadProducts(storeId), loadSales(storeId)]);
    return { products, sales, persistent: true };
  }

  return {
    async health() {
      const { rows } = await database.query('select current_database() as database, now() as checked_at');
      return { ok: true, ...rows[0] };
    },

    async login(username, pin) {
      const { rows } = await database.query(`
        select p.id, p.store_id, p.username as u, p.full_name as name,
               split_part(p.full_name, ' ', 1) as first, p.role
        from public.profiles p
        where p.username = lower($1) and p.active
          and p.password_hash = extensions.crypt($2, p.password_hash)
      `, [username, pin]);
      return rows[0] || null;
    },

    snapshot,

    async completeSale({ storeId, cashierId, method, items }) {
      const paymentMethod = PAYMENT_METHODS[method];
      if (!paymentMethod) throw Object.assign(new Error('Unsupported payment method'), { statusCode: 400 });
      const payload = items.map(item => ({ variant_id: item.variantId, quantity: item.qty }));
      const { rows } = await database.query(
        'select * from public.complete_sale($1, $2, $3::public.payment_method, $4::jsonb)',
        [storeId, cashierId, paymentMethod, JSON.stringify(payload)]
      );
      const data = await snapshot(storeId);
      return { sale: data.sales.find(sale => sale.databaseId === rows[0].id), snapshot: data };
    },

    async refundSale({ saleId, ownerId, reason }) {
      const { rows } = await database.query(
        'select * from public.refund_sale($1, $2, $3)',
        [saleId, ownerId, reason]
      );
      return snapshot(rows[0].store_id);
    },

    async receiveStock({ storeId, userId, variantId, quantity }) {
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw Object.assign(new Error('Quantity must be a positive whole number'), { statusCode: 400 });
      }
      await database.transaction(async client => {
        const updated = await client.query(`
          update public.inventory
          set quantity = quantity + $1
          where store_id = $2 and variant_id = $3
          returning variant_id
        `, [quantity, storeId, variantId]);
        if (!updated.rowCount) throw Object.assign(new Error('Inventory variant was not found'), { statusCode: 404 });
        await client.query(`
          insert into public.stock_movements
            (store_id, variant_id, changed_by, quantity_change, reason, note)
          values ($1, $2, $3, $4, 'delivery', 'Received through POS inventory screen')
        `, [storeId, variantId, userId, quantity]);
      });
      return snapshot(storeId);
    },

    async addProduct({ storeId, userId, name, category, brand, cost, price, quantity }) {
      if (!name?.trim() || !category?.trim() || !brand?.trim() || !(price > 0) || cost < 0 || price < cost) {
        throw Object.assign(new Error('Enter valid product details; selling price must cover cost'), { statusCode: 400 });
      }
      const initialQuantity = Number.isInteger(quantity) && quantity >= 0 ? quantity : 0;
      await database.transaction(async client => {
        const product = await client.query(`
          insert into public.products (store_id, name, category, brand, cost, price)
          values ($1, $2, $3, $4, $5, $6)
          returning id
        `, [storeId, name.trim(), category.trim(), brand.trim(), cost, price]);
        const baseSku = `URB-${product.rows[0].id.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
        for (const size of ['S', 'M', 'L', 'XL']) {
          const variant = await client.query(`
            insert into public.product_variants (product_id, sku, size, colour)
            values ($1, $2, $3, 'Default') returning id
          `, [product.rows[0].id, `${baseSku}-${size}`, size]);
          await client.query(`
            insert into public.inventory (store_id, variant_id, quantity)
            values ($1, $2, $3)
          `, [storeId, variant.rows[0].id, initialQuantity]);
          if (initialQuantity > 0) {
            await client.query(`
              insert into public.stock_movements
                (store_id, variant_id, changed_by, quantity_change, reason, note)
              values ($1, $2, $3, $4, 'opening_stock', 'Product created through inventory screen')
            `, [storeId, variant.rows[0].id, userId, initialQuantity]);
          }
        }
      });
      return snapshot(storeId);
    }
  };
}
