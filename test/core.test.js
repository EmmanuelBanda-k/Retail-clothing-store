import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateCartTotals,
  canAccess,
  commitSaleToStore,
  getLowStockProducts,
  refundSaleInStore,
  totalProductStock
} from '../js/core.js';

function createStore(stock = 5) {
  return {
    products: [{
      sku: 'TEST-1', name: 'Test shirt', cost: 100,
      stock: { S: stock, M: 0, L: 0, XL: 0 }
    }],
    sales: []
  };
}

test('calculates VAT-inclusive cart totals', () => {
  assert.deepEqual(
    calculateCartTotals([{ price: 580, qty: 2 }]),
    { gross: 1160, net: 1000, vat: 160 }
  );
});

test('totals stock across clothing sizes', () => {
  assert.equal(totalProductStock({ stock: { S: 2, M: 3, L: 4, XL: 1 } }), 10);
});

test('identifies products at or below the reorder threshold', () => {
  const products = [createStore(8).products[0], { ...createStore(9).products[0], sku: 'TEST-2' }];
  assert.deepEqual(getLowStockProducts(products).map(product => product.sku), ['TEST-1']);
});

test('enforces role permissions', () => {
  assert.equal(canAccess('owner', 'reports'), true);
  assert.equal(canAccess('cashier', 'reports'), false);
  assert.equal(canAccess('inventory', 'stock'), true);
  assert.equal(canAccess('unknown', 'dash'), false);
});

test('commits a sale and deducts stock', () => {
  const store = createStore();
  const result = commitSaleToStore({
    ...store,
    nextSale: 1041,
    items: [{ sku: 'TEST-1', name: 'Test shirt', size: 'S', qty: 2, price: 580 }],
    method: 'Cash',
    cashier: 'Test Cashier',
    when: new Date('2026-09-06T10:00:00Z')
  });

  assert.equal(result.ok, true);
  assert.equal(result.sale.id, 'S1041');
  assert.equal(result.nextSale, 1042);
  assert.equal(store.products[0].stock.S, 3);
  assert.equal(store.sales.length, 1);
  assert.equal(store.sales[0].vat, 160);
});

test('rejects a sale without changing stock when inventory is insufficient', () => {
  const store = createStore(1);
  const result = commitSaleToStore({
    ...store,
    nextSale: 1041,
    items: [{ sku: 'TEST-1', name: 'Test shirt', size: 'S', qty: 2, price: 580 }],
    method: 'Cash', cashier: 'Test Cashier'
  });

  assert.equal(result.ok, false);
  assert.equal(store.products[0].stock.S, 1);
  assert.equal(store.sales.length, 0);
});

test('refunds a sale once and restores stock', () => {
  const store = createStore(3);
  const sale = {
    id: 'S1041', status: 'completed',
    items: [{ sku: 'TEST-1', name: 'Test shirt', size: 'S', qty: 2, price: 580 }]
  };
  store.sales.push(sale);

  const first = refundSaleInStore({
    ...store, id: 'S1041', when: new Date('2026-09-06T11:00:00Z')
  });
  const second = refundSaleInStore({ ...store, id: 'S1041' });

  assert.equal(first.ok, true);
  assert.equal(store.products[0].stock.S, 5);
  assert.equal(sale.status, 'refunded');
  assert.equal(second.ok, false);
  assert.equal(store.products[0].stock.S, 5);
});
