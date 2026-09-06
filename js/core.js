export const SIZES = Object.freeze(['S', 'M', 'L', 'XL']);
export const VAT_RATE = 0.16;
export const LOW_STOCK_THRESHOLD = 8;

export const PERMISSIONS = Object.freeze({
  owner: Object.freeze(['dash', 'till', 'stock', 'reports', 'sales', 'project']),
  cashier: Object.freeze(['dash', 'till', 'sales', 'project']),
  inventory: Object.freeze(['dash', 'stock', 'reports', 'project'])
});

export function calculateCartTotals(lines, vatRate = VAT_RATE) {
  const gross = lines.reduce((total, line) => total + line.price * line.qty, 0);
  const net = Math.round(gross / (1 + vatRate));
  return { gross, net, vat: gross - net };
}

export function totalProductStock(product) {
  return SIZES.reduce((total, size) => total + (product.stock[size] || 0), 0);
}

export function calculateStockValue(products) {
  return products.reduce(
    (total, product) => total + totalProductStock(product) * product.cost,
    0
  );
}

export function getLowStockProducts(products, threshold = LOW_STOCK_THRESHOLD) {
  return products.filter(product => totalProductStock(product) <= threshold);
}

export function canAccess(role, view) {
  return Boolean(PERMISSIONS[role]?.includes(view));
}

export function commitSaleToStore({
  products,
  sales,
  nextSale,
  items,
  method,
  cashier,
  when = new Date()
}) {
  for (const item of items) {
    const product = products.find(candidate => candidate.sku === item.sku);
    const available = product?.stock[item.size] || 0;
    if (available < item.qty) {
      return { ok: false, msg: `Not enough stock for ${item.name}` };
    }
  }

  items.forEach(item => {
    products.find(product => product.sku === item.sku).stock[item.size] -= item.qty;
  });

  const totals = calculateCartTotals(items);
  const sale = {
    id: `S${nextSale}`,
    at: when.toISOString(),
    cashier,
    method,
    items: structuredClone(items),
    total: totals.gross,
    vat: totals.vat,
    status: 'completed'
  };

  sales.push(sale);
  return { ok: true, sale, nextSale: nextSale + 1 };
}

export function refundSaleInStore({ products, sales, id, when = new Date() }) {
  const sale = sales.find(candidate => candidate.id === id);
  if (!sale) return { ok: false, msg: 'Sale not found' };
  if (sale.status === 'refunded') return { ok: false, msg: 'Sale already refunded' };

  sale.items.forEach(item => {
    const product = products.find(candidate => candidate.sku === item.sku);
    if (product) product.stock[item.size] += item.qty;
  });

  sale.status = 'refunded';
  sale.refundedAt = when.toISOString();
  return { ok: true, sale };
}
