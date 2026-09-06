import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionManager } from '../server/session.js';

const secret = 'test-secret-that-is-at-least-32-characters-long';
const user = {
  id: '20000000-0000-0000-0000-000000000001',
  store_id: '10000000-0000-0000-0000-000000000001',
  role: 'owner',
  name: 'Test Owner'
};

test('creates and verifies an HTTP-only signed session', () => {
  const sessions = createSessionManager(secret);
  const cookie = sessions.create(user);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const session = sessions.read({ headers: { cookie: cookie.split(';')[0] } });
  assert.equal(session.userId, user.id);
  assert.equal(session.storeId, user.store_id);
  assert.equal(session.role, 'owner');
});

test('rejects a modified session signature', () => {
  const sessions = createSessionManager(secret);
  const cookie = sessions.create(user).split(';')[0];
  const tampered = `${cookie.slice(0, -1)}${cookie.endsWith('A') ? 'B' : 'A'}`;
  assert.equal(sessions.read({ headers: { cookie: tampered } }), null);
});

test('requires a strong session secret', () => {
  assert.throws(() => createSessionManager('short'), /at least 32 characters/);
});
