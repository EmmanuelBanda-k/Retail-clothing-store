import test from 'node:test';
import assert from 'node:assert/strict';

import { createDatabase } from '../server/database.js';
import { createPosService } from '../server/pos-service.js';

const connectionString = process.env.DATABASE_URL;

test('PostgreSQL API service persists a sale and refund', { skip: !connectionString }, async () => {
  const database = createDatabase(connectionString);
  const service = createPosService(database);
  try {
    const cashier = await service.login('vernon', '1234');
    const owner = await service.login('nkosinathi', '1234');
    assert.equal(cashier.role, 'cashier');
    assert.equal(owner.role, 'owner');

    const cashierSession = { userId: cashier.id, storeId: cashier.store_id, role: cashier.role, name: cashier.name };
    const ownerSession = { userId: owner.id, storeId: owner.store_id, role: owner.role, name: owner.name };
    const before = await service.snapshot(cashierSession);
    const product = before.products.find(item => item.stock.S > 0);
    const startingStock = product.stock.S;

    const completed = await service.completeSale(cashierSession, {
      method: 'Cash',
      items: [{ variantId: product.variant_ids.S, qty: 1 }]
    });
    assert.equal(completed.sale.status, 'completed');
    assert.equal(
      completed.snapshot.products.find(item => item.id === product.id).stock.S,
      startingStock - 1
    );

    await assert.rejects(
      service.refundSale(cashierSession, {
        saleId: completed.sale.databaseId,
        reason: 'Cashier must not authorise this'
      }),
      error => error.code === '42501'
    );

    const refunded = await service.refundSale(ownerSession, {
      saleId: completed.sale.databaseId,
      reason: 'Automated API integration test'
    });
    assert.equal(
      refunded.sales.find(item => item.databaseId === completed.sale.databaseId).status,
      'refunded'
    );
    assert.equal(refunded.products.find(item => item.id === product.id).stock.S, startingStock);
  } finally {
    await database.close();
  }
});
